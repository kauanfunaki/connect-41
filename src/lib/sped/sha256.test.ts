import { createHash, randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { Sha256, sha256Hex } from "./sha256";

const doNode = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("SHA-256 incremental", () => {
  it("os vetores conhecidos", () => {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("bate com o crypto do Node em todos os tamanhos de borda, em pedaços aleatórios", () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 100_003]) {
      const b = randomBytes(n);
      const s = new Sha256();
      for (let i = 0; i < n;) { const k = Math.min(n - i, 1 + Math.floor(Math.random() * 97)); s.update(b.subarray(i, i + k)); i += k; }
      expect(s.hex()).toBe(doNode(b));
    }
  });

  it("partes de 8 MiB e a última menor: o mesmo resumo do arquivo inteiro", () => {
    const b = randomBytes(2 * 8 * 1024 * 1024 + 10);
    const s = new Sha256();
    for (let i = 0; i < b.length; i += 8 << 20) s.update(b.subarray(i, i + (8 << 20)));
    expect(s.hex()).toBe(doNode(b));
  });

  it("depois do resumo não aceita mais bytes, e o resumo repete", () => {
    const s = new Sha256().update(new Uint8Array([1, 2, 3]));
    const h = s.hex();
    expect(s.hex()).toBe(h);
    expect(() => s.update(new Uint8Array([4]))).toThrow();
  });
});
