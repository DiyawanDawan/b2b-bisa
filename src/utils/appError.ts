class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;
  code?: string;
  missing?: string[];

  constructor(
    message: string,
    statusCode: number,
    options?: { code?: string; missing?: string[] },
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = options?.code;
    this.missing = options?.missing;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
