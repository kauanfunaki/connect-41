import { describe, expect, it } from "vitest";
import {
  camposDaLinha,
  camposDaRegraSalva,
  decisaoDaLinha,
  descricaoDaCondicao,
  regraCasa,
  regrasQueCasam,
  textoSugerido,
  validarRegra,
  type CamposDaRegra,
  type RegraParaCasar,
} from "./regras";
import { moeda } from "../formato";

const tarifa: RegraParaCasar = {
  id: "r1",
  nome: "Tarifa do pacote",
  sentido: "SAIDA",
  texto: "Tarifa bancária",
  minCentavos: null,
  maxCentavos: null,
  bankAccountId: null,
  modo: "LANCAR",
  ativa: true,
};

const linhaDaTarifa = { centavos: -1290, memo: "TARIFA BANCARIA PACOTE 09/2026", nome: null, bankAccountId: "itau" };

describe("regraCasa", () => {
  it("texto contém, sem acento nem caixa", () => {
    expect(regraCasa(tarifa, linhaDaTarifa)).toBe(true);
    expect(regraCasa(tarifa, { ...linhaDaTarifa, memo: null, nome: "Tarifa Bancária" })).toBe(true);
    expect(regraCasa(tarifa, { ...linhaDaTarifa, memo: "IOF" })).toBe(false);
  });

  it("o sentido decide: a regra de saída não pega entrada", () => {
    expect(regraCasa(tarifa, { ...linhaDaTarifa, centavos: 1290 })).toBe(false);
    expect(regraCasa(tarifa, { ...linhaDaTarifa, centavos: 0 })).toBe(false);
  });

  it("valor exato e faixa, sem sinal", () => {
    const exato = { ...tarifa, minCentavos: 1290, maxCentavos: 1290 };
    expect(regraCasa(exato, linhaDaTarifa)).toBe(true);
    expect(regraCasa(exato, { ...linhaDaTarifa, centavos: -1291 })).toBe(false);
    const faixa = { ...tarifa, texto: null, minCentavos: 1000, maxCentavos: 2000 };
    expect(regraCasa(faixa, linhaDaTarifa)).toBe(true);
    expect(regraCasa(faixa, { ...linhaDaTarifa, centavos: -999 })).toBe(false);
    expect(regraCasa({ ...faixa, maxCentavos: null }, { ...linhaDaTarifa, centavos: -999_999 })).toBe(true);
  });

  it("conta: nula é qualquer uma", () => {
    expect(regraCasa({ ...tarifa, bankAccountId: "itau" }, linhaDaTarifa)).toBe(true);
    expect(regraCasa({ ...tarifa, bankAccountId: "bb" }, linhaDaTarifa)).toBe(false);
  });

  it("pausada não pega nada", () => {
    expect(regraCasa({ ...tarifa, ativa: false }, linhaDaTarifa)).toBe(false);
  });
});

describe("regrasQueCasam", () => {
  it("só as que pegam, pela ordem do nome", () => {
    const outra = { ...tarifa, id: "r2", nome: "Banco — tarifas", texto: "TARIFA" };
    const iof = { ...tarifa, id: "r3", nome: "IOF", texto: "IOF" };
    expect(regrasQueCasam([tarifa, iof, outra], linhaDaTarifa).map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});

describe("decisaoDaLinha", () => {
  const livre = { lidaDoOmie: false, candidatosDeMesmoValor: 0 };

  it("nenhuma regra, nada", () => {
    expect(decisaoDaLinha([tarifa], { ...linhaDaTarifa, memo: "IOF" }, livre)).toEqual({ tipo: "nenhuma" });
  });

  it("uma regra em modo lançar, sem dúvida: lança", () => {
    expect(decisaoDaLinha([tarifa], linhaDaTarifa, livre)).toEqual({ tipo: "lancar", regra: tarifa });
  });

  it("modo sugerir: sugere, sem motivo de trava", () => {
    const sugere = { ...tarifa, modo: "SUGERIR" as const };
    expect(decisaoDaLinha([sugere], linhaDaTarifa, livre)).toEqual({ tipo: "sugerir", regra: sugere, outras: 0, porQue: null });
  });

  it("empresa ainda lida do Omie: só sugere", () => {
    expect(decisaoDaLinha([tarifa], linhaDaTarifa, { ...livre, lidaDoOmie: true })).toMatchObject({ tipo: "sugerir", porQue: "omie" });
  });

  it("duas regras pegam a linha: sugere a que lançaria, e conta a outra", () => {
    const sugere = { ...tarifa, id: "r0", nome: "A primeira", modo: "SUGERIR" as const };
    expect(decisaoDaLinha([sugere, tarifa], linhaDaTarifa, livre)).toEqual({ tipo: "sugerir", regra: tarifa, outras: 1, porQue: "varias_regras" });
  });

  it("lançamento de mesmo valor esperando a linha: só sugere, para não duplicar", () => {
    expect(decisaoDaLinha([tarifa], linhaDaTarifa, { ...livre, candidatosDeMesmoValor: 1 })).toMatchObject({
      tipo: "sugerir",
      porQue: "lancamento_de_mesmo_valor",
    });
  });

  it("a regra já lançou nesta linha e alguém desfez: não lança sozinha de novo", () => {
    expect(decisaoDaLinha([tarifa], linhaDaTarifa, { ...livre, desfeitas: new Set(["r1"]) })).toMatchObject({
      tipo: "sugerir",
      porQue: "desfeita",
    });
  });
});

const campos = (c: Partial<CamposDaRegra> = {}): CamposDaRegra => ({
  nome: "Tarifa",
  sentido: "SAIDA",
  texto: "TARIFA",
  tipoDoValor: "qualquer",
  valor: "",
  valorMinimo: "",
  valorMaximo: "",
  bankAccountId: "",
  counterpartyId: "banco",
  categoryId: "tarifas",
  costCenterId: "",
  projectId: "",
  descricao: "",
  modo: "SUGERIR",
  ...c,
});

describe("validarRegra", () => {
  it("a regra completa", () => {
    const v = validarRegra(campos({ tipoDoValor: "exato", valor: "12,90", bankAccountId: "itau", modo: "LANCAR" }));
    expect(v).toEqual({
      ok: true,
      regra: {
        nome: "Tarifa",
        sentido: "SAIDA",
        texto: "TARIFA",
        minCentavos: 1290,
        maxCentavos: 1290,
        bankAccountId: "itau",
        counterpartyId: "banco",
        categoryId: "tarifas",
        costCenterId: null,
        projectId: null,
        descricao: null,
        modo: "LANCAR",
      },
    });
  });

  it("precisa de texto ou valor", () => {
    expect(validarRegra(campos({ texto: "" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ texto: "", tipoDoValor: "exato", valor: "5.000,00" }))).toMatchObject({ ok: true });
  });

  it("texto curto demais pegaria tudo", () => {
    expect(validarRegra(campos({ texto: "PIX" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ texto: " - ", tipoDoValor: "exato", valor: "10" }))).toMatchObject({ ok: true, regra: { texto: null } });
  });

  it("faixa: um limite basta, e o mínimo não passa do máximo", () => {
    expect(validarRegra(campos({ tipoDoValor: "faixa", valorMinimo: "100" }))).toMatchObject({ ok: true, regra: { minCentavos: 10000, maxCentavos: null } });
    expect(validarRegra(campos({ tipoDoValor: "faixa" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ tipoDoValor: "faixa", valorMinimo: "200", valorMaximo: "100" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ tipoDoValor: "faixa", valorMinimo: "abc" }))).toMatchObject({ ok: false });
  });

  it("saída precisa de categoria; entrada não", () => {
    expect(validarRegra(campos({ categoryId: "" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ categoryId: "", sentido: "ENTRADA" }))).toMatchObject({ ok: true, regra: { categoryId: null } });
  });

  it("contraparte, nome, sentido e modo são obrigatórios", () => {
    expect(validarRegra(campos({ counterpartyId: "" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ nome: " " }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ sentido: "X" }))).toMatchObject({ ok: false });
    expect(validarRegra(campos({ modo: "X" }))).toMatchObject({ ok: false });
  });
});

describe("descricaoDaCondicao", () => {
  it("a condição numa linha", () => {
    expect(descricaoDaCondicao({ ...tarifa, minCentavos: 1290, maxCentavos: 1290, bankAccountId: "itau" }, "Itaú")).toBe(
      `Saída · contém “Tarifa bancária” · ${moeda(1290)} · só na conta Itaú`
    );
    expect(descricaoDaCondicao({ ...tarifa, sentido: "ENTRADA", texto: null, minCentavos: 100000, maxCentavos: null })).toBe(
      `Entrada · a partir de ${moeda(100000)} · qualquer conta`
    );
  });
});

describe("textoSugerido", () => {
  it("o começo do histórico, sem o que muda todo mês", () => {
    expect(textoSugerido("TARIFA BANCARIA PACOTE 09/2026", null)).toBe("TARIFA BANCARIA PACOTE");
    expect(textoSugerido("Rendimento Aplic. Automática", null)).toBe("RENDIMENTO APLIC AUTOMATICA");
    expect(textoSugerido("PIX ENVIADO PARA 12345678", null)).toBe("PIX ENVIADO");
    expect(textoSugerido(null, "Imobiliária Central")).toBe("IMOBILIARIA CENTRAL");
    expect(textoSugerido("123 456", null)).toBe("");
  });
});

describe("camposDaLinha", () => {
  it("a regra que a linha conciliada propõe", () => {
    const c = camposDaLinha(linhaDaTarifa, { counterpartyId: "banco", categoryId: "tarifas", costCenterId: null, projectId: "p" });
    expect(c).toMatchObject({
      nome: "Tarifa bancaria pacote",
      sentido: "SAIDA",
      texto: "TARIFA BANCARIA PACOTE",
      tipoDoValor: "qualquer",
      valor: "12,90",
      bankAccountId: "itau",
      counterpartyId: "banco",
      categoryId: "tarifas",
      projectId: "p",
      modo: "SUGERIR",
    });
    expect(validarRegra(c)).toMatchObject({ ok: true });
  });

  it("sem texto aproveitável, o valor exato identifica a linha", () => {
    const c = camposDaLinha({ centavos: 500000, memo: "123", nome: null, bankAccountId: "itau", contraparteNome: "Inquilino" }, {
      counterpartyId: "x",
      categoryId: null,
      costCenterId: null,
      projectId: null,
    });
    expect(c).toMatchObject({ nome: "Inquilino", sentido: "ENTRADA", texto: "", tipoDoValor: "exato", valor: "5000,00" });
    expect(validarRegra(c)).toMatchObject({ ok: true });
  });
});

describe("camposDaRegraSalva", () => {
  const acao = { counterpartyId: "banco", categoryId: "tarifas", costCenterId: null, projectId: null, descricao: null };

  it("a regra gravada volta ao formulário e se valida igual", () => {
    for (const faixa of [
      { minCentavos: 1290, maxCentavos: 1290 },
      { minCentavos: 100000, maxCentavos: null },
      { minCentavos: 100, maxCentavos: 200050 },
      { minCentavos: null, maxCentavos: null },
    ]) {
      const regra = { ...tarifa, ...faixa, ...acao };
      const v = validarRegra(camposDaRegraSalva(regra));
      expect(v).toMatchObject({ ok: true, regra: { ...faixa, texto: "Tarifa bancária", modo: "LANCAR" } });
    }
  });

  it("o tipo do valor sai da faixa", () => {
    expect(camposDaRegraSalva({ ...tarifa, ...acao, minCentavos: 1290, maxCentavos: 1290 })).toMatchObject({ tipoDoValor: "exato", valor: "12,90" });
    expect(camposDaRegraSalva({ ...tarifa, ...acao, minCentavos: null, maxCentavos: 5 })).toMatchObject({ tipoDoValor: "faixa", valorMaximo: "0,05" });
    expect(camposDaRegraSalva({ ...tarifa, ...acao })).toMatchObject({ tipoDoValor: "qualquer" });
  });
});
