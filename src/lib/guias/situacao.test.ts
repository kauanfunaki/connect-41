import { describe, expect, it } from "vitest";
import { contarPorSituacao, mesDaGuia, situacaoDaGuia } from "./situacao";

const HOJE = "2026-10-28";
const base = { vencimento: "2026-10-30", validoAte: null, pagaEm: null, envio: null };

describe("situação da guia", () => {
  it("emitida, enviada e aberta pelo envio", () => {
    expect(situacaoDaGuia(base, HOJE)).toBe("EMITIDA");
    // Rascunho de envio ainda não é enviada.
    expect(situacaoDaGuia({ ...base, envio: { publicado: false, abertoPeloCliente: false } }, HOJE)).toBe("EMITIDA");
    expect(situacaoDaGuia({ ...base, envio: { publicado: true, abertoPeloCliente: false } }, HOJE)).toBe("ENVIADA");
    expect(situacaoDaGuia({ ...base, envio: { publicado: true, abertoPeloCliente: true } }, HOJE)).toBe("ABERTA");
  });

  it("vencida passa na frente de enviada e aberta; paga passa na frente de tudo", () => {
    const vencida = { ...base, vencimento: "2026-10-27", envio: { publicado: true, abertoPeloCliente: true } };
    expect(situacaoDaGuia(vencida, HOJE)).toBe("VENCIDA");
    expect(situacaoDaGuia({ ...vencida, pagaEm: new Date() }, HOJE)).toBe("PAGA");
    // Vence hoje ainda não venceu.
    expect(situacaoDaGuia({ ...base, vencimento: HOJE }, HOJE)).toBe("EMITIDA");
  });

  it("guia recalculada vale até o validoAte, mesmo com o vencimento original no passado", () => {
    expect(situacaoDaGuia({ ...base, vencimento: "2026-10-20", validoAte: "2026-10-31" }, HOJE)).toBe("EMITIDA");
    expect(situacaoDaGuia({ ...base, vencimento: "2026-10-20", validoAte: "2026-10-27" }, HOJE)).toBe("VENCIDA");
  });

  it("sem vencimento (DCTFWeb, parcela) nunca vira vencida sozinha", () => {
    expect(situacaoDaGuia({ ...base, vencimento: null }, "2030-01-01")).toBe("EMITIDA");
  });

  it("o mês da guia: vencimento, competência ou o da emissão", () => {
    expect(mesDaGuia({ vencimento: "2026-11-20", competencia: "2026-10", emitidaEmKey: "2026-10-28" })).toBe("2026-11");
    expect(mesDaGuia({ vencimento: null, competencia: "2026-09", emitidaEmKey: "2026-10-28" })).toBe("2026-09");
    expect(mesDaGuia({ vencimento: null, competencia: null, emitidaEmKey: "2026-10-28" })).toBe("2026-10");
  });

  it("conta por situação", () => {
    expect(contarPorSituacao(["PAGA", "VENCIDA", "PAGA"])).toEqual({ EMITIDA: 0, ENVIADA: 0, ABERTA: 0, PAGA: 2, VENCIDA: 1 });
  });
});
