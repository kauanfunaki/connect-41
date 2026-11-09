import { describe, expect, it } from "vitest";
import { lerProtocolosDoSima, pedidoDoSima, resultadoDoSimaSchema, rodadaDoSimaPodeComecar, type ProtocoloDoSima } from "./sima";

const protocolo = (id: string, numero: string | null): ProtocoloDoSima => ({
  id,
  tenantId: "t1",
  stepId: null,
  outcome: "PENDENTE",
  numero,
  trackingUrl: null,
  siglaDoOrgao: "MA",
});

describe("pedidoDoSima", () => {
  it("leva só número com a cara do SIMA, normalizado e sem repetir", () => {
    expect(pedidoDoSima(["afu-26003257", "AFU-26003257", "123", null, " CAD-26000013 "])).toEqual({ protocolos: ["AFU-26003257", "CAD-26000013"] });
  });
});

describe("lerProtocolosDoSima", () => {
  const resultado = resultadoDoSimaSchema.parse({
    itens: [
      { protocolo: "CAD-26000013", aba: "Em análise", selo: "Em Análise" },
      { protocolo: "AFU-26003257", aba: "Finalizado", selo: "DEFERIDO" },
      { protocolo: "AFU-26002918", aba: "Finalizado", selo: "CANCELADO", motivo: "Solicitação CANCELADA automaticamente" },
      { protocolo: "DLA-26002120", aba: "Finalizado", selo: "INDEFERIDO" },
    ],
  });

  it("em análise segue pendente, deferido defere e cancelado vira exigência com o motivo", () => {
    const [analise, deferido, cancelado] = lerProtocolosDoSima(
      [protocolo("a", "CAD-26000013"), protocolo("b", "afu-26003257"), protocolo("c", "AFU-26002918")],
      resultado
    );
    expect(analise).toEqual({ id: "a", tipo: "decisao", decisao: { tipo: "segue_pendente" } });
    expect(deferido).toEqual({ id: "b", tipo: "decisao", decisao: { tipo: "deferir" } });
    expect(cancelado).toEqual({
      id: "c",
      tipo: "decisao",
      decisao: { tipo: "exigir", descricao: "O SIMA marcou a solicitação como cancelado: Solicitação CANCELADA automaticamente" },
    });
  });

  it("protocolo que não apareceu é falha anotada, e não pendente", () => {
    const [l] = lerProtocolosDoSima([protocolo("x", "AFU-26009999")], resultado);
    expect(l).toMatchObject({ id: "x", tipo: "falha" });
    expect(l.tipo === "falha" && l.mensagem).toMatch(/não aparece/);
  });

  it("selo que a tela ainda não mostrou é falha anotada, nunca deferimento", () => {
    const [l] = lerProtocolosDoSima([protocolo("d", "DLA-26002120")], resultado);
    expect(l).toMatchObject({ id: "d", tipo: "falha" });
    expect(l.tipo === "falha" && l.mensagem).toMatch(/INDEFERIDO/);
  });
});

// Ensaio de 09/11/2026: o SIMA devolveu CAD-26000013 em Pendente (selo "Em
// Análise") e em Em análise. A decisão não pode depender da ordem das abas.
describe("lerProtocolosDoSima — o mesmo protocolo em mais de uma aba", () => {
  const ler = (itens: { protocolo: string; aba: "Pendente" | "Em análise" | "Finalizado"; selo: string }[]) =>
    lerProtocolosDoSima([protocolo("p", "CAD-26000013")], resultadoDoSimaSchema.parse({ itens }))[0]!;
  const pendenteEmAnalise = { protocolo: "CAD-26000013", aba: "Pendente" as const, selo: "Em Análise" };
  const emAnalise = { protocolo: "CAD-26000013", aba: "Em análise" as const, selo: "Em Análise" };

  it("Pendente com selo \"Em Análise\" mais Em análise vira nota para conferir, em qualquer ordem", () => {
    for (const itens of [[pendenteEmAnalise, emAnalise], [emAnalise, pendenteEmAnalise]]) {
      const l = ler(itens);
      expect(l).toMatchObject({ id: "p", tipo: "falha" });
      expect(l.tipo === "falha" && l.mensagem).toMatch(/duas abas.*Pendente.*Em análise.*confira o protocolo no SIMA/);
    }
  });

  it("Pendente com selo de exigência vale mais que Em análise", () => {
    for (const ordem of [0, 1]) {
      const exigencia = { protocolo: "CAD-26000013", aba: "Pendente" as const, selo: "Aguardando Assinatura" };
      const l = ler(ordem ? [emAnalise, exigencia] : [exigencia, emAnalise]);
      expect(l).toEqual({ id: "p", tipo: "decisao", decisao: { tipo: "exigir", descricao: "Aguardando Assinatura" } });
    }
  });

  it("Finalizado deferido vale mais que qualquer outra aba", () => {
    const deferido = { protocolo: "CAD-26000013", aba: "Finalizado" as const, selo: "DEFERIDO" };
    expect(ler([emAnalise, pendenteEmAnalise, deferido])).toEqual({ id: "p", tipo: "decisao", decisao: { tipo: "deferir" } });
  });

  it("só em Em análise, mesmo repetido, segue pendente", () => {
    expect(ler([emAnalise, emAnalise])).toEqual({ id: "p", tipo: "decisao", decisao: { tipo: "segue_pendente" } });
  });
});

describe("rodadaDoSimaPodeComecar", () => {
  const agora = new Date("2026-11-03T18:00:00Z");
  it("começa sem rodada anterior ou depois de 6 horas", () => {
    expect(rodadaDoSimaPodeComecar(null, agora)).toBe(true);
    expect(rodadaDoSimaPodeComecar(new Date("2026-11-03T11:59:00Z"), agora)).toBe(true);
    expect(rodadaDoSimaPodeComecar(new Date("2026-11-03T13:00:00Z"), agora)).toBe(false);
  });
});
