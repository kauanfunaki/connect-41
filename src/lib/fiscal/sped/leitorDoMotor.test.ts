import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { lerEmFluxo } from "./leitorDoMotor";
import { leitorDaApuracao, leitorDaClassificacao, lerTexto } from "./arquivoIcms";
import { centavosDoMotor, decimalParaOMotor } from "./dados";
import { ARQUIVO_ICMS_DE_TESTE } from "./arquivoIcms.fixture";

/** O arquivo em ISO-8859-1, cortado em pedaços de `tamanho` bytes — linhas e acentos partidos no meio. */
function emPedacos(texto: string, tamanho: number) {
  const bytes = Buffer.from(texto, "latin1");
  let lidos = 0;
  let cancelado = false;
  const corpo = new ReadableStream<Uint8Array>({
    pull(c) {
      if (lidos >= bytes.length) { c.close(); return; }
      c.enqueue(new Uint8Array(bytes.subarray(lidos, lidos + tamanho)));
      lidos += tamanho;
    },
    cancel() { cancelado = true; },
  });
  return { corpo, lidos: () => lidos, cancelado: () => cancelado, total: bytes.length };
}

describe("leitura em fluxo do download", () => {
  it("dá o mesmo resultado que o texto inteiro, com as linhas partidas entre pedaços", async () => {
    for (const tamanho of [1, 7, 64, 100_000]) {
      const { corpo } = emPedacos(ARQUIVO_ICMS_DE_TESTE, tamanho);
      expect(await lerEmFluxo(corpo, leitorDaApuracao())).toEqual(lerTexto(ARQUIVO_ICMS_DE_TESTE, leitorDaApuracao()));
    }
  });

  it("decodifica ISO-8859-1 (o acento do arquivo chega inteiro)", async () => {
    const texto = ARQUIVO_ICMS_DE_TESTE.replace("OLEO DIESEL S10", "ÓLEO DIESEL Ç");
    const { corpo } = emPedacos(texto, 3);
    const r = await lerEmFluxo(corpo, leitorDaClassificacao());
    expect(r.produtos.find((p) => p.codProd === "A1")?.descricao).toBe("ÓLEO DIESEL Ç");
  });

  it("corta o download quando a classificação chega ao bloco D", async () => {
    const texto = `${ARQUIVO_ICMS_DE_TESTE}\r\n${"|D100|1|0||57|00|1||900|x|01092026|01092026|0||1|0|0|1|1|0|0||\r\n".repeat(2000)}`;
    const fluxo = emPedacos(texto, 256);
    const r = await lerEmFluxo(fluxo.corpo, leitorDaClassificacao());
    expect(r.produtos).toHaveLength(4);
    expect(fluxo.cancelado()).toBe(true);
    expect(fluxo.lidos()).toBeLessThan(fluxo.total / 10);
  });
});

describe("decimais do motor", () => {
  it("lê a string decimal do motor em centavos", () => {
    expect(centavosDoMotor("1234.56")).toBe(123456);
    expect(centavosDoMotor("0.5")).toBe(50);
    expect(centavosDoMotor("-3")).toBe(-300);
    expect(centavosDoMotor("1,5")).toBeNull();
    expect(centavosDoMotor(null)).toBeNull();
  });
  it("escreve centavos no formato que o motor aceita", () => {
    expect(decimalParaOMotor(123456)).toBe("1234.56");
    expect(decimalParaOMotor(5)).toBe("0.05");
    expect(decimalParaOMotor(-30)).toBe("-0.30");
  });
});
