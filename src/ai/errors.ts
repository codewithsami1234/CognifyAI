import type { AiError, AiErrorCode } from "./aiTypes";

export class ModelRuntimeError extends Error {
  readonly code: AiErrorCode;
  readonly causeMessage?: string;

  constructor(code: AiErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ModelRuntimeError";
    this.code = code;
    if (cause instanceof Error && cause.message) {
      this.causeMessage = cause.message;
    } else if (typeof cause === "string" && cause.length > 0) {
      this.causeMessage = cause;
    }
  }
}

export function toAiError(error: unknown, fallbackCode: AiErrorCode, fallbackMessage: string): AiError {
  if (error instanceof ModelRuntimeError) {
    const aiError: AiError = {
      code: error.code,
      message: error.message,
    };
    if (error.causeMessage !== undefined) {
      aiError.cause = error.causeMessage;
    }
    return aiError;
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: fallbackMessage,
      cause: error.message,
    };
  }
  return {
    code: fallbackCode,
    message: fallbackMessage,
    cause: typeof error === "string" ? error : undefined,
  };
}
