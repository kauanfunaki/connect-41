import { describe, it, expect } from "vitest";
import { moraNoMesmoEndereco, algumSocioResideNoEndereco, somaDasParticipacoes } from "./socios";
import { responderViabilidade } from "./viabilidade";

const EMPRESA = { zipCode: "80010-010", addressNumber: "1000", addressComplement: "SALA 5" };

describe("moraNoMesmoEndereco", () => {
  it("mesmo CEP, número e complemento é o mesmo imóvel", () => {
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA })).toBe(true);
  });

  it("máscara do CEP e caixa do complemento não mudam a resposta", () => {
    // "80010010" e "80010-010" são o mesmo CEP; só quem digitou é diferente.
    expect(
      moraNoMesmoEndereco(EMPRESA, { zipCode: "80010010", addressNumber: " 1000 ", addressComplement: "sala 5" })
    ).toBe(true);
  });

  it("CEP diferente é endereço diferente", () => {
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA, zipCode: "80020-020" })).toBe(false);
  });

  it("mesmo CEP e número diferente é endereço diferente", () => {
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA, addressNumber: "1002" })).toBe(false);
  });

  it("sem complemento dos dois lados, CEP e número bastam", () => {
    const semComplemento = { zipCode: "80010-010", addressNumber: "1000", addressComplement: null };
    expect(moraNoMesmoEndereco(semComplemento, { ...semComplemento })).toBe(true);
  });

  it("complementos diferentes são unidades diferentes no mesmo prédio", () => {
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA, addressComplement: "APTO 31" })).toBe(false);
  });
});

describe("quando não dá para afirmar", () => {
  // Declarar residência a um órgão com cadastro incompleto é afirmar o que não
  // se sabe.
  it("falta CEP de um dos lados", () => {
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA, zipCode: null })).toBeNull();
    expect(moraNoMesmoEndereco({ ...EMPRESA, zipCode: "" }, { ...EMPRESA })).toBeNull();
  });

  it("falta número de um dos lados", () => {
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA, addressNumber: null })).toBeNull();
  });

  it("mesmo CEP e número, mas só um lado tem complemento", () => {
    // Pode ser a mesma sala com o cadastro do sócio incompleto, ou o andar de
    // cima. As duas leituras cabem, então nenhuma vale.
    expect(moraNoMesmoEndereco(EMPRESA, { ...EMPRESA, addressComplement: null })).toBeNull();
    expect(moraNoMesmoEndereco({ ...EMPRESA, addressComplement: null }, { ...EMPRESA })).toBeNull();
  });
});

describe("algumSocioResideNoEndereco", () => {
  const mora = { ...EMPRESA };
  const naoMora = { zipCode: "80020-020", addressNumber: "7", addressComplement: null };
  const duvidoso = { ...EMPRESA, addressComplement: null };

  it("a pergunta é sobre o imóvel: um sócio morando ali já responde Sim", () => {
    expect(algumSocioResideNoEndereco(EMPRESA, [naoMora, mora])).toBe(true);
  });

  it("um sim decide antes de qualquer dúvida", () => {
    expect(algumSocioResideNoEndereco(EMPRESA, [duvidoso, mora])).toBe(true);
  });

  it("sem nenhum sim, a dúvida de um sócio contamina o conjunto", () => {
    expect(algumSocioResideNoEndereco(EMPRESA, [naoMora, duvidoso])).toBeNull();
  });

  it("todos morando em outro lugar é Não", () => {
    expect(algumSocioResideNoEndereco(EMPRESA, [naoMora])).toBe(false);
  });

  // Empresa sem sócio na ficha é cadastro que ninguém preencheu, não empresa
  // sem sócio — responder Não aqui seria declarar a partir de um vazio.
  it("sem sócio cadastrado é nulo, e não Não", () => {
    expect(algumSocioResideNoEndereco(EMPRESA, [])).toBeNull();
  });
});

describe("a ponte com a viabilidade", () => {
  const fatos = { exercidaNoLocal: false, ehComercio: false, podeSerOnline: false, areaGrande: false };

  function resideNoLocal(socioNoMesmoEndereco: boolean | null) {
    return responderViabilidade({ ...fatos, socioNoMesmoEndereco })!.find((r) => r.id === "reside-no-local")!;
  }

  it("o cadastro de sócio responde a pergunta que antes ficava para uma pessoa", () => {
    const socios = [{ ...EMPRESA }];
    const r = resideNoLocal(algumSocioResideNoEndereco(EMPRESA, socios));
    expect(r.resposta).toBe("Sim");
    expect(r.conferir).toBeUndefined();
  });

  it("empresa sem sócio cadastrado continua caindo para uma pessoa", () => {
    const r = resideNoLocal(algumSocioResideNoEndereco(EMPRESA, []));
    expect(r.resposta).toBeNull();
    expect(r.conferir).toContain("sócio");
  });
});

describe("somaDasParticipacoes", () => {
  it("soma o que foi preenchido e ignora o que ficou em branco", () => {
    expect(somaDasParticipacoes([{ sharePercent: 60 }, { sharePercent: 40 }])).toBe(100);
    expect(somaDasParticipacoes([{ sharePercent: 60 }, { sharePercent: null }])).toBe(60);
  });

  // Contrato com 99,99% por arredondamento existe; recusar o cadastro por causa
  // disso impediria de guardar o que o contrato diz.
  it("não julga: devolve a soma como ela é", () => {
    expect(somaDasParticipacoes([{ sharePercent: 33.3333 }, { sharePercent: 66.6666 }])).toBeCloseTo(99.9999, 4);
  });
});
