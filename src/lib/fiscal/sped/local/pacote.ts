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

/**
 * O pacote passou do que dá para congelar de uma vez (06/11/2026). Medido com
 * CT-e fictícios: ~1.160 bytes por documento. Os dois tetos são o
 * `max_allowed_packet` do MySQL na gravação da revisão (64 MiB por padrão,
 * ~58 mil CT-e) e a maior string do Node no `JSON.stringify` (~512 MiB, ~460
 * mil). Sem isto, o pedido parava num erro de banco ou de memória.
 *
 * O do banco se confere ANTES (`cabeNoBanco`): acima do limite, o MySQL fecha a
 * conexão e o Prisma só vê `ECONNRESET` (conferido no laboratório), que não dá
 * para separar de uma queda de rede. Este reconhece o estouro da string e a
 * recusa do próprio driver, quando ele vem com o texto do limite.
 */
export function ehPacoteGrandeDemais(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; e && i < 5; i++, e = (e as { cause?: unknown }).cause) {
    if (e instanceof RangeError && /string length/i.test(e.message)) return true;
    const texto = `${(e as { message?: unknown }).message ?? ""} ${(e as { code?: unknown }).code ?? ""}`;
    if (/max_allowed_packet|ER_NET_PACKET_TOO_LARGE|ER_MAX_ALLOWED_PACKET/i.test(texto)) return true;
  }
  return false;
}

/** Folga para o resto da linha da revisão e do protocolo, além do JSON do pacote. */
export const FOLGA_DO_PACOTE = 1024 * 1024;

/** O pacote cabe na gravação da revisão? Sem o limite do banco (a consulta falhou), não barra. */
export function cabeNoBanco(bytes: number, maxAllowedPacket: number | null): boolean {
  return maxAllowedPacket === null || bytes + FOLGA_DO_PACOTE < maxAllowedPacket;
}

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function mensagemDoPacoteGrande(documentos: number, bytes: number | null): string {
  const tamanho = bytes === null ? "" : ` (${inteiro.format(bytes / 1048576)} MiB)`;
  return `O pacote desta competência tem ${inteiro.format(documentos)} documentos${tamanho} e passa do que o Connect consegue congelar de uma vez. Competência com tanto CT-e ainda não gera pelo Connect: falta dividir o pacote em partes.`;
}
