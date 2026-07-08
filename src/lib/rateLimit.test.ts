import { describe, it, expect } from "vitest";
import { hit, reset } from "./rateLimit";

describe("rateLimit", () => {
  it("permite até o máximo e bloqueia depois", () => {
    const key = `test:${Math.random()}`;
    expect(hit(key, 3).allowed).toBe(true); // 1
    expect(hit(key, 3).allowed).toBe(true); // 2
    expect(hit(key, 3).allowed).toBe(true); // 3
    expect(hit(key, 3).allowed).toBe(false); // 4 — estourou
  });

  it("reset zera o contador", () => {
    const key = `test:${Math.random()}`;
    hit(key, 2);
    hit(key, 2);
    expect(hit(key, 2).allowed).toBe(false);
    reset(key);
    expect(hit(key, 2).allowed).toBe(true);
  });

  it("informa retryAfter só quando bloqueado", () => {
    const key = `test:${Math.random()}`;
    expect(hit(key, 1).retryAfterMs).toBe(0);
    const blocked = hit(key, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
