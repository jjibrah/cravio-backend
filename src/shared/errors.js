export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (code = 'NOT_FOUND', message = 'Resource not found') => new AppError(404, code, message);
