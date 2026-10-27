import { describe, expect, it } from "vitest";
import { gerarTermo, lerTermoAssinado, TEXTO_DO_TERMO, validadeDoTermo } from "./termo";
import { scriptDoAssinador } from "./assinador";
import { CONTRATANTE_DO_TERMO, TERMO_ASSINADO } from "./termo.fixture";
import { tokenDoTermoNaResposta } from "./regras";

// O termo de autorização (Fase 3, 27/10/2026). O termo assinado do fixture
// saiu do assinador do Connect rodando no Windows PowerShell 5.1: é a prova
// de que o C14N e a conferência daqui batem com o SignedXml do .NET.

const HOJE = "2026-10-27";
const ESCRITORIO = "11222333000181";

describe("gerarTermo", () => {
  const xml = gerarTermo({
    contratante: { numero: CONTRATANTE_DO_TERMO, nome: "SOFTWARE HOUSE & CIA" },
    autor: { numero: ESCRITORIO, nome: 'ESCRITÓRIO "FICTÍCIO"​ LTDA' },
    assinadoEm: HOJE,
    vigencia: "2027-10-27",
  });

  it("monta o modelo da documentação numa linha só, com os textos e as datas AAAAMMDD", () => {
    expect(xml).not.toMatch(/[\r\n]/);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><termoDeAutorizacao><dados><sistema id="API Integra Contador" />')).toBe(true);
    expect(xml).toContain(`<termo texto="${TEXTO_DO_TERMO}" />`);
    expect(xml).toContain('<dataAssinatura data="20261027" /><vigencia data="20271027" />');
    expect(xml).toContain(`<destinatario numero="${CONTRATANTE_DO_TERMO}" nome="SOFTWARE HOUSE &amp; CIA" tipo="PJ" papel="contratante" />`);
    expect(xml.endsWith("</dados></termoDeAutorizacao>")).toBe(true);
  });

  it("limpa o nome: sem aspas e sem caractere invisível (que derruba o termo no Serpro)", () => {
    expect(xml).toContain(`<assinadoPor numero="${ESCRITORIO}" nome="ESCRITÓRIO FICTÍCIO LTDA" tipo="PJ" papel="autor pedido de dados" />`);
  });

  it("CPF assina como PF", () => {
    const pf = gerarTermo({ contratante: { numero: CONTRATANTE_DO_TERMO, nome: "X" }, autor: { numero: "12345678909", nome: "FULANO" }, assinadoEm: HOJE, vigencia: HOJE });
    expect(pf).toContain('tipo="PF" papel="autor pedido de dados"');
  });

  it("o assinador leva o termo intacto num here-string, e recusa termo com quebra de linha", () => {
    const script = scriptDoAssinador({ xml, autor: { numero: ESCRITORIO, nome: "D'ÁVILA" }, contratante: "X" });
    expect(script).toContain(`$termo = @'\r\n${xml}\r\n'@`);
    expect(script).toContain("$nomeDoAutor = 'D''ÁVILA'");
    expect(() => scriptDoAssinador({ xml: `${xml}\n`, autor: { numero: ESCRITORIO, nome: "X" }, contratante: "X" })).toThrow();
  });
});

describe("lerTermoAssinado", () => {
  it("confere o termo que o Windows assinou: dados, datas e certificado", () => {
    const r = lerTermoAssinado(TERMO_ASSINADO, HOJE);
    expect(r).toEqual({
      ok: true,
      termo: {
        contratante: { numero: CONTRATANTE_DO_TERMO, nome: "SOFTWARE HOUSE FICTÍCIA LTDA" },
        autor: { numero: ESCRITORIO, nome: "ESCRITÓRIO FICTÍCIO & CIA LTDA" },
        assinadoEm: "2026-10-27",
        vigencia: "2027-10-27",
        certificado: { titular: "ESCRITÓRIO FICTÍCIO & CIA LTDA", documento: ESCRITORIO, validoAte: "2031-12-31" },
      },
    });
  });

  it("aceita o arquivo com BOM e com quebra de linha no fim", () => {
    expect(lerTermoAssinado(`﻿${TERMO_ASSINADO}\r\n`, HOJE).ok).toBe(true);
  });

  it("termo alterado depois de assinado: o resumo não confere", () => {
    const r = lerTermoAssinado(TERMO_ASSINADO.replace("CIA LTDA", "CIA  LTDA"), HOJE);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("alterado depois de assinado") });
  });

  it("assinatura trocada: o RSA não confere", () => {
    const r = lerTermoAssinado(TERMO_ASSINADO.replace(/<SignatureValue>(.)/, (_m, c: string) => `<SignatureValue>${c === "A" ? "B" : "A"}`), HOJE);
    expect(r).toEqual({ ok: false, erro: "A assinatura não confere com o certificado." });
  });

  it("assinado por outro certificado que não o do autor", () => {
    const r = lerTermoAssinado(TERMO_ASSINADO.replace(`<assinadoPor numero="${ESCRITORIO}"`, '<assinadoPor numero="33444555000101"'), HOJE);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("e não com o de quem consta como autor (33444555000101)") });
  });

  it("vigência vencida e data de assinatura no futuro", () => {
    expect(lerTermoAssinado(TERMO_ASSINADO, "2027-10-28")).toEqual({ ok: false, erro: "O termo venceu em 27/10/2027. Gere um novo." });
    expect(lerTermoAssinado(TERMO_ASSINADO, "2026-10-26")).toEqual({ ok: false, erro: "A data de assinatura do termo é posterior a hoje." });
  });

  it("sem assinatura, texto mexido, outra raiz e DOCTYPE", () => {
    const semAssinatura = TERMO_ASSINADO.replace(/<Signature[\s\S]*<\/Signature>/, "");
    expect(lerTermoAssinado(semAssinatura, HOJE)).toEqual({ ok: false, erro: expect.stringContaining("não está assinado") });
    expect(lerTermoAssinado(TERMO_ASSINADO.replace("Autorizo a empresa", "Autorizo  a empresa"), HOJE)).toEqual({
      ok: false,
      erro: expect.stringContaining("O texto do termo foi alterado"),
    });
    expect(lerTermoAssinado("<outro/>", HOJE)).toEqual({ ok: false, erro: expect.stringContaining("a raiz não é termoDeAutorizacao") });
    expect(lerTermoAssinado(`<!DOCTYPE x [<!ENTITY a "b">]>${TERMO_ASSINADO}`, HOJE).ok).toBe(false);
    expect(lerTermoAssinado("", HOJE)).toEqual({ ok: false, erro: "O arquivo está vazio." });
  });

  it("algoritmo fora do padrão do Serpro", () => {
    const sha1 = TERMO_ASSINADO.replace("xmldsig-more#rsa-sha256", "xmldsig#rsa-sha1");
    expect(lerTermoAssinado(sha1, HOJE)).toEqual({ ok: false, erro: "A assinatura não é RSA-SHA256." });
  });
});

describe("validade do termo", () => {
  it("vale até a vigência ou até o certificado de quem assinou, o que vier antes", () => {
    expect(validadeDoTermo({ vigencia: "2027-10-27", certificadoValidoAte: "2031-12-31" })).toBe("2027-10-27");
    expect(validadeDoTermo({ vigencia: "2027-10-27", certificadoValidoAte: "2027-03-01" })).toBe("2027-03-01");
  });
});

describe("tokenDoTermoNaResposta", () => {
  const agora = Date.parse("2026-10-27T13:00:00-03:00");
  const resposta = (dados: unknown) => ({ status: 200, mensagens: [], dados });

  it("200: o token e a expiração do corpo (hora de Brasília), com 5 minutos de folga", () => {
    const r = tokenDoTermoNaResposta(resposta({ autenticar_procurador_token: "tok", data_hora_expiracao: "2026-10-28T00:00:01" }), {}, agora);
    expect(r).toEqual({ token: "tok", expiraEm: Date.parse("2026-10-28T00:00:01-03:00") - 5 * 60_000 });
  });

  it("304: o token do ETag e a validade do expires (GMT)", () => {
    const r = tokenDoTermoNaResposta(
      resposta(null),
      { etag: '"autenticar_procurador_token:ab87df0b-6d08"', expires: "Wed, 28 Oct 2026 03:00:01 GMT" },
      agora
    );
    expect(r).toEqual({ token: "ab87df0b-6d08", expiraEm: Date.parse("2026-10-28T03:00:01Z") - 5 * 60_000 });
  });

  it("sem validade legível: a meia-noite seguinte em Brasília", () => {
    const r = tokenDoTermoNaResposta(resposta({ autenticar_procurador_token: "tok" }), {}, agora);
    expect(r!.expiraEm).toBe(Date.parse("2026-10-28T00:00:00-03:00") - 5 * 60_000);
  });

  it("sem token: null", () => {
    expect(tokenDoTermoNaResposta(resposta({}), { etag: '"tempoEspera:4000"' }, agora)).toBeNull();
  });
});
