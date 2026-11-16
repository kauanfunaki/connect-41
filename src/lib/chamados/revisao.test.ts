import { describe, expect, it } from "vitest";
import { lerRevisao, PROMPT_DA_REVISAO } from "./revisao";
import { PROMPT_CLASSIFICACAO } from "./classificacao";
import { aberturaSchema, descricaoComRespostas, revisaoDoRascunho, TITULO_DAS_RESPOSTAS } from "./regras";

const categorias = ["senha", "bug"];

describe("revisão antes de abrir (funcionalidade-702)", () => {
  it("lê o título, a categoria da lista, as tags limpas e as perguntas", () => {
    const r = lerRevisao({ categoryId: "senha", reason: "  Pede a recuperação   de senha. ", title: " Recuperar senha do sistema ", tags: [" Senha ", "senha", "ERP"],
      questions: [{ text: "Qual sistema?", options: [] }, { text: "Acontece com todos os usuários?", options: ["Sim", "Não", "Não sei"] }] }, categorias);
    expect(r).toEqual({ titulo: "Recuperar senha do sistema", categoryId: "senha", motivo: "Pede a recuperação de senha.", tags: ["senha", "erp"],
      perguntas: [{ text: "Qual sistema?", options: [] }, { text: "Acontece com todos os usuários?", options: ["Sim", "Não", "Não sei"] }] });
  });
  it("categoria fora da lista fica sem categoria, e a pessoa escolhe", () => {
    expect(lerRevisao({ categoryId: "inventada", reason: "", title: "Pedido", tags: [], questions: [] }, categorias)?.categoryId).toBeNull();
    expect(lerRevisao({ categoryId: null, reason: "", title: "Pedido", tags: [], questions: [] }, categorias)?.categoryId).toBeNull();
  });
  it("corta em três perguntas, tira a repetida, a vazia e a que pede credencial", () => {
    const r = lerRevisao({ categoryId: null, reason: "", title: "", tags: [], questions: [
      { text: "Qual empresa?", options: [] }, { text: "qual empresa?", options: [] }, { text: "", options: [] }, { text: "Qual a sua senha do sistema?", options: [] }, "torta",
      { text: "Desde quando acontece?", options: ["Hoje"] }, { text: "Qual a mensagem de erro?", options: [] }, { text: "Qual o prazo?", options: [] },
    ] }, categorias);
    expect(r?.perguntas.map(p => p.text)).toEqual(["Qual empresa?", "Desde quando acontece?", "Qual a mensagem de erro?"]);
    // Uma opção só não é escolha: a pergunta fica aberta.
    expect(r?.perguntas[1].options).toEqual([]);
  });
  it("resposta que não é objeto não vira revisão", () => {
    expect(lerRevisao(null, categorias)).toBeNull(); expect(lerRevisao("texto", categorias)).toBeNull();
  });
  it("o prompt classifica como a triagem e diz que as perguntas são opcionais e sem credencial", () => {
    expect(PROMPT_DA_REVISAO.startsWith(PROMPT_CLASSIFICACAO)).toBe(true);
    expect(PROMPT_DA_REVISAO).toContain("Nunca peça senha"); expect(PROMPT_DA_REVISAO).toContain("As respostas são opcionais");
  });
});

describe("o que a pessoa aprova na revisão", () => {
  it("as respostas entram no fim da descrição; sem resposta, a descrição sai como foi escrita", () => {
    const respostas = [{ pergunta: "Qual ambiente?", resposta: " Homologação " }, { pergunta: "Desde quando?", resposta: "  " }];
    expect(descricaoComRespostas(" Preciso de acesso. ", respostas)).toBe(`Preciso de acesso.\n\n${TITULO_DAS_RESPOSTAS}\n• Qual ambiente?\n  Homologação`);
    expect(descricaoComRespostas("Preciso de acesso.", [])).toBe("Preciso de acesso.");
    expect(descricaoComRespostas("Preciso de acesso.", [{ pergunta: "Qual?", resposta: "" }])).toBe("Preciso de acesso.");
  });
  it("respostas que passam do limite da descrição são cortadas, e a descrição fica inteira", () => {
    const base = "a".repeat(14800), longa = descricaoComRespostas(base, [{ pergunta: "Qual?", resposta: "b".repeat(2000) }]);
    expect(longa.length).toBe(15000); expect(longa.startsWith(base)).toBe(true); expect(longa.endsWith("…")).toBe(true);
    expect(descricaoComRespostas("a".repeat(14990), [{ pergunta: "Qual?", resposta: "x" }])).toBe("a".repeat(14990));
  });
  it("o envio aceita ausência de revisão, categoria nula e no máximo três respostas", () => {
    expect(aberturaSchema.parse({})).toEqual({ revisao: null, respostas: [] });
    expect(aberturaSchema.parse({ revisao: { categoryId: null } })).toEqual({ revisao: { categoryId: null, tags: [] }, respostas: [] });
    expect(aberturaSchema.safeParse({ respostas: Array.from({ length: 4 }, () => ({ pergunta: "Qual?", resposta: "x" })) }).success).toBe(false);
  });
  it("a triagem lê a revisão aprovada do rascunho, e ignora rascunho sem ela", () => {
    expect(revisaoDoRascunho({ description: "x", _revisao: { categoryId: "senha", tags: ["erp"] } })).toEqual({ categoryId: "senha", tags: ["erp"] });
    expect(revisaoDoRascunho({ description: "x", _revisao: { categoryId: null } })).toEqual({ categoryId: null, tags: [] });
    expect(revisaoDoRascunho({ description: "x" })).toBeNull(); expect(revisaoDoRascunho(null)).toBeNull(); expect(revisaoDoRascunho({ _revisao: "sim" })).toBeNull();
  });
});
