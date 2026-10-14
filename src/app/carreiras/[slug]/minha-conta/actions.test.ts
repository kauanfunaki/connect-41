import { beforeEach, describe, expect, it, vi } from "vitest";

// O pedido do link de acesso da conta do candidato (15/10/2026, 41
// Carreiras): a tela agora pede só "E-mail usado na inscrição" — e a resposta
// tem de ser IDÊNTICA com ou sem inscrição, senão o campo vira um jeito de
// descobrir quem se candidatou. O e-mail só sai para quem tem inscrição.

const estado = vi.hoisted(() => ({
  inscritos: new Set<string>(),
  enviados: [] as { to: string; url: string; nomeDoEscritorio: string }[],
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7", host: "carreiras.useconnect.com.br" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/generated/prisma/client", () => ({ Prisma: { DbNull: null } }));
vi.mock("@/lib/rateLimit", () => ({ hit: () => ({ allowed: true }), clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/recrutamento/avisos", () => ({ avisarORecrutamento: async () => {}, avisarSobreAVaga: async () => {} }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ tenant: { findUnique: async () => ({ id: "t-41", name: "41 Tech", active: true }) } }),
}));
vi.mock("@/lib/email/sendMail", () => ({
  sendLinkDoCandidatoEmail: async (p: { to: string; url: string; nomeDoEscritorio: string }) => {
    estado.enviados.push({ to: p.to, url: p.url, nomeDoEscritorio: p.nomeDoEscritorio });
    return { ok: true };
  },
}));
vi.mock("@/lib/carreiras/conta", () => ({
  VALIDADE_DA_SESSAO_MS: 7 * 24 * 60 * 60_000,
  cookieDaSessao: (slug: string, caminho = `/carreiras/${slug}`) => ({ nome: "candidato_sessao", caminho }),
  criarLink: async () => "a".repeat(64),
  emailDaSessao: async () => null,
  encerrarSessao: async () => {},
  temInscricao: async (_tenantId: string, email: string) => estado.inscritos.has(email),
  trocarLinkPorSessao: async () => null,
}));

import { pedirLink } from "./actions";

const VARIAVEIS = { CARREIRAS_HOSTS: "carreiras.useconnect.com.br", APP_PUBLIC_URL: "https://app.useconnect.com.br" };

function form(email: string) {
  const f = new FormData();
  f.set("email", email);
  return f;
}

beforeEach(() => {
  estado.inscritos = new Set(["maria@exemplo.com.br"]);
  estado.enviados = [];
  for (const [k, v] of Object.entries(VARIAVEIS)) vi.stubEnv(k, v);
});

describe("pedirLink — sem descobrir quem se candidatou", () => {
  it("a resposta é a mesma com e sem inscrição", async () => {
    const comInscricao = await pedirLink("41tech", null, form("maria@exemplo.com.br"));
    const semInscricao = await pedirLink("41tech", null, form("ninguem@exemplo.com.br"));
    expect(comInscricao).toEqual(semInscricao);
    expect(comInscricao).toEqual({
      ok: true,
      mensagem: "Se houver inscrição com este e-mail, enviamos um link de acesso. Confira sua caixa de entrada (e o spam). O link vale por 30 minutos.",
    });
  });

  it("o e-mail só sai para quem tem inscrição — com o link do 41 Carreiras e o nome de quem conduz", async () => {
    await pedirLink("41tech", null, form("ninguem@exemplo.com.br"));
    expect(estado.enviados).toEqual([]);
    await pedirLink("41tech", null, form("  Maria@Exemplo.com.br "));
    expect(estado.enviados).toEqual([
      { to: "maria@exemplo.com.br", url: `https://carreiras.useconnect.com.br/minha-conta/entrar?t=${"a".repeat(64)}`, nomeDoEscritorio: "41 Tallent" },
    ]);
  });

  it("e-mail inválido: o mesmo erro, sem consultar inscrição", async () => {
    expect(await pedirLink("41tech", null, form("maria@"))).toEqual({ erro: "Informe um e-mail válido." });
    expect(estado.enviados).toEqual([]);
  });
});
