import { describe, expect, it } from "vitest";
import {
  normalizarTelefone,
  quemAvisarDoLead,
  rotuloDaOrigem,
  slugDoEscritorioDaFicha,
  statusDoRecorte,
  textoDoAvisoDeLead,
  validarFicha,
  ORIGEM_FICHA_DO_PORTAL,
  RECORTES_DOS_LEADS,
  ROTULO_DO_STATUS,
  STATUS_DO_LEAD,
  VARIANTE_DO_STATUS,
} from "./regras";

// CNPJ com dígito verificador certo (o da 41 TEC, que está na política de privacidade).
const CNPJ_VALIDO = "64.620.403/0001-16";

const FICHA_BOA = {
  nome: "  Maria   da Silva ",
  email: " Maria@Empresa.com.BR ",
  telefone: "(41) 99999-8888",
  empresa: "Padaria Boa Massa",
  cnpj: "",
  mensagem: "  Quero trocar de contador.\nTenho duas lojas.  ",
  aceite: "1",
};

describe("validarFicha", () => {
  it("ficha boa sai limpa: espaços, caixa do e-mail, telefone em dígitos", () => {
    const r = validarFicha(FICHA_BOA);
    expect(r).toEqual({
      ok: true,
      ficha: {
        nome: "Maria da Silva",
        email: "maria@empresa.com.br",
        telefone: "41999998888",
        empresa: "Padaria Boa Massa",
        cnpj: null,
        mensagem: "Quero trocar de contador.\nTenho duas lojas.",
      },
    });
  });

  it("CNPJ é opcional, mas quando vem precisa ter o dígito verificador certo", () => {
    const comCnpj = validarFicha({ ...FICHA_BOA, cnpj: CNPJ_VALIDO });
    expect(comCnpj.ok && comCnpj.ficha.cnpj).toBe("64620403000116");

    const errado = validarFicha({ ...FICHA_BOA, cnpj: "64.620.403/0001-17" });
    expect(errado).toMatchObject({ ok: false, campo: "cnpj" });
    expect(validarFicha({ ...FICHA_BOA, cnpj: "123" })).toMatchObject({ ok: false, campo: "cnpj" });
    expect(validarFicha({ ...FICHA_BOA, cnpj: "11111111111111" })).toMatchObject({ ok: false, campo: "cnpj" });
  });

  it("cada obrigatório faltando aponta o próprio campo", () => {
    expect(validarFicha({ ...FICHA_BOA, nome: " " })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarFicha({ ...FICHA_BOA, email: "maria@" })).toMatchObject({ ok: false, campo: "email" });
    expect(validarFicha({ ...FICHA_BOA, telefone: "9999-8888" })).toMatchObject({ ok: false, campo: "telefone" });
    expect(validarFicha({ ...FICHA_BOA, empresa: "" })).toMatchObject({ ok: false, campo: "empresa" });
    expect(validarFicha({ ...FICHA_BOA, aceite: undefined })).toMatchObject({ ok: false, campo: "aceite" });
  });

  it("o aceite da política é obrigatório, e só um valor de caixa marcada vale", () => {
    expect(validarFicha({ ...FICHA_BOA, aceite: "on" }).ok).toBe(true);
    expect(validarFicha({ ...FICHA_BOA, aceite: "0" })).toMatchObject({ ok: false, campo: "aceite" });
  });

  it("mensagem vazia vira nulo; longa demais é recusada", () => {
    const vazia = validarFicha({ ...FICHA_BOA, mensagem: "   " });
    expect(vazia.ok && vazia.ficha.mensagem).toBeNull();
    expect(validarFicha({ ...FICHA_BOA, mensagem: "a".repeat(2001) })).toMatchObject({ ok: false, campo: "mensagem" });
  });

  it("campo que não é texto (FormData com arquivo, null) conta como vazio", () => {
    expect(validarFicha({ ...FICHA_BOA, nome: null })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarFicha({ ...FICHA_BOA, email: 42 })).toMatchObject({ ok: false, campo: "email" });
  });

  it("textos longos demais são recusados em vez de cortados", () => {
    expect(validarFicha({ ...FICHA_BOA, nome: "a".repeat(121) })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarFicha({ ...FICHA_BOA, empresa: "a".repeat(161) })).toMatchObject({ ok: false, campo: "empresa" });
  });
});

describe("normalizarTelefone", () => {
  it("aceita o que se digita de verdade e guarda DDD + número", () => {
    expect(normalizarTelefone("(41) 99999-8888")).toBe("41999998888");
    expect(normalizarTelefone("+55 41 99999-8888")).toBe("41999998888");
    expect(normalizarTelefone("041 3333-4444")).toBe("4133334444");
    expect(normalizarTelefone("4133334444")).toBe("4133334444");
  });

  it("sem DDD, curto, longo ou com DDD inexistente não é telefone", () => {
    expect(normalizarTelefone("99999-8888")).toBeNull();
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("5541999998888123")).toBeNull();
    expect(normalizarTelefone("(10) 99999-8888")).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
  });
});

describe("situação e origem", () => {
  it("todo status tem rótulo e cor", () => {
    for (const s of STATUS_DO_LEAD) {
      expect(ROTULO_DO_STATUS[s]).toBeTruthy();
      expect(VARIANTE_DO_STATUS[s]).toBeTruthy();
    }
  });

  it("sem recorte na URL, a lista mostra os em aberto; 'todos' não filtra", () => {
    expect(statusDoRecorte(undefined)).toEqual(["NOVO", "EM_CONTATO"]);
    expect(statusDoRecorte("qualquer-coisa")).toEqual(["NOVO", "EM_CONTATO"]);
    expect(statusDoRecorte("descartados")).toEqual(["DESCARTADO"]);
    expect(statusDoRecorte("todos")).toBeNull();
  });

  it("os recortes não repetem chave", () => {
    const chaves = RECORTES_DOS_LEADS.map((r) => r.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("origem conhecida tem rótulo; a desconhecida aparece como foi gravada", () => {
    expect(rotuloDaOrigem(ORIGEM_FICHA_DO_PORTAL)).toBe("Ficha do portal");
    expect(rotuloDaOrigem("WHATSAPP")).toBe("WHATSAPP");
  });
});

describe("quem recebe e quem é avisado", () => {
  it("o escritório da ficha vem da configuração, sem espaço e em minúsculas", () => {
    expect(slugDoEscritorioDaFicha({ PORTAL_ESCRITORIO_SLUG: " 41Tech " })).toBe("41tech");
    expect(slugDoEscritorioDaFicha({ PORTAL_ESCRITORIO_SLUG: "  " })).toBeNull();
    expect(slugDoEscritorioDaFicha({})).toBeNull();
  });

  it("avisa o setor; sem ninguém no setor, os administradores", () => {
    expect(quemAvisarDoLead({ doSetor: ["a", "b", "a"], administradores: ["adm"] })).toEqual(["a", "b"]);
    expect(quemAvisarDoLead({ doSetor: [], administradores: ["adm", "adm2"] })).toEqual(["adm", "adm2"]);
    expect(quemAvisarDoLead({ doSetor: [], administradores: [] })).toEqual([]);
  });

  it("o texto do sino diz quem e de onde, e cabe na notificação", () => {
    expect(textoDoAvisoDeLead({ nome: "Maria", empresa: "Padaria", origem: ORIGEM_FICHA_DO_PORTAL })).toBe(
      "Novo lead — Maria, Padaria (ficha do portal)."
    );
    expect(textoDoAvisoDeLead({ nome: "Maria", empresa: null, origem: ORIGEM_FICHA_DO_PORTAL })).toBe(
      "Novo lead — Maria (ficha do portal)."
    );
    expect(textoDoAvisoDeLead({ nome: "M".repeat(120), empresa: "E".repeat(160), origem: "X" }).length).toBeLessThanOrEqual(255);
  });
});
