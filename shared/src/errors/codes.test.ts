import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "./codes.ts";

describe("ERROR_CODES", () => {
  it("conventions.md 3.2 のコードと HTTP ステータスの対応", () => {
    expect(ERROR_CODES).toEqual({
      VALIDATION_FAILED: 400,
      UNAUTHENTICATED: 401,
      PASSWORD_CHANGE_REQUIRED: 403,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      DRAFT_CONFLICT: 409,
      STEP_STATUS_CONFLICT: 409,
      NOT_LATEST_VERSION: 409,
      STATE_CONFLICT: 409,
      UNSUPPORTED_MEDIA_TYPE: 415,
      INTERNAL_ERROR: 500,
    });
  });
});
