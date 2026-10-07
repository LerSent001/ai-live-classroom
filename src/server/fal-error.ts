import { ApiError } from "@fal-ai/client";

export type ClassifiedFalError = Readonly<{
  status: number;
  code: string;
  message: string;
  retryable: boolean;
}>;

function detailOf(error: ApiError<unknown>): string {
  const body: unknown = (error as { body?: unknown }).body;
  let detail: unknown = body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    detail = record.detail ?? record.message ?? record.error ?? body;
  }
  const text = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
  return (text || error.message || "").slice(0, 240);
}

export function classifyFalError(error: unknown): ClassifiedFalError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      const detail = detailOf(error);
      if (/content|policy|safety|unsafe|moderat|prohibit|sensitive/i.test(detail)) {
        return {
          status: error.status,
          code: "FAL_CONTENT_REJECTED",
          message: `H3 declined this scene's content: ${detail}`,
          retryable: false,
        };
      }
      if (/balance|credit|billing|exhaust|insufficient/i.test(detail)) {
        return {
          status: error.status,
          code: "FAL_BALANCE_EXHAUSTED",
          message: `fal balance is exhausted: ${detail}`,
          retryable: false,
        };
      }
      return {
        status: error.status,
        code: "FAL_AUTH_FAILED",
        message: `fal rejected this request (${error.status}${detail ? `: ${detail}` : ""}). Check that the key permits minimax/h3-max-turbo/image-to-video. No automatic resubmission will be made.`,
        retryable: false,
      };
    }

    if (
      error.status === 400 ||
      error.status === 404 ||
      error.status === 422 ||
      error.isUserTimeout
    ) {
      return {
        status: error.status,
        code: "FAL_REQUEST_REJECTED",
        message: detailOf(error) || error.message,
        retryable: false,
      };
    }

    return {
      status: 502,
      code: "FAL_GENERATION_FAILED",
      message: detailOf(error) || error.message,
      retryable: true,
    };
  }

  return {
    status: 502,
    code: "FAL_GENERATION_FAILED",
    message: error instanceof Error ? error.message : "H3 Max generation failed.",
    retryable: true,
  };
}
