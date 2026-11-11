import { describe, expect, it } from "vitest";
import { avaliarLogica, corrigirLogica, embaralhar, lerAlternativas, letraDaAlternativa, questaoSchema } from "./logica";
import { criarSorteio } from "./numeros";
import { ehArquivoDeImagem, ehUrlDeImagemDaAcademia, tipoDaImagem } from "./imagens";

// A lógica com imagens (10/11/2026): o cadastro, a correção e as imagens.

const IMG = "/api/academia/imagens/11111111-2222-4333-8444-555555555555.png";

describe("cadastro da questão", () => {
  const base = { nivel: "medio", enunciado: "Qual figura completa a sequência?", alternativas: [{ texto: "A" }, { texto: "B" }], correta: 1, ativo: true };

  it("alternativa com texto, imagem ou os dois", () => {
    const r = questaoSchema.safeParse({ ...base, imagemUrl: IMG, alternativas: [{ texto: "Só texto" }, { imagemUrl: IMG }, { texto: "Os dois", imagemUrl: IMG }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.alternativas[1]).toEqual({ texto: undefined, imagemUrl: IMG });
  });

  it("alternativa vazia, a certa fora da lista, menos de 2 ou mais de 6: recusa", () => {
    expect(questaoSchema.safeParse({ ...base, alternativas: [{ texto: "A" }, { texto: "  " }] }).success).toBe(false);
    expect(questaoSchema.safeParse({ ...base, correta: 2 }).success).toBe(false);
    expect(questaoSchema.safeParse({ ...base, alternativas: [{ texto: "A" }] }).success).toBe(false);
    expect(questaoSchema.safeParse({ ...base, alternativas: Array.from({ length: 7 }, (_, i) => ({ texto: String(i) })) }).success).toBe(false);
  });

  it("imagem só se veio da própria Academia (nada de endereço de fora)", () => {
    expect(questaoSchema.safeParse({ ...base, imagemUrl: "https://exemplo.com/a.png" }).success).toBe(false);
    expect(questaoSchema.safeParse({ ...base, imagemUrl: "/api/academia/imagens/../../.env" }).success).toBe(false);
    expect(questaoSchema.safeParse({ ...base, imagemUrl: null }).success).toBe(true);
  });

  it("lê as alternativas gravadas com tolerância (inclusive o formato do Hub, só texto)", () => {
    expect(lerAlternativas(["Sim", "Não", ""])).toEqual([{ texto: "Sim" }, { texto: "Não" }]);
    expect(lerAlternativas([{ texto: "A", imagemUrl: "https://fora.com/x.png" }, { imagemUrl: IMG }, {}, 3])).toEqual([{ texto: "A" }, { imagemUrl: IMG }]);
    expect(lerAlternativas(null)).toEqual([]);
    expect(letraDaAlternativa(0)).toBe("A");
    expect(letraDaAlternativa(5)).toBe("F");
  });
});

describe("correção", () => {
  it("acertos, total e precisão; sem resposta conta como erro", () => {
    expect(corrigirLogica([0, 1, 2, 3], [0, 1, null, 0])).toEqual({ acertos: 2, total: 4, precisao: 50 });
    expect(corrigirLogica([1, 1, 1], [1, 1, 0])).toEqual({ acertos: 2, total: 3, precisao: 66.67 });
  });

  it("a certa vem da sessão; o número de respostas tem de bater", () => {
    expect(avaliarLogica({ corretas: [0, 1], respostas: [0], duracaoDoNavegadorMs: 30_000, decorridoNoServidorMs: 31_000 })).toMatchObject({ ok: false, codigo: "respostas" });
  });

  it("duração: a do navegador a até 15 s do servidor; senão, a do servidor; menos de 2 s é descartado", () => {
    const certo = { corretas: [0], respostas: [0] };
    expect(avaliarLogica({ ...certo, duracaoDoNavegadorMs: 40_000, decorridoNoServidorMs: 41_000 })).toMatchObject({ ok: true, duracaoMs: 40_000 });
    expect(avaliarLogica({ ...certo, duracaoDoNavegadorMs: 5_000, decorridoNoServidorMs: 60_000 })).toMatchObject({ ok: true, duracaoMs: 60_000 });
    expect(avaliarLogica({ ...certo, duracaoDoNavegadorMs: 1_000, decorridoNoServidorMs: 1_500 })).toMatchObject({ ok: false, codigo: "curta" });
  });

  it("embaralhar não perde nem repete questão", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `q${i}`);
    const r = embaralhar(ids, criarSorteio(3));
    expect([...r].sort()).toEqual([...ids].sort());
    expect(r).not.toEqual(ids);
  });
});

describe("imagens", () => {
  it("o tipo pelos bytes: PNG, JPG e WEBP; o resto não", () => {
    expect(tipoDaImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
    expect(tipoDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(tipoDaImagem(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))?.ext).toBe("webp");
    expect(tipoDaImagem(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(tipoDaImagem(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });

  it("o nome do arquivo é um uuid com a extensão — nada de caminho", () => {
    expect(ehArquivoDeImagem("11111111-2222-4333-8444-555555555555.webp")).toBe(true);
    expect(ehArquivoDeImagem("../segredo.png")).toBe(false);
    expect(ehArquivoDeImagem("11111111-2222-4333-8444-555555555555.svg")).toBe(false);
    expect(ehUrlDeImagemDaAcademia(IMG)).toBe(true);
    expect(ehUrlDeImagemDaAcademia(`https://outro${IMG}`)).toBe(false);
  });
});
