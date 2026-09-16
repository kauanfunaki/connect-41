import { describe, it, expect } from "vitest";
import { responderAoCfo, PERGUNTAS_DO_CFO, type DadosDoCfo } from "./cfo";
import { resultadoDePorGrupo } from "./analises";

const base: DadosDoCfo = {
  competencia: "2026-09",
  atual: resultadoDePorGrupo({ receita_bruta: 100_000, cmv: -50_000, administrativas: -20_000 }),
  anterior: resultadoDePorGrupo({ receita_bruta: 100_000, cmv: -30_000, administrativas: -20_000 }),
  reconciliacao: [
    { code: "resultado_economico", label: "Resultado", centavos: 30_000, tipo: "total" },
    { code: "receitas_nao_recebidas", label: "Receitas não recebidas", centavos: -25_000, tipo: "ajuste" },
    { code: "variacao_de_caixa", label: "Variação", centavos: 5_000, tipo: "total" },
  ],
  proximos60: { entradas: 10_000, saidas: 40_000 },
  vencidos: { entradas: 2_000, saidas: 0 },
  aReceber: [
    { nome: "Cliente A", emAberto: 60_000, vencido: 5_000 },
    { nome: "Cliente B", emAberto: 40_000, vencido: 0 },
  ],
  aReceberTotal: 100_000,
};

describe("responderAoCfo", () => {
  it("responde todas as perguntas sem quebrar, com origem clicável", () => {
    for (const p of PERGUNTAS_DO_CFO) {
      const r = responderAoCfo(p.chave, base);
      expect(r.titulo).toBe(p.rotulo);
      expect(r.diagnostico.length).toBeGreaterThan(0);
      expect(r.origem.href.startsWith("/")).toBe(true);
    }
  });

  it("margem: aponta o grupo que mais piorou", () => {
    const r = responderAoCfo("margem_caiu", base);
    expect(r.diagnostico).toContain("caiu");
    expect(r.causaProvavel).toContain("CMV");
    expect(r.prioridade).toBe("Alta");
  });

  it("lucro × caixa: usa a ponte e o maior ajuste", () => {
    const r = responderAoCfo("lucro_x_caixa", base);
    expect(r.causaProvavel).toContain("Receitas não recebidas");
    expect(r.prioridade).toBe("Alta");
  });

  // Sem saldo bancário a resposta fala de títulos, não de caixa — e é Alta quando fecha negativo.
  it("60 dias: negativo é prioridade alta", () => {
    const r = responderAoCfo("caixa_60_dias", base);
    expect(r.diagnostico.startsWith("Não")).toBe(true);
    expect(r.prioridade).toBe("Alta");
    const positivo = responderAoCfo("caixa_60_dias", { ...base, proximos60: { entradas: 50_000, saidas: 1 } });
    expect(positivo.prioridade).toBe("Baixa");
  });

  it("cliente de risco: concentração acima de 40%", () => {
    const r = responderAoCfo("cliente_risco", base);
    expect(r.diagnostico).toContain("Cliente A");
    expect(r.prioridade).toBe("Alta");
  });

  it("sem despesa crescendo, diz isso em vez de inventar causa", () => {
    const r = responderAoCfo("despesa_cresceu", { ...base, atual: base.anterior });
    expect(r.diagnostico).toContain("Nenhum");
    expect(r.prioridade).toBe("Baixa");
  });
});

describe("caixa em 60 dias com saldo bancário", () => {
  // base: a receber 10.000 e a pagar 40.000 em 60 dias — os títulos sozinhos fecham negativos.
  it("com saldo, a resposta é se o caixa aguenta, e o saldo entra nas evidências", () => {
    const r = responderAoCfo("caixa_60_dias", { ...base, saldoBancario: { centavos: 50_000, atualizadoAteKey: "2026-09-15" } });
    expect(r.diagnostico.startsWith("Sim")).toBe(true);
    expect(r.prioridade).toBe("Baixa");
    expect(r.evidencias[0]).toContain("15/09");
  });

  it("saldo que não cobre o compromissado é Alta", () => {
    const r = responderAoCfo("caixa_60_dias", { ...base, saldoBancario: { centavos: 10_000, atualizadoAteKey: null } });
    expect(r.diagnostico.startsWith("Não")).toBe(true);
    expect(r.prioridade).toBe("Alta");
  });
});
