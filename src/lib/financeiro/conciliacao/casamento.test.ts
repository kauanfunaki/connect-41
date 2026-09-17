import { describe, expect, it } from "vitest";
import {
  rankearCandidatos,
  sugestaoForte,
  sugestaoDaTransacao,
  validarSelecao,
  tipoCompativel,
  normalizarTexto,
  type LancamentoCandidato,
  type TransacaoParaCasar,
} from "./casamento";

function lanc(p: Partial<LancamentoCandidato> & { id: string }): LancamentoCandidato {
  return {
    kind: "PAGAR",
    status: "CONFERIDO",
    centavos: 100_00,
    vencimentoKey: "2026-09-10",
    pagoEmKey: null,
    contraparteNome: "Fornecedor Qualquer",
    contraparteDocumento: null,
    conciliado: false,
    ...p,
  };
}

const debito: TransacaoParaCasar = { centavos: -100_00, dataKey: "2026-09-10", memo: "PAGTO BOLETO", nome: null };

describe("rankearCandidatos — quem entra", () => {
  it("só valor exato, tipo compatível, não cancelado e sem vínculo", () => {
    const ranking = rankearCandidatos(debito, [
      lanc({ id: "ok" }),
      lanc({ id: "valor", centavos: 100_01 }),
      lanc({ id: "tipo", kind: "RECEBER" }),
      lanc({ id: "cancelado", status: "CANCELADO" }),
      lanc({ id: "conciliado", conciliado: true }),
    ]);
    expect(ranking.map((c) => c.lancamento.id)).toEqual(["ok"]);
  });

  it("crédito casa com conta a receber", () => {
    const credito = { ...debito, centavos: 100_00 };
    const ranking = rankearCandidatos(credito, [lanc({ id: "p" }), lanc({ id: "r", kind: "RECEBER" })]);
    expect(ranking.map((c) => c.lancamento.id)).toEqual(["r"]);
  });

  it("fora da janela continua na lista, sem pontos de data", () => {
    const [c] = rankearCandidatos(debito, [lanc({ id: "longe", vencimentoKey: "2026-08-01" })]);
    expect(c).toMatchObject({ naJanela: false, pontos: 0 });
  });
});

describe("rankearCandidatos — pontuação", () => {
  it("janela: 10 dias de atraso entra, 11 não; 5 adiantado entra, 6 não", () => {
    const pontos = (vencimentoKey: string) => rankearCandidatos(debito, [lanc({ id: "x", vencimentoKey })])[0]!;
    expect(pontos("2026-08-31").naJanela).toBe(true);
    expect(pontos("2026-08-30").naJanela).toBe(false);
    expect(pontos("2026-09-15").naJanela).toBe(true);
    expect(pontos("2026-09-16").naJanela).toBe(false);
  });

  it("mais perto da data vale mais", () => {
    const ranking = rankearCandidatos(debito, [
      lanc({ id: "tres", vencimentoKey: "2026-09-07" }),
      lanc({ id: "mesmo", vencimentoKey: "2026-09-10" }),
    ]);
    expect(ranking.map((c) => c.lancamento.id)).toEqual(["mesmo", "tres"]);
  });

  it("baixa no mesmo dia do extrato é o sinal mais forte", () => {
    const ranking = rankearCandidatos(debito, [
      lanc({ id: "venc", vencimentoKey: "2026-09-10" }),
      lanc({ id: "pago", status: "PAGO", vencimentoKey: "2026-09-01", pagoEmKey: "2026-09-10" }),
    ]);
    expect(ranking[0]!.lancamento.id).toBe("pago");
    expect(ranking[0]!.motivos).toContain("baixa_mesmo_dia");
  });

  it("baixa longe da data do extrato não conta como data", () => {
    const [c] = rankearCandidatos(debito, [lanc({ id: "pago", status: "PAGO", pagoEmKey: "2026-09-01" })]);
    expect(c).toMatchObject({ naJanela: false, pontos: 0 });
  });

  it("nome da contraparte no memo, sem acento e sem caixa", () => {
    const tx = { ...debito, memo: "PIX ENVIADO CONSTRUCOES ACAI LTDA" };
    const [c] = rankearCandidatos(tx, [lanc({ id: "x", contraparteNome: "Construções Açaí Ltda" })]);
    expect(c!.motivos).toContain("nome");
  });

  it("CNPJ com pontuação no memo casa pelo documento", () => {
    const tx = { ...debito, memo: "TED 12.345.678/0001-90 FORNECEDOR" };
    const [c] = rankearCandidatos(tx, [lanc({ id: "x", contraparteDocumento: "12345678000190", contraparteNome: "Outro Nome" })]);
    expect(c!.motivos).toContain("documento");
  });

  it("nome parcial: palavras que identificam, não as genéricas", () => {
    const tx = { ...debito, memo: "PAG BOLETO SABESP" };
    const [c] = rankearCandidatos(tx, [lanc({ id: "x", contraparteNome: "Sabesp Companhia de Saneamento" })]);
    expect(c!.motivos).toContain("nome_parcial");

    const generico = { ...debito, memo: "PAGAMENTO COMERCIO LTDA" };
    const [g] = rankearCandidatos(generico, [lanc({ id: "y", contraparteNome: "Padaria Comercio Ltda" })]);
    expect(g!.motivos).not.toContain("nome_parcial");
  });
});

describe("sugestaoForte", () => {
  it("único candidato no dia do vencimento é sugestão", () => {
    const ranking = rankearCandidatos(debito, [lanc({ id: "x" })]);
    expect(sugestaoForte(ranking)?.lancamento.id).toBe("x");
  });

  it("dois iguais no mesmo dia empatam e não sugerem", () => {
    const ranking = rankearCandidatos(debito, [lanc({ id: "a" }), lanc({ id: "b" })]);
    expect(sugestaoForte(ranking)).toBeNull();
  });

  it("o nome desempata os iguais", () => {
    const tx = { ...debito, memo: "BOLETO IMOBILIARIA CENTRAL" };
    const ranking = rankearCandidatos(tx, [
      lanc({ id: "a", contraparteNome: "Condomínio Jardim" }),
      lanc({ id: "b", contraparteNome: "Imobiliária Central" }),
    ]);
    expect(sugestaoForte(ranking)?.lancamento.id).toBe("b");
  });

  it("candidato fraco (longe do vencimento, sem nome) não é sugestão", () => {
    const ranking = rankearCandidatos(debito, [lanc({ id: "x", vencimentoKey: "2026-09-02" })]);
    expect(ranking).toHaveLength(1);
    expect(sugestaoForte(ranking)).toBeNull();
  });

  it("segundo logo abaixo do limiar ainda é dúvida", () => {
    const ranking = rankearCandidatos(debito, [lanc({ id: "a" }), lanc({ id: "b", vencimentoKey: "2026-09-09" })]);
    expect(ranking[1]!.pontos).toBeLessThan(50);
    expect(sugestaoForte(ranking)).toBeNull();
  });

  it("lista vazia", () => {
    expect(sugestaoForte([])).toBeNull();
  });
});

describe("sugestaoDaTransacao — conta travada na aprovação", () => {
  const travada = "Aguardando aprovação — a baixa só é liberada depois que a conta for aprovada.";
  const tx = { ...debito, memo: "BOLETO IMOBILIARIA CENTRAL" };

  it("a travada continua sendo a sugestão, com o motivo no lugar do confirmar", () => {
    const ranking = rankearCandidatos(tx, [lanc({ id: "b", contraparteNome: "Imobiliária Central", bloqueioDeBaixa: travada })]);
    expect(sugestaoDaTransacao(ranking)).toMatchObject({ candidato: { lancamento: { id: "b" } }, bloqueio: travada });
  });

  it("travar a melhor não promove a segunda a sugestão confirmável", () => {
    // Sem nome no extrato para o condomínio: se a imobiliária saísse do ranking por
    // estar travada, o condomínio de mesmo valor viraria "sugestão" — o casamento errado.
    const ranking = rankearCandidatos(tx, [
      lanc({ id: "a", contraparteNome: "Condomínio Jardim" }),
      lanc({ id: "b", contraparteNome: "Imobiliária Central", bloqueioDeBaixa: travada }),
    ]);
    const sugestao = sugestaoDaTransacao(ranking);
    expect(sugestao?.candidato.lancamento.id).toBe("b");
    expect(sugestao?.bloqueio).toBe(travada);
  });

  it("sem bloqueio a sugestão é confirmável, e sem sugestão forte não há nada", () => {
    expect(sugestaoDaTransacao(rankearCandidatos(debito, [lanc({ id: "x" })]))).toMatchObject({ bloqueio: null });
    expect(sugestaoDaTransacao(rankearCandidatos(debito, [lanc({ id: "a" }), lanc({ id: "b" })]))).toBeNull();
  });
});

describe("validarSelecao", () => {
  it("soma no centavo fecha", () => {
    const r = validarSelecao({ centavos: -300_00 }, [
      lanc({ id: "a", centavos: 100_00 }),
      lanc({ id: "b", centavos: 200_00 }),
    ]);
    expect(r).toEqual({ ok: true, totalCentavos: 300_00 });
  });

  it("conta travada pela aprovação por alçada não se concilia, e o motivo aparece", () => {
    const r = validarSelecao({ centavos: -100_00 }, [
      { ...lanc({ id: "a" }), bloqueioDeBaixa: "Aguardando aprovação — a baixa só é liberada depois." },
    ]);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("Aguardando aprovação") });
    expect(validarSelecao({ centavos: -100_00 }, [{ ...lanc({ id: "a" }), bloqueioDeBaixa: null }]).ok).toBe(true);
  });

  it("um centavo de diferença não fecha", () => {
    const r = validarSelecao({ centavos: -300_00 }, [lanc({ id: "a", centavos: 299_99 })]);
    expect(r.ok).toBe(false);
  });

  it("recusas", () => {
    expect(validarSelecao({ centavos: -100_00 }, []).ok).toBe(false);
    expect(validarSelecao({ centavos: 0 }, [lanc({ id: "a" })]).ok).toBe(false);
    expect(validarSelecao({ centavos: 100_00 }, [lanc({ id: "a" })]).ok).toBe(false);
    expect(validarSelecao({ centavos: -100_00 }, [lanc({ id: "a", status: "CANCELADO" })]).ok).toBe(false);
    expect(validarSelecao({ centavos: -100_00 }, [lanc({ id: "a", conciliado: true })]).ok).toBe(false);
    expect(
      validarSelecao({ centavos: -200_00 }, [lanc({ id: "a" }), lanc({ id: "a" })])
    ).toEqual({ ok: false, erro: expect.stringContaining("duas vezes") });
  });
});

describe("auxiliares", () => {
  it("tipo pelo sinal", () => {
    expect(tipoCompativel(-1)).toBe("PAGAR");
    expect(tipoCompativel(1)).toBe("RECEBER");
    expect(tipoCompativel(0)).toBeNull();
  });

  it("normaliza texto", () => {
    expect(normalizarTexto("  São  João/Açaí-ltda. ")).toBe("SAO JOAO ACAI LTDA");
  });
});
