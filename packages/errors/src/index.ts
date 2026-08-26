export interface ErrorEnvelope {
  code: string;
  message: string;
  requestId?: string;
  cause?: unknown;
  recoverable: boolean;
}

export class JarvisError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly recoverable: boolean;
  readonly safeCause?: unknown;

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; recoverable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "JarvisError";
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.recoverable = options.recoverable ?? false;
    this.safeCause = options.cause;
  }
}

export function normalizeError(error: unknown): JarvisError {
  if (error instanceof JarvisError) {
    return error;
  }
  if (error instanceof Error) {
    return new JarvisError("INTERNAL_ERROR", error.message, { cause: error.name });
  }
  return new JarvisError("INTERNAL_ERROR", "An unexpected error occurred.", { cause: error });
}

export function toErrorEnvelope(error: unknown, requestId?: string): ErrorEnvelope {
  const normalized = normalizeError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    requestId,
    cause: normalized.safeCause,
    recoverable: normalized.recoverable,
  };
}

