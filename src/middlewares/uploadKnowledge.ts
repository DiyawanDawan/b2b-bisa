import multer from 'multer';
import AppError from '#utils/appError';

const storage = multer.memoryStorage();

const ALLOWED = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const lower = file.originalname.toLowerCase();
  const byExt =
    lower.endsWith('.pdf') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv');
  if (ALLOWED.has(file.mimetype) || byExt) {
    cb(null, true);
    return;
  }
  cb(
    new AppError('Format tidak didukung. Gunakan PDF, TXT, MD, atau CSV.', 400) as unknown as null,
    false,
  );
};

const uploadKnowledge = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});

export default uploadKnowledge;
