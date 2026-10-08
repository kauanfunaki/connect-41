import { describe, expect, it } from "vitest";
import {
  alvoDoCampo,
  ancoraVisivel,
  ehCampoDeTexto,
  emValidacaoSilenciosa,
  instalarValidacaoSilenciosa,
  mensagemDoCampo,
  posicaoDoBalao,
  type CampoValidavel,
} from "./validacaoDoCampo";

const VALIDO = {
  valid: true,
  valueMissing: false,
  typeMismatch: false,
  patternMismatch: false,
  tooLong: false,
  tooShort: false,
  rangeUnderflow: false,
  rangeOverflow: false,
  stepMismatch: false,
  badInput: false,
  customError: false,
};

function campo(motivo: Partial<typeof VALIDO>, extra: Partial<CampoValidavel> = {}): CampoValidavel {
  return {
    tagName: "INPUT",
    type: "text",
    value: "",
    validationMessage: "Please fill out this field.",
    validity: { ...VALIDO, valid: false, ...motivo },
    ...extra,
  };
}

describe("mensagemDoCampo", () => {
  it("campo obrigatório vazio, conforme o tipo", () => {
    expect(mensagemDoCampo(campo({ valueMissing: true }))).toBe("Preencha este campo.");
    expect(mensagemDoCampo(campo({ valueMissing: true }, { tagName: "SELECT", type: "select-one" }))).toBe(
      "Escolha uma opção da lista."
    );
    expect(mensagemDoCampo(campo({ valueMissing: true }, { type: "checkbox" }))).toBe("Marque esta opção para continuar.");
    expect(mensagemDoCampo(campo({ valueMissing: true }, { type: "radio" }))).toBe("Escolha uma das opções.");
    expect(mensagemDoCampo(campo({ valueMissing: true }, { type: "file" }))).toBe("Escolha um arquivo.");
    expect(mensagemDoCampo(campo({ valueMissing: true }, { tagName: "textarea", type: undefined }))).toBe("Preencha este campo.");
  });

  it("o erro posto por setCustomValidity vale como veio (campos de data)", () => {
    expect(
      mensagemDoCampo(campo({ customError: true }, { validationMessage: "Data inválida — use dd/mm/aaaa." }))
    ).toBe("Data inválida — use dd/mm/aaaa.");
  });

  it("formato, tamanho e limites", () => {
    expect(mensagemDoCampo(campo({ typeMismatch: true }, { type: "email" }))).toMatch(/^Digite um e-mail válido/);
    expect(mensagemDoCampo(campo({ typeMismatch: true }, { type: "url" }))).toMatch(/https:\/\//);
    expect(mensagemDoCampo(campo({ patternMismatch: true }, { title: "Só os 8 números do CEP" }))).toBe("Só os 8 números do CEP");
    expect(mensagemDoCampo(campo({ patternMismatch: true }))).toBe("Use o formato pedido.");
    expect(mensagemDoCampo(campo({ tooShort: true }, { minLength: 8, value: "abc" }))).toBe(
      "Use pelo menos 8 caracteres (agora são 3)."
    );
    expect(mensagemDoCampo(campo({ tooLong: true }, { maxLength: 2, value: "abc" }))).toBe(
      "Use no máximo 2 caracteres (agora são 3)."
    );
    expect(mensagemDoCampo(campo({ rangeUnderflow: true }, { type: "number", min: "0.5" }))).toBe("O mínimo é 0,5.");
    expect(mensagemDoCampo(campo({ rangeOverflow: true }, { max: "2026-12-31" }))).toBe("O máximo é 31/12/2026.");
    expect(mensagemDoCampo(campo({ badInput: true }, { type: "number" }))).toBe("Digite só números.");
  });

  it("motivo desconhecido cai na mensagem do navegador", () => {
    expect(mensagemDoCampo(campo({}, { validationMessage: "Outra coisa." }))).toBe("Outra coisa.");
    expect(mensagemDoCampo(campo({}, { validationMessage: "" }))).toBe("Confira este campo.");
  });
});

describe("alvoDoCampo", () => {
  type No = { id: string; attrs: Record<string, string>; getAttribute(n: string): string | null };
  const no = (id: string, attrs: Record<string, string> = {}): No => ({
    id,
    attrs,
    getAttribute: (n) => attrs[n] ?? null,
  });

  it("o select escondido do Select manda o foco para o gatilho", () => {
    const gatilho = no("uf");
    const select = no("", { "data-c41-foco": "uf" });
    expect(alvoDoCampo(select, (id) => (id === "uf" ? gatilho : null))).toBe(gatilho);
  });

  it("campo comum é o próprio alvo — e também quando o gatilho sumiu", () => {
    const input = no("email");
    expect(alvoDoCampo(input, () => null)).toBe(input);
    const orfao = no("", { "data-c41-foco": "x" });
    expect(alvoDoCampo(orfao, () => null)).toBe(orfao);
  });
});

describe("ancoraVisivel", () => {
  type Caixa = { nome: string; parentElement: Caixa | null; getBoundingClientRect(): { width: number; height: number } };
  const caixa = (nome: string, w: number, h: number, pai: Caixa | null = null): Caixa => ({
    nome,
    parentElement: pai,
    getBoundingClientRect: () => ({ width: w, height: h }),
  });

  it("sobe até o primeiro que ocupa espaço", () => {
    const secao = caixa("secao", 400, 200);
    const escondido = caixa("escondido", 0, 0, caixa("tambem", 0, 0, secao));
    expect(ancoraVisivel(escondido).nome).toBe("secao");
    expect(ancoraVisivel(secao).nome).toBe("secao");
  });

  it("nada visível: fica com o próprio", () => {
    const solto = caixa("solto", 0, 0);
    expect(ancoraVisivel(solto)).toBe(solto);
  });
});

describe("ehCampoDeTexto", () => {
  it("texto, e-mail, número e textarea sim; caixa, rádio, botão e o gatilho do Select não", () => {
    expect(ehCampoDeTexto({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(ehCampoDeTexto({ tagName: "INPUT", type: "email" })).toBe(true);
    expect(ehCampoDeTexto({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(ehCampoDeTexto({ tagName: "TEXTAREA" })).toBe(true);
    expect(ehCampoDeTexto({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(ehCampoDeTexto({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(ehCampoDeTexto({ tagName: "INPUT", type: "radio" })).toBe(false);
    expect(ehCampoDeTexto({ tagName: "BUTTON", type: "button" })).toBe(false);
    expect(ehCampoDeTexto({ tagName: "SELECT", type: "select-one" })).toBe(false);
  });
});

describe("posicaoDoBalao", () => {
  const tela = { largura: 1280, altura: 800 };
  const balao = { largura: 240, altura: 40 };

  it("embaixo do campo, alinhado à esquerda dele, com a seta apontando para o começo do campo", () => {
    const p = posicaoDoBalao({ top: 100, bottom: 136, left: 300, width: 400 }, balao, tela);
    expect(p).toEqual({ top: 144, left: 300, emCima: false, seta: 20 });
  });

  it("em cima quando não cabe embaixo", () => {
    const p = posicaoDoBalao({ top: 740, bottom: 776, left: 300, width: 400 }, balao, tela);
    expect(p.emCima).toBe(true);
    expect(p.top).toBe(740 - 8 - 40);
  });

  it("não sai pela direita da tela, e a seta acompanha o campo", () => {
    const p = posicaoDoBalao({ top: 100, bottom: 136, left: 1200, width: 70 }, balao, tela);
    expect(p.left).toBe(1280 - 240 - 8);
    expect(p.seta).toBe(1200 + 20 - p.left);
  });

  it("no celular estreito, o balão encolhe e a seta fica dentro dele", () => {
    const p = posicaoDoBalao({ top: 100, bottom: 136, left: 0, width: 300 }, { largura: 400, altura: 40 }, { largura: 320, altura: 600 });
    expect(p.left).toBe(8);
    expect(p.seta).toBeGreaterThanOrEqual(12);
    expect(p.seta).toBeLessThanOrEqual(320 - 16 - 12);
  });
});

describe("instalarValidacaoSilenciosa", () => {
  it("marca o checkValidity como pergunta silenciosa, devolve o resultado do original e instala uma vez só", () => {
    const vistos: boolean[] = [];
    class Campo {
      checkValidity() {
        vistos.push(emValidacaoSilenciosa());
        return false;
      }
    }
    instalarValidacaoSilenciosa([Campo.prototype]);
    const embrulhado = Campo.prototype.checkValidity;
    instalarValidacaoSilenciosa([Campo.prototype]);
    expect(Campo.prototype.checkValidity).toBe(embrulhado);

    expect(emValidacaoSilenciosa()).toBe(false);
    expect(new Campo().checkValidity()).toBe(false);
    expect(vistos).toEqual([true]);
    expect(emValidacaoSilenciosa()).toBe(false);
  });

  it("volta ao normal mesmo quando o original lança", () => {
    class Quebrado {
      checkValidity(): boolean {
        throw new Error("x");
      }
    }
    instalarValidacaoSilenciosa([Quebrado.prototype]);
    expect(() => new Quebrado().checkValidity()).toThrow("x");
    expect(emValidacaoSilenciosa()).toBe(false);
  });

  it("sem window (servidor), não faz nada", () => {
    expect(() => instalarValidacaoSilenciosa()).not.toThrow();
  });
});
