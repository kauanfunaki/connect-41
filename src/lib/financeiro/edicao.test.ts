import { describe, expect, it } from "vitest";
import { travasDaEdicao, aprovacaoDepoisDaEdicao, type ContaParaEditar } from "./edicao";

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
    expect(Object.keys(t).sort()).toEqual(["categoria", "competencia", "emissao", "numeroDocumento", "previsao", "valor", "vencimento"]);
    expect(t.valor).toMatch(/Omie/);
    expect(t.centro).toBeUndefined();
    expect(t.projeto).toBeUndefined();
    expect(t.contraparte).toBeUndefined();
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
