import multer from 'multer';
import AppError from '#utils/appError';

const storage = multer.memoryStorage();

const CSV_MIME_TYPES = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const name = file.originalname?.toLowerCase() ?? '';
  if (CSV_MIME_TYPES.includes(file.mimetype) || name.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new AppError('File harus berformat CSV (.csv).', 400) as any, false);
  }
};

const uploadCsv = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

export default uploadCsv;
