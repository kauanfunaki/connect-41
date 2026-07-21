import { describe, it, expect } from "vitest";
import { errorForStatus, ChatwootAuthError, ChatwootNotFoundError, ChatwootValidationError, ChatwootRateLimitError, ChatwootServerError, ChatwootError } from "./errors";

describe("errorForStatus", () => {
  it("401/403 -> ChatwootAuthError", () => {
    expect(errorForStatus(401)).toBeInstanceOf(ChatwootAuthError);
    expect(errorForStatus(403)).toBeInstanceOf(ChatwootAuthError);
  });
  it("404 -> ChatwootNotFoundError", () => {
    expect(errorForStatus(404)).toBeInstanceOf(ChatwootNotFoundError);
  });
  it("422 -> ChatwootValidationError", () => {
    expect(errorForStatus(422)).toBeInstanceOf(ChatwootValidationError);
  });
  it("429 -> ChatwootRateLimitError", () => {
    expect(errorForStatus(429)).toBeInstanceOf(ChatwootRateLimitError);
  });
  it("5xx -> ChatwootServerError", () => {
    expect(errorForStatus(500)).toBeInstanceOf(ChatwootServerError);
    expect(errorForStatus(503)).toBeInstanceOf(ChatwootServerError);
  });
  it("status desconhecido -> ChatwootError genérico", () => {
    const err = errorForStatus(418, "teapot");
    expect(err).toBeInstanceOf(ChatwootError);
    expect(err.message).toContain("teapot");
  });
});
