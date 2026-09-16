import { describe, it, expect } from "vitest";
import { formasLocaisDoTelefone, telefonesConferem, nomeConfere } from "./vinculo";

describe("formasLocaisDoTelefone", () => {
  it("celular com nono dígito vira as duas formas", () => {
    expect(formasLocaisDoTelefone("(41) 99999-8888")).toEqual(["41999998888", "4199998888"]);
  });

  it("tira o DDI 55 e o zero de discagem", () => {
    expect(formasLocaisDoTelefone("5541999998888")).toContain("41999998888");
    expect(formasLocaisDoTelefone("041 99999-8888")).toContain("41999998888");
  });

  it("celular sem nono dígito ganha a forma com ele", () => {
    expect(formasLocaisDoTelefone("554199998888")).toEqual(["4199998888", "41999998888"]);
  });

  it("fixo não ganha nono dígito", () => {
    expect(formasLocaisDoTelefone("(41) 3333-4444")).toEqual(["4133334444"]);
  });

  it("número que não parece brasileiro não vira palpite", () => {
    expect(formasLocaisDoTelefone("+1 415 555 0100")).toEqual([]);
    expect(formasLocaisDoTelefone("123")).toEqual([]);
    expect(formasLocaisDoTelefone(null)).toEqual([]);
  });
});

describe("telefonesConferem", () => {
  // O caso que motivou as duas formas: o WhatsApp manda sem o nono dígito e a
  // inscrição tem com ele.
  it("WhatsApp sem nono dígito confere com a inscrição com ele", () => {
    expect(telefonesConferem("554199998888", "(41) 99999-8888")).toBe(true);
  });

  it("mesmo número com máscara e DDI diferentes confere", () => {
    expect(telefonesConferem("5541999998888", "41 99999 8888")).toBe(true);
  });

  it("DDD diferente não confere", () => {
    expect(telefonesConferem("5511999998888", "(41) 99999-8888")).toBe(false);
  });

  it("um dígito diferente não confere", () => {
    expect(telefonesConferem("5541999998887", "(41) 99999-8888")).toBe(false);
  });
});

describe("nomeConfere", () => {
  it("nome e sobrenome que estão no cadastro conferem", () => {
    expect(nomeConfere("Maria Silva", "Maria Aparecida da Silva")).toBe(true);
  });

  it("ignora acento, maiúscula e partícula", () => {
    expect(nomeConfere("joao de souza", "João Souza")).toBe(true);
  });

  it("aceita a frase em volta do nome", () => {
    expect(nomeConfere("Oi, meu nome é Maria Silva", "Maria Aparecida da Silva")).toBe(true);
    expect(nomeConfere("sou a Maria Silva", "Maria Silva")).toBe(true);
  });

  it("sobrenome que não está no cadastro não confere", () => {
    expect(nomeConfere("Maria Souza", "Maria Aparecida da Silva")).toBe(false);
  });

  it("primeiro nome diferente não confere", () => {
    expect(nomeConfere("Ana Silva", "Maria Silva")).toBe(false);
  });

  // A resposta mais fácil de adivinhar.
  it("só o primeiro nome não basta quando o cadastro tem sobrenome", () => {
    expect(nomeConfere("Maria", "Maria Silva")).toBe(false);
    expect(nomeConfere("Maria", "Maria")).toBe(true);
  });

  it("mensagem que não é nome não confere", () => {
    expect(nomeConfere("qual o status da minha vaga?", "Maria Silva")).toBe(false);
    expect(nomeConfere("", "Maria Silva")).toBe(false);
    expect(nomeConfere(`Maria ${"Silva ".repeat(40)}`, "Maria Silva")).toBe(false);
  });
});
