import { toErrorEnvelope } from "@jarvis/errors";

export interface Logger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => void;
}

function write(level: "info" | "warn" | "error", scope: string, message: string, context?: Record<string, unknown>) {
  const entry = {
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  console[level](JSON.stringify(entry));
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, context) => write("info", scope, message, context),
    warn: (message, context) => write("warn", scope, message, context),
    error: (message, error, context) =>
      write("error", scope, message, {
        ...context,
        error: error ? toErrorEnvelope(error) : undefined,
      }),
  };
}

export function installProcessErrorHandlers(logger: Logger): void {
  if (typeof process === "undefined") {
    return;
  }
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", reason);
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
  });
}

