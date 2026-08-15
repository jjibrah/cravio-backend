export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const notFound = (code = 'NOT_FOUND', message = 'Resource not found') => new AppError(404, code, message);
