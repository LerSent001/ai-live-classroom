import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@fal-ai/client";

import { classifyFalError } from "./fal-error";

test("treats a rejected fal key as a non-retryable auth failure", () => {
  const error = new ApiError({
    message: "Unauthorized",
    status: 401,
    body: { detail: "Unauthorized" },
  });

  assert.deepEqual(classifyFalError(error), {
    status: 401,
    code: "FAL_AUTH_FAILED",
    message:
      "fal rejected this request (401: Unauthorized). Check that the key permits minimax/h3-max-turbo/image-to-video. No automatic resubmission will be made.",
    retryable: false,
  });
});

test("classifies a transient fal service failure as retryable", () => {
  const error = new ApiError({
    message: "Service unavailable",
    status: 503,
  });

  assert.equal(classifyFalError(error).retryable, true);
});

test("classifies an invalid generation request as terminal", () => {
  const error = new ApiError({
    message: "Unprocessable entity",
    status: 422,
  });

  assert.equal(classifyFalError(error).retryable, false);
});
