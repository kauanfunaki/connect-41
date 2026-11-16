import { describe, expect, it } from "vitest";
import { travasDaEdicao, aprovacaoDepoisDaEdicao, avisoDasTravas, type ContaParaEditar } from "./edicao";

const ABERTA: ContaParaEditar = {
  status: "CONFERIDO",
  paidAt: null,
  closeReason: null,
  fiscalDocumentId: null,
  agreementId: null,
  doOmie: false,
  conciliada: false,
};

const travas = (c: Partial<ContaParaEditar>) => {
  const r = travasDaEdicao({ ...ABERTA, ...c });
  if (!r.pode) throw new Error(r.motivo);
  return r.travas;
};

describe("travasDaEdicao", () => {
  it("manual em aberto: tudo livre", () => {
    expect(travas({})).toEqual({});
  });

  it("paga: classificação livre, valor e vencimento travados com o caminho", () => {
    const t = travas({ status: "PAGO", paidAt: new Date() });
    expect(Object.keys(t).sort()).toEqual(["previsao", "valor", "vencimento"]);
    expect(t.valor).toMatch(/desfaça o pagamento/);
    expect(t.categoria).toBeUndefined();
    expect(t.competencia).toBeUndefined();
  });

  it("conciliada: o motivo diz para desconciliar antes", () => {
    const t = travas({ status: "PAGO", paidAt: new Date(), conciliada: true });
    expect(t.valor).toMatch(/conciliação/);
    expect(t.descricao).toBeUndefined();
  });

  it("veio de nota: valor, emissão, número e contraparte são da nota; vencimento em aberto é livre", () => {
    const t = travas({ fiscalDocumentId: "doc-1" });
    expect(Object.keys(t).sort()).toEqual(["contraparte", "emissao", "numeroDocumento", "valor"]);
    expect(t.valor).toMatch(/estorne/);
  });

  it("veio do Omie: o que a leitura reescreve fica travado, e o motivo é o Omie mesmo depois de paga", () => {
    const t = travas({ doOmie: true, status: "PAGO", paidAt: new Date(), conciliada: true });
    expect(Object.keys(t).sort()).toEqual(["categoria", "competencia", "conta", "emissao", "numeroDocumento", "previsao", "retencoes", "valor", "vencimento"]);
    expect(t.valor).toMatch(/Omie/);
    expect(t.previsao).toMatch(/Omie/);
    expect(t.centro).toBeUndefined();
    expect(t.projeto).toBeUndefined();
    expect(t.contraparte).toBeUndefined();
  });

  it("veio do Omie, em aberto: previsão e conta corrente prevista travadas — a leitura as reescreve (20/10)", () => {
    const t = travas({ doOmie: true });
    expect(t.previsao).toMatch(/Vem do Omie/);
    expect(t.conta).toMatch(/Vem do Omie/);
    // Depois da virada (`presaAoOmie` falso), as duas voltam a ser livres.
    expect(travas({}).previsao).toBeUndefined();
    expect(travas({}).conta).toBeUndefined();
  });

  it("veio do Omie com um departamento só: o centro trava com o caminho; sem departamento, fica livre (20/10)", () => {
    expect(travas({ doOmie: true, centroDoOmie: true }).centro).toMatch(/departamento do título no Omie/);
    expect(travas({ doOmie: true, centroDoOmie: false }).centro).toBeUndefined();
    // Depois da virada (`presaAoOmie` falso), livre mesmo com o departamento guardado.
    expect(travas({ doOmie: false, centroDoOmie: true }).centro).toBeUndefined();
  });

  it("conta de imposto retido: valor, credor e retenções mudam na conta de origem", () => {
    const t = travas({ deRetencao: true });
    expect(Object.keys(t).sort()).toEqual(["contraparte", "retencoes", "valor"]);
    expect(t.valor).toMatch(/Conta de imposto retido/);
  });

  it("fatura do cartão: valor, credor, categoria e retenções vêm das compras; vencimento e conta, não (lote D, 20/10)", () => {
    const t = travas({ daFatura: true });
    expect(Object.keys(t).sort()).toEqual(["categoria", "contraparte", "retencoes", "valor"]);
    expect(t.valor).toMatch(/Fatura do cartão/);
  });

  it("baixa parcial: o valor trava, o vencimento do resto continua livre", () => {
    const t = travas({ temBaixa: true });
    expect(Object.keys(t)).toEqual(["valor"]);
    expect(t.valor).toMatch(/baixa parcial/);
  });

  it("parcela de acordo: valor, vencimento e contraparte são do acordo", () => {
    const t = travas({ agreementId: "ac-1" });
    expect(Object.keys(t).sort()).toEqual(["contraparte", "valor", "vencimento"]);
  });

  it("cancelada, renegociada ou perda não se edita", () => {
    expect(travasDaEdicao({ ...ABERTA, status: "CANCELADO", closeReason: "CANCELADO" })).toMatchObject({ pode: false });
    expect(travasDaEdicao({ ...ABERTA, status: "CANCELADO", closeReason: "RENEGOCIADO" })).toMatchObject({ pode: false, motivo: expect.stringMatching(/acordo/) });
    expect(travasDaEdicao({ ...ABERTA, status: "CANCELADO", closeReason: "PERDA" })).toMatchObject({ pode: false, motivo: expect.stringMatching(/perda/) });
    // O cancelado de antes da coluna `closeReason`.
    expect(travasDaEdicao({ ...ABERTA, status: "CANCELADO" })).toMatchObject({ pode: false });
  });
});

// O aviso do alto da janela (16/11/2026, melhoria-717): cada motivo uma vez,
// com os campos que ele segura — a frase da conciliação aparecia em dois campos.
describe("motivos da trava e o aviso da janela", () => {
  const motivos = (c: Partial<ContaParaEditar>) => {
    const r = travasDaEdicao({ ...ABERTA, ...c });
    if (!r.pode) throw new Error(r.motivo);
    return r.motivos;
  };

  it("em aberto: nenhum motivo, nenhum aviso", () => {
    expect(motivos({})).toEqual([]);
    expect(avisoDasTravas(motivos({}), "PAGAR")).toEqual([]);
  });

  it("conciliada: um motivo só, com o vencimento e o valor", () => {
    const m = motivos({ conciliada: true });
    expect(m).toEqual([{ chave: "conciliada", campos: ["vencimento", "valor"] }]);
    expect(avisoDasTravas(m, "PAGAR")).toEqual([
      {
        chave: "conciliada",
        campos: ["vencimento", "valor"],
        causa: "Conciliada com o extrato",
        naoMuda: "vencimento e valor não mudam.",
        caminho: "Desfaça a conciliação e o pagamento para alterar.",
      },
    ]);
  });

  it("paga e conciliada: um motivo só, com os três campos — a previsão entra na mesma linha", () => {
    const m = motivos({ status: "PAGO", paidAt: new Date(), conciliada: true, temBaixa: true });
    expect(m).toEqual([{ chave: "paga_e_conciliada", campos: ["vencimento", "previsao", "valor"] }]);
    const [linha] = avisoDasTravas(m, "PAGAR");
    expect(`${linha.causa}: ${linha.naoMuda} ${linha.caminho}`).toBe(
      "Paga e conciliada com o extrato: vencimento, previsão e valor não mudam. Desfaça a conciliação e o pagamento para alterar."
    );
  });

  it("paga, sem conciliação: um motivo, e o caminho é desfazer o pagamento", () => {
    const m = motivos({ status: "PAGO", paidAt: new Date(), temBaixa: true });
    expect(m).toEqual([{ chave: "paga", campos: ["vencimento", "previsao", "valor"] }]);
    expect(avisoDasTravas(m, "PAGAR")[0].caminho).toMatch(/Desfaça o pagamento/);
  });

  it("dois motivos: a nota segura os campos dela, o pagamento os que sobram", () => {
    const m = motivos({ fiscalDocumentId: "doc-1", status: "PAGO", paidAt: new Date(), temBaixa: true });
    expect(m).toEqual([
      { chave: "nota", campos: ["contraparte", "emissao", "numeroDocumento", "valor"] },
      { chave: "paga", campos: ["vencimento", "previsao"] },
    ]);
    expect(avisoDasTravas(m, "PAGAR").map((l) => `${l.causa}: ${l.naoMuda}`)).toEqual([
      "Vem da nota fiscal: fornecedor, emissão, nº do documento e valor não mudam.",
      "Paga: vencimento e previsão não mudam.",
    ]);
  });

  it("o motivo que perde todos os campos para um anterior não aparece: Omie paga e conciliada é só Omie", () => {
    const m = motivos({ doOmie: true, status: "PAGO", paidAt: new Date(), conciliada: true, temBaixa: true });
    expect(m.map((x) => x.chave)).toEqual(["omie"]);
  });

  it("baixa parcial: um campo, no singular", () => {
    const [linha] = avisoDasTravas(motivos({ temBaixa: true }), "PAGAR");
    expect(linha.naoMuda).toBe("valor não muda.");
    expect(linha.caminho).toMatch(/Pagamentos/);
  });

  it("conta a receber: fala em cliente e recebimento, e não lista as retenções, que ela não tem", () => {
    const paga = avisoDasTravas(motivos({ status: "PAGO", paidAt: new Date(), conciliada: true }), "RECEBER")[0];
    expect(paga.causa).toBe("Recebida e conciliada com o extrato");
    expect(paga.caminho).toBe("Desfaça a conciliação e o recebimento para alterar.");
    const acordo = avisoDasTravas(motivos({ agreementId: "ac-1" }), "RECEBER")[0];
    expect(acordo.naoMuda).toBe("cliente, vencimento e valor não mudam.");
    const omie = avisoDasTravas(motivos({ doOmie: true }), "RECEBER")[0];
    expect(omie.campos).not.toContain("retencoes");
    expect(avisoDasTravas(motivos({ doOmie: true }), "PAGAR")[0].campos).toContain("retencoes");
    expect(avisoDasTravas(motivos({ temBaixa: true }), "RECEBER")[0].caminho).toMatch(/Recebimentos/);
  });

  it("nenhuma trava perde o motivo: todo campo travado está em um motivo, e só em um", () => {
    const estados: Partial<ContaParaEditar>[] = [
      { doOmie: true, centroDoOmie: true },
      { doOmie: true, status: "PAGO", paidAt: new Date(), conciliada: true, temBaixa: true },
      { fiscalDocumentId: "doc-1", conciliada: true, temBaixa: true },
      { agreementId: "ac-1", status: "PAGO", paidAt: new Date(), temBaixa: true },
      { deRetencao: true, temBaixa: true },
      { daFatura: true, status: "PAGO", paidAt: new Date(), conciliada: true, temBaixa: true },
      { temBaixa: true },
    ];
    for (const estado of estados) {
      const r = travasDaEdicao({ ...ABERTA, ...estado });
      if (!r.pode) throw new Error(r.motivo);
      const nosMotivos = r.motivos.flatMap((m) => m.campos);
      expect([...nosMotivos].sort()).toEqual(Object.keys(r.travas).sort());
      expect(new Set(nosMotivos).size).toBe(nosMotivos.length);
      // No aviso da conta a pagar, os mesmos campos: nada some entre a regra e a tela.
      expect(avisoDasTravas(r.motivos, "PAGAR").flatMap((l) => l.campos).sort()).toEqual(Object.keys(r.travas).sort());
    }
  });

  it("o departamento do Omie é um motivo à parte, só com o centro de custo", () => {
    const m = motivos({ doOmie: true, centroDoOmie: true });
    expect(m.map((x) => x.chave)).toEqual(["omie", "omie_departamento"]);
    expect(m[1].campos).toEqual(["centro"]);
  });
});

describe("aprovacaoDepoisDaEdicao", () => {
  const base = { kind: "PAGAR" as const, approvalStatus: "APROVADO" as const, mudouValor: true, mudouContraparte: false, entraria: true };

  it("aprovada que muda de valor ou de fornecedor volta para a fila", () => {
    expect(aprovacaoDepoisDaEdicao(base)).toBe("REENVIAR");
    expect(aprovacaoDepoisDaEdicao({ ...base, mudouValor: false, mudouContraparte: true })).toBe("REENVIAR");
  });

  it("mudar só a classificação não mexe na aprovação", () => {
    expect(aprovacaoDepoisDaEdicao({ ...base, mudouValor: false })).toBe("MANTEM");
  });

  it("aguardando, reprovada ou sem alçada continuam como estão", () => {
    expect(aprovacaoDepoisDaEdicao({ ...base, approvalStatus: "AGUARDANDO" })).toBe("MANTEM");
    expect(aprovacaoDepoisDaEdicao({ ...base, approvalStatus: "REPROVADO" })).toBe("MANTEM");
    expect(aprovacaoDepoisDaEdicao({ ...base, approvalStatus: "NAO_REQUER" })).toBe("MANTEM");
  });

  it("com o módulo desligado ou a empresa sem alçada, não volta — ninguém aprovaria", () => {
    expect(aprovacaoDepoisDaEdicao({ ...base, entraria: false })).toBe("MANTEM");
  });

  it("conta a receber não passa por aprovação", () => {
    expect(aprovacaoDepoisDaEdicao({ ...base, kind: "RECEBER" })).toBe("MANTEM");
  });
});
