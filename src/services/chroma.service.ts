import {
  CHROMA_API_KEY,
  CHROMA_COLLECTION,
  CHROMA_DATABASE,
  CHROMA_TENANT_ID,
  GOOGLE_GEMINI_API_KEY,
  RAG_ENABLED,
} from '#utils/env.util';
import fetch from 'node-fetch';

type ChromaClientLike = {
  getOrCreateCollection: (args: { name: string }) => Promise<ChromaCollectionLike>;
};

type ChromaCollectionLike = {
  add: (args: {
    ids: string[];
    documents: string[];
    embeddings?: number[][];
    metadatas?: Record<string, string | number | boolean>[];
  }) => Promise<void>;
  query: (args: {
    queryTexts?: string[];
    queryEmbeddings?: number[][];
    nResults: number;
    include?: string[];
  }) => Promise<{
    documents?: (string[] | null)[];
    metadatas?: (Record<string, unknown>[] | null)[];
    distances?: (number[] | null)[];
  }>;
  delete: (args: { where: Record<string, unknown> }) => Promise<void>;
};

type CloudClientCtor = new (args: {
  apiKey: string;
  tenant: string;
  database: string;
}) => ChromaClientLike;

let clientPromise: Promise<ChromaClientLike | null> | null = null;

export const getChromaConfigIssue = (): string | null => {
  if (!RAG_ENABLED) return 'RAG_ENABLED=false';
  if (!CHROMA_API_KEY.trim()) return 'CHROMA_API_KEY kosong';
  if (CHROMA_API_KEY.trim() === CHROMA_TENANT_ID.trim()) {
    return 'CHROMA_API_KEY salah: jangan isi Tenant ID — buat API key di dashboard Chroma';
  }
  if (!CHROMA_TENANT_ID.trim()) return 'CHROMA_TENANT_ID kosong';
  if (!CHROMA_DATABASE.trim()) return 'CHROMA_DATABASE kosong';
  return null;
};

export const isChromaConfigured = (): boolean => getChromaConfigIssue() === null;

/**
 * Generate 768-dim embedding vectors via Google Gemini text-embedding-004,
 * or fallback to deterministic normalized Hashing Vectorizer if Gemini key is absent.
 * This prevents ChromaDB from throwing `ChromaValueError: No embedding function found for collection`.
 */
const generateFallbackVector = (text: string, dim = 768): number[] => {
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
};

export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
  if (GOOGLE_GEMINI_API_KEY && GOOGLE_GEMINI_API_KEY.trim().length > 0) {
    try {
      const requests = texts.map((text) => ({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${GOOGLE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        },
      );

      if (response.ok) {
        const data = (await response.json()) as {
          embeddings?: { values: number[] }[];
        };
        if (data.embeddings && data.embeddings.length === texts.length) {
          return data.embeddings.map((e) => e.values);
        }
      }
    } catch (err) {
      console.warn('[CHROMA] Gemini embedding API failed, using fallback vectorizer:', err);
    }
  }

  return texts.map((t) => generateFallbackVector(t, 768));
};

/** Runtime import — avoids chromadb package typings that pull missing @hey-api/client-fetch. */
const loadCloudClient = async (): Promise<CloudClientCtor> => {
  const mod = (await import('chromadb')) as { CloudClient: CloudClientCtor };
  return mod.CloudClient;
};

const toChromaUserError = (error: unknown): Error => {
  const name = error instanceof Error ? error.name : '';
  if (
    name === 'ChromaUnauthorizedError' ||
    (error instanceof Error && /unauthorized/i.test(error.message))
  ) {
    return new Error(
      'Chroma Unauthorized: API key tidak valid. Buat key baru di dashboard Chroma → database "bisa" → API keys. Jangan pakai Tenant ID sebagai CHROMA_API_KEY.',
    );
  }
  return error instanceof Error ? error : new Error('Gagal menghubungi Chroma Cloud.');
};

const getClient = async (): Promise<ChromaClientLike | null> => {
  if (!isChromaConfigured()) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const CloudClient = await loadCloudClient();
      return new CloudClient({
        apiKey: CHROMA_API_KEY,
        tenant: CHROMA_TENANT_ID,
        database: CHROMA_DATABASE,
      }) as unknown as ChromaClientLike;
    })();
  }
  return clientPromise;
};

const getCollection = async (name = CHROMA_COLLECTION): Promise<ChromaCollectionLike | null> => {
  const client = await getClient();
  if (!client) return null;
  try {
    return await client.getOrCreateCollection({ name });
  } catch (error) {
    throw toChromaUserError(error);
  }
};

export const indexDocumentChunks = async (input: {
  documentId: string;
  title: string;
  chunks: string[];
  collection?: string;
}): Promise<number> => {
  const collection = await getCollection(input.collection);
  if (!collection) {
    throw new Error('Chroma Cloud belum dikonfigurasi (CHROMA_API_KEY / TENANT / DATABASE).');
  }
  if (input.chunks.length === 0) {
    throw new Error('Tidak ada teks yang bisa di-index.');
  }

  const batchSize = 20;
  try {
    for (let offset = 0; offset < input.chunks.length; offset += batchSize) {
      const slice = input.chunks.slice(offset, offset + batchSize);
      const ids = slice.map((_, idx) => `${input.documentId}_chunk_${offset + idx}`);
      const metadatas = slice.map((_, idx) => ({
        documentId: input.documentId,
        title: input.title,
        chunkIndex: offset + idx,
      }));

      // Directly generate vector embeddings to bypass client-side missing default-embed error
      const embeddings = await generateEmbeddings(slice);

      await collection.add({
        ids,
        documents: slice,
        embeddings,
        metadatas,
      });
    }
  } catch (error) {
    throw toChromaUserError(error);
  }
  return input.chunks.length;
};

export const deleteDocumentChunks = async (
  documentId: string,
  collection?: string,
): Promise<void> => {
  const col = await getCollection(collection);
  if (!col) return;
  try {
    await col.delete({ where: { documentId } });
  } catch (error) {
    throw toChromaUserError(error);
  }
};

export type RagHit = {
  content: string;
  title?: string;
  documentId?: string;
  distance?: number;
};

export const queryKnowledge = async (
  question: string,
  options: { topK?: number; collection?: string } = {},
): Promise<RagHit[]> => {
  const collection = await getCollection(options.collection);
  if (!collection) return [];

  const topK = options.topK ?? 5;
  const [queryEmbedding] = await generateEmbeddings([question]);

  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    include: ['documents', 'metadatas', 'distances'],
  });

  const docs = result.documents?.[0] ?? [];
  const metas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];

  return docs
    .map((content, i): RagHit | null => {
      if (!content) return null;
      const meta = (metas[i] ?? {}) as Record<string, unknown>;
      return {
        content,
        title: typeof meta.title === 'string' ? meta.title : undefined,
        documentId: typeof meta.documentId === 'string' ? meta.documentId : undefined,
        distance: typeof distances[i] === 'number' ? distances[i] : undefined,
      };
    })
    .filter((item): item is RagHit => item !== null);
};
