import { describe, it, expect } from "vitest";
import { lerRespostaDoBoleto } from "./leituraDoBoleto";

// Boleto fictício: Itaú, vencimento 30/10/2026, R$ 1.234,56 (a mesma linha de
// referência de `boleto.test.ts`). CNPJs e CPF de exemplo, com dígito válido.
const LINHA = "34191091233456781234156789000009516150000123456";
const HOJE = "2026-10-19";
const FORNECEDOR = "11222333000181";
const EMPRESA = "11444777000161";

function resposta(extra: Record<string, unknown> = {}) {
  return {
    tipoDoDocumento: "boleto",
    beneficiario: "Imobiliária Exemplo Ltda",
    documentoDoBeneficiario: "11.222.333/0001-81",
    pagador: "Empresa Cliente Ltda",
    documentoDoPagador: EMPRESA,
    linhaDigitavel: LINHA,
    valor: 1234.56,
    vencimento: "2026-10-30",
    dataDoDocumento: "2026-10-15",
    numeroDoDocumento: "AL-1026",
    nossoNumero: "109/12345678-9",
    descricao: "Aluguel de outubro/2026",
    ...extra,
  };
}

describe("lerRespostaDoBoleto", () => {
  it("leitura que bate com a linha digitável: nada a conferir, nenhum aviso", () => {
    const r = lerRespostaDoBoleto(resposta(), HOJE, EMPRESA);
    expect(r).toMatchObject({
      ehBoleto: true,
      beneficiario: "Imobiliária Exemplo Ltda",
      documentoDoBeneficiario: FORNECEDOR,
      valorCentavos: 123456,
      vencimentoKey: "2026-10-30",
      emissaoKey: "2026-10-15",
      numeroDocumento: "AL-1026",
      linhaDigitavel: "34191.09123 34567.812341 56789.000009 5 16150000123456",
      descricao: "Aluguel de outubro/2026",
    });
    expect(r.conferir).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("a linha digitável manda no valor e no vencimento, e a divergência vira aviso", () => {
    const r = lerRespostaDoBoleto(resposta({ valor: 1243.56, vencimento: "2026-10-31" }), HOJE, EMPRESA);
    expect(r.valorCentavos).toBe(123456);
    expect(r.vencimentoKey).toBe("2026-10-30");
    expect(r.avisos).toEqual([
      "A IA leu R$ 1.243,56, mas a linha digitável diz R$ 1.234,56 — ficou o da linha.",
      "A IA leu o vencimento 31/10/2026, mas a linha digitável diz 30/10/2026 — ficou o da linha.",
    ]);
    expect(r.conferir).toEqual([]);
  });

  it("linha que não fecha: valor e vencimento da IA, marcados para conferir", () => {
    const errada = LINHA.slice(0, 40) + "9" + LINHA.slice(41);
    const r = lerRespostaDoBoleto(resposta({ linhaDigitavel: errada }), HOJE, EMPRESA);
    expect(r.valorCentavos).toBe(123456);
    expect(r.linhaDigitavel).toBeNull();
    expect(r.conferir).toEqual(expect.arrayContaining(["valor", "vencimento"]));
    expect(r.avisos[0]).toMatch(/^A linha digitável lida não fecha/);
  });

  it("sem linha digitável: valor e vencimento para conferir", () => {
    const r = lerRespostaDoBoleto(resposta({ linhaDigitavel: "" }), HOJE, EMPRESA);
    expect(r.conferir).toEqual(expect.arrayContaining(["valor", "vencimento"]));
    expect(r.avisos).toContain("A IA não achou a linha digitável. Confira valor e vencimento no boleto.");
  });

  it("CNPJ do beneficiário com dígito errado é descartado, e o fornecedor fica para escolher", () => {
    const r = lerRespostaDoBoleto(resposta({ documentoDoBeneficiario: "11222333000182" }), HOJE, EMPRESA);
    expect(r.documentoDoBeneficiario).toBeNull();
    expect(r.conferir).toContain("fornecedor");
    expect(r.avisos[0]).toMatch(/não é válido e ficou de fora/);
  });

  it("boleto de outro pagador avisa para conferir a empresa", () => {
    const r = lerRespostaDoBoleto(resposta({ documentoDoPagador: "52998224725", pagador: "Fulano de Tal" }), HOJE, EMPRESA);
    expect(r.avisos).toContain(
      "O pagador deste boleto é Fulano de Tal (52998224725), não a empresa em que você está lançando. Confira a empresa."
    );
  });

  it("filial da mesma raiz de CNPJ não é outro pagador", () => {
    // Mesma raiz (11444777), outra filial; o dígito não importa para a comparação de raiz,
    // mas o documento precisa ser válido para ser lido — 11444777000161 é a própria matriz.
    const r = lerRespostaDoBoleto(resposta({ documentoDoPagador: EMPRESA }), HOJE, "11444777000242");
    expect(r.avisos).toEqual([]);
  });

  it("emissão no futuro é descartada", () => {
    expect(lerRespostaDoBoleto(resposta({ dataDoDocumento: "2026-11-02" }), HOJE, EMPRESA).emissaoKey).toBeNull();
  });

  it("sem nº do documento, usa o nosso número", () => {
    expect(lerRespostaDoBoleto(resposta({ numeroDoDocumento: "" }), HOJE, EMPRESA).numeroDocumento).toBe("109/12345678-9");
  });

  it("sem descrição, descreve pelo beneficiário", () => {
    expect(lerRespostaDoBoleto(resposta({ descricao: "" }), HOJE, EMPRESA).descricao).toBe("Boleto Imobiliária Exemplo Ltda");
  });

  it("arquivo que não é cobrança avisa e não inventa nada", () => {
    const r = lerRespostaDoBoleto({ tipoDoDocumento: "outro" }, HOJE, EMPRESA);
    expect(r.ehBoleto).toBe(false);
    expect(r.valorCentavos).toBeNull();
    expect(r.avisos[0]).toMatch(/não reconheceu este arquivo/);
  });

  it("resposta que não é objeto não quebra", () => {
    expect(lerRespostaDoBoleto(null, HOJE, null).ehBoleto).toBe(false);
  });
});
