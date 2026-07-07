import prisma from '#config/prisma';
import { KnowledgeDocStatus, KnowledgeSourceType } from '#prisma';
import * as storageService from '#services/storage.service';
import {
  deleteDocumentChunks,
  getChromaConfigIssue,
  indexDocumentChunks,
  isChromaConfigured,
  queryKnowledge,
} from '#services/chroma.service';
import { buildRagContext, chunkText, csvBufferToText } from '#utils/rag.util';
import AppError from '#utils/appError';

const detectSourceType = (mimeType: string | undefined, fileName: string): KnowledgeSourceType => {
  const lower = fileName.toLowerCase();
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return KnowledgeSourceType.PDF;
  if (mimeType === 'text/markdown' || lower.endsWith('.md')) return KnowledgeSourceType.MD;
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    lower.endsWith('.csv')
  ) {
    return KnowledgeSourceType.CSV;
  }
  if (lower.endsWith('.txt') || mimeType?.startsWith('text/')) return KnowledgeSourceType.TXT;
  return KnowledgeSourceType.TEXT;
};

const extractTextFromBuffer = async (
  buffer: Buffer,
  sourceType: KnowledgeSourceType,
  _fileName: string,
): Promise<string> => {
  if (sourceType === KnowledgeSourceType.PDF) {
    const pdfParse = (await import('pdf-parse')).default as (
      data: Buffer,
    ) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text ?? '';
  }
  if (sourceType === KnowledgeSourceType.CSV) {
    return csvBufferToText(buffer);
  }
  return buffer.toString('utf-8');
};

const indexKnowledgeRecord = async (documentId: string, title: string, rawText: string) => {
  const chunks = chunkText(rawText);
  if (chunks.length === 0) {
    throw new AppError('Dokumen kosong atau tidak bisa dibaca.', 400);
  }

  await indexDocumentChunks({ documentId, title, chunks });

  return prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: {
      status: KnowledgeDocStatus.INDEXED,
      chunkCount: chunks.length,
      errorMessage: null,
    },
  });
};

export const listKnowledgeDocuments = async (options: { page?: number; limit?: number } = {}) => {
  const page = Math.max(options.page ?? 1, 1);
  const limit = Math.min(options.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        uploadedBy: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.knowledgeDocument.count(),
  ]);

  return { items, total, page, limit };
};

export const createKnowledgeFromText = async (input: {
  title: string;
  content: string;
  description?: string;
  uploadedById: string;
}) => {
  if (!isChromaConfigured()) {
    const issue = getChromaConfigIssue();
    throw new AppError(
      issue ?? 'Chroma Cloud belum dikonfigurasi. Set CHROMA_API_KEY di Backend/.env',
      503,
    );
  }

  const record = await prisma.knowledgeDocument.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim(),
      sourceType: KnowledgeSourceType.TEXT,
      status: KnowledgeDocStatus.PENDING,
      uploadedById: input.uploadedById,
    },
  });

  try {
    return await indexKnowledgeRecord(record.id, record.title, input.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal meng-index dokumen.';
    await prisma.knowledgeDocument.update({
      where: { id: record.id },
      data: { status: KnowledgeDocStatus.FAILED, errorMessage: message },
    });
    throw error;
  }
};

export const uploadKnowledgeFile = async (input: {
  title: string;
  description?: string;
  file: Express.Multer.File;
  uploadedById: string;
}) => {
  if (!isChromaConfigured()) {
    const issue = getChromaConfigIssue();
    throw new AppError(
      issue ?? 'Chroma Cloud belum dikonfigurasi. Set CHROMA_API_KEY di Backend/.env',
      503,
    );
  }

  const sourceType = detectSourceType(input.file.mimetype, input.file.originalname);
  const storageKey = await storageService.uploadFile(
    input.file.buffer,
    `knowledge/${Date.now()}-${input.file.originalname.replace(/[^\w.-]+/g, '_')}`,
    input.file.mimetype || 'application/octet-stream',
  );

  const record = await prisma.knowledgeDocument.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim(),
      sourceType,
      fileName: input.file.originalname,
      mimeType: input.file.mimetype,
      storageKey,
      status: KnowledgeDocStatus.PENDING,
      uploadedById: input.uploadedById,
    },
  });

  try {
    const text = await extractTextFromBuffer(
      input.file.buffer,
      sourceType,
      input.file.originalname,
    );
    return await indexKnowledgeRecord(record.id, record.title, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal meng-index dokumen.';
    await prisma.knowledgeDocument.update({
      where: { id: record.id },
      data: { status: KnowledgeDocStatus.FAILED, errorMessage: message },
    });
    throw error;
  }
};

export const deleteKnowledgeDocument = async (id: string) => {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id } });
  if (!doc) throw new AppError('Dokumen knowledge tidak ditemukan.', 404);

  try {
    await deleteDocumentChunks(id, doc.chromaCollection);
  } catch (chromaErr) {
    // Non-blocking: log Chroma error but continue deleting from DB
    const msg = chromaErr instanceof Error ? chromaErr.message : 'Unknown Chroma error';
    console.warn(`[knowledge] Failed to delete Chroma chunks for doc ${id}: ${msg}`);
  }

  if (doc.storageKey) {
    try {
      await storageService.deleteFile(doc.storageKey);
    } catch {
      // non-blocking
    }
  }

  await prisma.knowledgeDocument.delete({ where: { id } });
  return { id };
};

export const reindexKnowledgeDocument = async (id: string) => {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id } });
  if (!doc) throw new AppError('Dokumen knowledge tidak ditemukan.', 404);
  if (!doc.storageKey) {
    throw new AppError('Dokumen teks langsung tidak bisa di-reindex dari file. Upload ulang.', 400);
  }

  await deleteDocumentChunks(id, doc.chromaCollection);
  await prisma.knowledgeDocument.update({
    where: { id },
    data: { status: KnowledgeDocStatus.PENDING, errorMessage: null, chunkCount: 0 },
  });

  const stream = await storageService.getFileStream(doc.storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream?.stream ?? []) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const text = await extractTextFromBuffer(buffer, doc.sourceType, doc.fileName ?? 'file');
  return indexKnowledgeRecord(id, doc.title, text);
};

export const retrieveRagContext = async (question: string): Promise<string> => {
  if (!isChromaConfigured()) return '';
  const hits = await queryKnowledge(question, { topK: 5 });
  if (hits.length === 0) return '';
  return buildRagContext(
    hits.map((hit) => ({
      content: hit.content,
      title: hit.title,
      source: hit.documentId,
    })),
  );
};

export const getKnowledgeStats = async () => {
  const [total, indexed, failed, pending] = await Promise.all([
    prisma.knowledgeDocument.count(),
    prisma.knowledgeDocument.count({ where: { status: KnowledgeDocStatus.INDEXED } }),
    prisma.knowledgeDocument.count({ where: { status: KnowledgeDocStatus.FAILED } }),
    prisma.knowledgeDocument.count({ where: { status: KnowledgeDocStatus.PENDING } }),
  ]);
  return {
    total,
    indexed,
    failed,
    pending,
    chromaConfigured: isChromaConfigured(),
    chromaConfigIssue: getChromaConfigIssue(),
  };
};
