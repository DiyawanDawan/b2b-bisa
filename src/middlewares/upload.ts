import multer from 'multer';
import AppError from '#utils/appError';

// Store files in memory to upload them directly to Cloudflare R2
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Format file tidak didukung. Hanya diperbolehkan: .jpg, .jpeg, .png, .webp, .pdf',
        400,
      ) as any,
      false,
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB (PDF tagihan)
  },
});

export default upload;
