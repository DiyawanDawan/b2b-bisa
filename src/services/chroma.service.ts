import { ChromaUnauthorizedError, CloudClient } from 'chromadb';
import {
  CHROMA_API_KEY,
  CHROMA_COLLECTION,
  CHROMA_DATABASE,
  CHROMA_TENANT_ID,
  RAG_ENABLED,
} from '#utils/env.util';

type ChromaClientLike = {
  getOrCreateCollection: (args: { name: string }) => Promise<ChromaCollectionLike>;
};

type ChromaCollectionLike = {
  add: (args: {
    ids: string[];
    documents: string[];
    metadatas?: Record<string, string | number | boolean>[];
  }) => Promise<void>;
  query: (args: { queryTexts: string[]; nResults: number; include?: string[] }) => Promise<{
    documents?: (string[] | null)[];
    metadatas?: (Record<string, unknown>[] | null)[];
    distances?: (number[] | null)[];
  }>;
  delete: (args: { where: Record<string, unknown> }) => Promise<void>;
};

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

const toChromaUserError = (error: unknown): Error => {
  if (error instanceof ChromaUnauthorizedError) {
    return new Error(
      'Chroma Unauthorized: API key tidak valid. Buat key baru di dashboard Chroma → database "bisa" → API keys. Jangan pakai Tenant ID sebagai CHROMA_API_KEY.',
    );
  }
  if (error instanceof Error && /unauthorized/i.test(error.message)) {
    return new Error(
      'Chroma Unauthorized: periksa CHROMA_API_KEY di Backend/.env (bukan Tenant ID).',
    );
  }
  return error instanceof Error ? error : new Error('Gagal menghubungi Chroma Cloud.');
};

const getClient = async (): Promise<ChromaClientLike | null> => {
  if (!isChromaConfigured()) return null;
  if (!clientPromise) {
    clientPromise = Promise.resolve(
      new CloudClient({
        apiKey: CHROMA_API_KEY,
        tenant: CHROMA_TENANT_ID,
        database: CHROMA_DATABASE,
      }) as unknown as ChromaClientLike,
    );
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

  const batchSize = 50;
  try {
    for (let offset = 0; offset < input.chunks.length; offset += batchSize) {
      const slice = input.chunks.slice(offset, offset + batchSize);
      const ids = slice.map((_, idx) => `${input.documentId}_chunk_${offset + idx}`);
      const metadatas = slice.map((_, idx) => ({
        documentId: input.documentId,
        title: input.title,
        chunkIndex: offset + idx,
      }));
      await collection.add({
        ids,
        documents: slice,
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
  const result = await collection.query({
    queryTexts: [question],
    nResults: topK,
    include: ['documents', 'metadatas', 'distances'],
  });

  const docs = result.documents?.[0] ?? [];
  const metas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];

  return docs
    .map((content, i) => {
      if (!content) return null;
      const meta = (metas[i] ?? {}) as Record<string, unknown>;
      return {
        content,
        title: typeof meta.title === 'string' ? meta.title : undefined,
        documentId: typeof meta.documentId === 'string' ? meta.documentId : undefined,
        distance: typeof distances[i] === 'number' ? distances[i] : undefined,
      };
    })
    .filter((item): item is RagHit => item != null);
};
