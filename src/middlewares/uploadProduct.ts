import multer from 'multer';
import AppError from '#utils/appError';

const storage = multer.memoryStorage();

/** Product photos only — no PDF / dokumen lain. */
const PRODUCT_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (PRODUCT_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError('Format foto produk tidak didukung. Gunakan JPG, PNG, atau WEBP.', 400) as any,
      false,
    );
  }
};

const uploadProduct = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
  },
});

export default uploadProduct;
