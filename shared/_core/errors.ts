/** Shared error types for the application. */
export class AppError extends Error {
  public readonly code: number;
  public readonly statusCode: number;

  constructor(message: string, code: number, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

export function ForbiddenError(message = "Access denied") {
  return new AppError(message, 403, 403);
}

export function NotFoundError(message = "Resource not found") {
  return new AppError(message, 404, 404);
}

export function ValidationError(message: string) {
  return new AppError(message, 422, 422);
}

export function ConflictError(message: string) {
  return new AppError(message, 409, 409);
}
