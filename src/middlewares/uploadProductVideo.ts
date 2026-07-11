import multer from 'multer';
import AppError from '#utils/appError';

const storage = multer.memoryStorage();

const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Format video tidak didukung. Gunakan MP4 atau WEBM.', 400) as any, false);
  }
};

const uploadProductVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

export default uploadProductVideo;
