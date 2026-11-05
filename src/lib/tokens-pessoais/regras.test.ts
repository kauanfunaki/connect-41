import { describe, expect, it } from "vitest";
import {
  ehRotaDeTokenPessoal, escoposEfetivos, gravarEscopos, lerEscopos, novoTokenSchema, pistaDoToken, situacaoDoToken, tokenDoCabecalho,
} from "./regras";

const TOKEN_FALSO = `c41_${"ab".repeat(32)}`;

describe("token pessoal: regras sem banco", () => {
  it("só aceita o token no formato c41_ + 64 hexadecimais, no Bearer", () => {
    expect(tokenDoCabecalho(`Bearer ${TOKEN_FALSO}`)).toBe(TOKEN_FALSO);
    expect(tokenDoCabecalho(`bearer   ${TOKEN_FALSO}`)).toBe(TOKEN_FALSO);
    expect(tokenDoCabecalho(null)).toBeNull();
    expect(tokenDoCabecalho(TOKEN_FALSO)).toBeNull();
    expect(tokenDoCabecalho(`Bearer ops_${"ab".repeat(32)}`)).toBeNull();
    expect(tokenDoCabecalho(`Bearer ${TOKEN_FALSO}x`)).toBeNull();
    expect(tokenDoCabecalho(`Bearer c41_${"AB".repeat(32)}`)).toBeNull();
  });

  it("escrever leva ler junto; escopo desconhecido cai fora", () => {
    expect(escoposEfetivos(["controle-interno:escrever"])).toEqual(["controle-interno:ler", "controle-interno:escrever"]);
    expect(escoposEfetivos(["controle-interno:ler", "admin:tudo"])).toEqual(["controle-interno:ler"]);
    expect(lerEscopos(gravarEscopos(["controle-interno:escrever"]))).toEqual(["controle-interno:ler", "controle-interno:escrever"]);
    expect(lerEscopos("")).toEqual([]);
  });

  it("a pista mostra só o começo e o fim do token", () => {
    expect(pistaDoToken(TOKEN_FALSO)).toBe("c41_abab…abab");
    expect(pistaDoToken(TOKEN_FALSO)).not.toContain("ab".repeat(10));
  });

  it("valida o pedido de criação: nome, escopo e validade da lista", () => {
    expect(novoTokenSchema.parse({ name: " Claude Code ", scopes: ["controle-interno:escrever", "controle-interno:ler"], days: "90" }))
      .toEqual({ name: "Claude Code", scopes: ["controle-interno:ler", "controle-interno:escrever"], days: 90 });
    expect(novoTokenSchema.safeParse({ name: "", scopes: ["controle-interno:ler"], days: 90 }).success).toBe(false);
    expect(novoTokenSchema.safeParse({ name: "x", scopes: [], days: 90 }).success).toBe(false);
    expect(novoTokenSchema.safeParse({ name: "x", scopes: ["admin:tudo"], days: 90 }).success).toBe(false);
    expect(novoTokenSchema.safeParse({ name: "x", scopes: ["controle-interno:ler"], days: 3650 }).success).toBe(false);
  });

  it("situação: revogado ganha de vencido; vencido no instante exato", () => {
    const agora = new Date("2026-11-05T12:00:00Z");
    expect(situacaoDoToken({ expiresAt: new Date("2026-12-01"), revokedAt: null }, agora)).toBe("ativo");
    expect(situacaoDoToken({ expiresAt: agora, revokedAt: null }, agora)).toBe("vencido");
    expect(situacaoDoToken({ expiresAt: new Date("2026-01-01"), revokedAt: new Date("2025-12-01") }, agora)).toBe("revogado");
  });

  it("o proxy libera só a API do Controle interno e o MCP", () => {
    for (const p of ["/api/mcp", "/api/v1/controle-interno", "/api/v1/controle-interno/abc", "/api/v1/controle-interno/abc/anexos"]) expect(ehRotaDeTokenPessoal(p), p).toBe(true);
    for (const p of ["/api/mcpx", "/api/mcp/outra", "/api/v1/controle-internox", "/api/v1/outro", "/api/tech-interno/anexos", "/controle-interno"]) expect(ehRotaDeTokenPessoal(p), p).toBe(false);
  });
});
