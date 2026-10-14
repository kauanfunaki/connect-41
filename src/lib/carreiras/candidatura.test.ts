import { describe, expect, it } from "vitest";
import { validarRespostas } from "@/lib/recrutamento/respostas";
import {
  CANDIDATURA_VAZIA,
  PASSOS_DA_CANDIDATURA,
  camposParaEnvio,
  lerValorEmReais,
  primeiroPassoComErro,
  problemaNoCurriculo,
  tamanhoLegivel,
  validarPasso,
  type DadosDaCandidatura,
} from "./candidatura";

// A candidatura em passos do 41 Carreiras (15/10/2026): cada passo confere o
// que tem, em português, com as regras da rota `/api/carreiras/apply`.

const PREENCHIDA: DadosDaCandidatura = {
  ...CANDIDATURA_VAZIA,
  name: "Maria da Silva",
  email: "maria@exemplo.com.br",
  phone: "(41) 99999-0000",
  city: "Curitiba",
  stateCode: "PR",
  pretensaoSalarial: "3.500,00",
  disponibilidade: "Em até 15 dias",
  deslocamentoMinutos: "30",
  consent: true,
};

const MB = 1024 * 1024;

describe("os passos", () => {
  it("Seus dados → Currículo → Perguntas → Revisão", () => {
    expect(PASSOS_DA_CANDIDATURA.map((p) => p.rotulo)).toEqual(["Seus dados", "Currículo", "Perguntas", "Revisão"]);
  });

  it("preenchida certinho, nenhum passo tem erro", () => {
    for (const p of PASSOS_DA_CANDIDATURA) expect(validarPasso(p.chave, PREENCHIDA), p.chave).toEqual({});
    expect(primeiroPassoComErro(PREENCHIDA)).toBeNull();
  });

  it("vazia, o primeiro passo com erro é o dos dados", () => {
    expect(primeiroPassoComErro(CANDIDATURA_VAZIA)).toBe("dados");
  });
});

describe("passo 1: seus dados", () => {
  it("nome e e-mail obrigatórios, com as regras da rota", () => {
    expect(validarPasso("dados", CANDIDATURA_VAZIA)).toEqual({ name: "Informe seu nome completo.", email: "Informe seu e-mail." });
    expect(validarPasso("dados", { ...PREENCHIDA, name: "Jo" }).name).toBe("Informe seu nome completo.");
    expect(validarPasso("dados", { ...PREENCHIDA, email: "maria@" }).email).toMatch(/^Confira o e-mail/);
    expect(validarPasso("dados", { ...PREENCHIDA, email: "maria @x.com" }).email).toMatch(/^Confira o e-mail/);
  });

  it("telefone, cidade e estado são opcionais — mas, se vierem, precisam fazer sentido", () => {
    expect(validarPasso("dados", { ...PREENCHIDA, phone: "", city: "", stateCode: "" })).toEqual({});
    expect(validarPasso("dados", { ...PREENCHIDA, phone: "9999-0000" }).phone).toMatch(/DDD/);
    expect(validarPasso("dados", { ...PREENCHIDA, phone: "+55 41 99999-0000" }).phone).toBeUndefined();
    expect(validarPasso("dados", { ...PREENCHIDA, stateCode: "XX" }).stateCode).toBe("Escolha o estado na lista.");
  });
});

describe("passo 2: currículo", () => {
  it("opcional; quando vem, PDF de até 5 MB", () => {
    expect(validarPasso("curriculo", { ...PREENCHIDA, resume: null })).toEqual({});
    expect(validarPasso("curriculo", { ...PREENCHIDA, resume: { nome: "cv.pdf", tipo: "application/pdf", bytes: 2 * MB } })).toEqual({});
    expect(validarPasso("curriculo", { ...PREENCHIDA, resume: { nome: "cv.docx", tipo: "application/msword", bytes: MB } }).resume).toBe(
      "O currículo precisa ser um arquivo PDF.",
    );
    expect(validarPasso("curriculo", { ...PREENCHIDA, resume: { nome: "cv.pdf", tipo: "application/pdf", bytes: 6 * MB } }).resume).toBe(
      "O currículo tem mais de 5 MB. Envie um PDF menor.",
    );
  });

  it("celular que não informa o tipo: vale a extensão .pdf (a rota confere os bytes)", () => {
    expect(problemaNoCurriculo({ nome: "Curriculo.PDF", tipo: "", bytes: MB })).toBeNull();
    expect(problemaNoCurriculo({ nome: "vazio.pdf", tipo: "application/pdf", bytes: 0 })).toMatch(/vazio/);
  });

  it("o tamanho, legível", () => {
    expect(tamanhoLegivel(2.4 * MB)).toBe("2,4 MB");
    expect(tamanhoLegivel(312 * 1024)).toBe("312 KB");
    expect(tamanhoLegivel(10)).toBe("1 KB");
  });
});

describe("passo 3: perguntas", () => {
  it("pretensão e disponibilidade obrigatórias; deslocamento opcional, de 0 a 600 minutos", () => {
    expect(validarPasso("perguntas", { ...PREENCHIDA, pretensaoSalarial: "", disponibilidade: "" })).toEqual({
      pretensaoSalarial: "Informe sua pretensão salarial mensal.",
      disponibilidade: "Diga quando você pode começar.",
    });
    expect(validarPasso("perguntas", { ...PREENCHIDA, pretensaoSalarial: "0" }).pretensaoSalarial).toMatch(/maior que zero/);
    expect(validarPasso("perguntas", { ...PREENCHIDA, pretensaoSalarial: "abc" }).pretensaoSalarial).toMatch(/maior que zero/);
    expect(validarPasso("perguntas", { ...PREENCHIDA, deslocamentoMinutos: "" })).toEqual({});
    expect(validarPasso("perguntas", { ...PREENCHIDA, deslocamentoMinutos: "601" }).deslocamentoMinutos).toMatch(/entre 0 e 600/);
  });

  it("o valor em reais aceita o jeito brasileiro de escrever", () => {
    expect(lerValorEmReais("3.500,00")).toBe(3500);
    expect(lerValorEmReais("R$ 2.750,50")).toBe(2750.5);
    expect(lerValorEmReais("4000")).toBe(4000);
    expect(lerValorEmReais("3500.5")).toBe(3500.5);
    expect(Number.isNaN(lerValorEmReais(""))).toBe(true);
  });
});

describe("passo 4: revisão", () => {
  it("sem a autorização (LGPD), não envia", () => {
    expect(validarPasso("revisao", { ...PREENCHIDA, consent: false })).toEqual({ consent: "Para enviar, marque a autorização de uso dos dados." });
    expect(primeiroPassoComErro({ ...PREENCHIDA, consent: false })).toBe("revisao");
  });
});

describe("o envio: os mesmos campos que a rota lê", () => {
  it("nomes e formatos da rota; a pretensão vai como número", () => {
    expect(camposParaEnvio(PREENCHIDA)).toEqual({
      name: "Maria da Silva",
      email: "maria@exemplo.com.br",
      phone: "(41) 99999-0000",
      city: "Curitiba",
      stateCode: "PR",
      pretensaoSalarial: "3500",
      disponibilidade: "Em até 15 dias",
      deslocamentoMinutos: "30",
      consent: "true",
    });
  });

  it("o que o formulário manda passa na validação das respostas da rota", () => {
    const campos = camposParaEnvio({ ...PREENCHIDA, pretensaoSalarial: "2.750,50" });
    const r = validarRespostas({
      pretensaoSalarial: campos.pretensaoSalarial,
      disponibilidade: campos.disponibilidade,
      deslocamentoMinutos: campos.deslocamentoMinutos,
    });
    expect(r.descartados).toEqual([]);
    expect(r.valores).toEqual({ pretensaoSalarial: 2750.5, disponibilidade: "Em até 15 dias", deslocamentoMinutos: 30 });
  });
});
