import { createHash } from "node:crypto";
export function canonicalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonicalizar(v)]));
  return valor;
}
export function serializarPacote(pacote: unknown) {
  const bytes = new Uint8Array(Buffer.from(JSON.stringify(canonicalizar(pacote)), "utf8"));
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
