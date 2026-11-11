import { describe, expect, it, vi } from "vitest";

// O servidor importa a integração do GitHub e o banco; aqui as duas fontes são simuladas.
vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/github/store", () => ({ getConnection: vi.fn() }));
vi.mock("@/lib/github/sync", () => ({ validToken: vi.fn(), withGithubLease: vi.fn() }));

import { commitDoDeploy, conferenciasDoItem, ehDoConnect, lerPr, migrationsCitadas, migrationsDosArquivos, resumoDaConferencia } from "./conferenciaDaEntrega";
import { conferirItem, type FontesDaConferencia, type SituacaoDaMigration } from "./conferenciaDaEntregaServidor";
import { GithubError } from "@/lib/github/rules";

const REPO = "kauanfunaki/connect-41";
const PR = "https://github.com/kauanfunaki/connect-41/pull/502";
const MERGE = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const DEPLOY = "ffffffffffffffffffffffffffffffffffffffff";
const MIGRATION = "20261111030000_marcas_do_antes_de_testar";
const item = (sobre: Partial<Parameters<typeof conferirItem>[0]> = {}) => ({ prUrl: PR, commitSha: null, acceptanceCriteria: null, description: null, ...sobre });

/** Um GitHub de mentira: responde pelo caminho pedido. */
function github(respostas: Record<string, unknown>) {
  return vi.fn(async (path: string) => {
    for (const [prefixo, resposta] of Object.entries(respostas)) if (path.startsWith(prefixo)) {
      if (resposta instanceof Error) throw resposta;
      return resposta;
    }
    throw new Error(`caminho inesperado: ${path}`);
  });
}
const fontes = (pedir: FontesDaConferencia["pedir"], migrations: Record<string, SituacaoDaMigration> = {}, deploy: string | null = DEPLOY): FontesDaConferencia => ({
  repositorio: REPO, deploy, pedir,
  migrations: async nomes => new Map(nomes.map(n => [n, migrations[n] ?? "ausente"])),
});
const BASE = "/repos/kauanfunaki/connect-41";
const mergeado = { state: "closed", merged: true, merged_at: "2026-11-11T12:00:00Z", merge_commit_sha: MERGE };

describe("regras da conferência", () => {
  it("lê o PR do GitHub e diz se é do Connect", () => {
    expect(lerPr(PR)).toEqual({ dono: "kauanfunaki", repo: "connect-41", numero: 502 });
    expect(lerPr("https://github.com/kauanfunaki/connect-41/pull/502/files")).toMatchObject({ numero: 502 });
    expect(lerPr("https://gitlab.com/a/b/pull/1")).toBeNull();
    expect(ehDoConnect(lerPr(PR), "KauanFunaki/Connect-41")).toBe(true);
    expect(ehDoConnect(lerPr("https://github.com/kauanfunaki/sped_generator/pull/64"), REPO)).toBe(false);
  });

  it("acha as migrations no texto e nos arquivos do PR", () => {
    expect(migrationsCitadas(`rodar ${MIGRATION} e`, `de novo ${MIGRATION}; 20261111020000_repositorio_de_fluxos`)).toEqual([MIGRATION, "20261111020000_repositorio_de_fluxos"]);
    expect(migrationsDosArquivos(["src/a.ts", `prisma/migrations/${MIGRATION}/migration.sql`, "prisma/schema.prisma"])).toEqual([MIGRATION]);
  });

  it("o commit do deploy só vale quando é um sha", () => {
    expect(commitDoDeploy(DEPLOY)).toBe(DEPLOY);
    // Sem o GIT_SHA, o Dockerfile usa a hora do build: só dígitos, não é commit.
    expect(commitDoDeploy("1794399103")).toBeNull();
    expect(commitDoDeploy("build-123")).toBeNull();
    expect(commitDoDeploy(false)).toBeNull();
  });

  it("as linhas do item: PR, migrations e no ar; num PR de outro sistema, só o PR", () => {
    expect(conferenciasDoItem(item({ acceptanceCriteria: `Mudança: migration ${MIGRATION}.` }), REPO)).toEqual(["pr", `migration:${MIGRATION}`, "no-ar"]);
    expect(conferenciasDoItem(item({ prUrl: "https://github.com/kauanfunaki/sped_generator/pull/64", acceptanceCriteria: MIGRATION }), REPO)).toEqual(["pr"]);
    expect(conferenciasDoItem(item({ prUrl: null, commitSha: MERGE }), REPO)).toEqual(["no-ar"]);
    expect(conferenciasDoItem(item({ prUrl: null }), REPO)).toEqual([]);
    // A migration achada nos arquivos numa conferência anterior continua na lista.
    expect(conferenciasDoItem(item(), REPO, ["pr", `migration:${MIGRATION}`])).toEqual(["pr", `migration:${MIGRATION}`, "no-ar"]);
  });
});

describe("conferirItem", () => {
  it("PR mergeado, migration do PR aplicada e merge no deploy: tudo conferido", async () => {
    const pedir = github({
      [`${BASE}/pulls/502/files`]: [{ filename: `prisma/migrations/${MIGRATION}/migration.sql` }, { filename: "src/x.ts" }],
      [`${BASE}/pulls/502`]: mergeado,
      [`${BASE}/compare/${DEPLOY}...${MERGE}`]: { status: "behind" },
    });
    const r = await conferirItem(item(), [], fontes(pedir, { [MIGRATION]: "aplicada" }));
    expect(r.map(x => [x.chave, x.ok])).toEqual([["pr", true], [`migration:${MIGRATION}`, true], ["no-ar", true]]);
    expect(resumoDaConferencia(r)).toMatch(/^Tudo conferido/);
  });

  it("PR aberto: não está mergeado nem no ar, e a migration citada ainda não foi aplicada", async () => {
    const pedir = github({ [`${BASE}/pulls/502/files`]: [], [`${BASE}/pulls/502`]: { state: "open", merged: false, merged_at: null, merge_commit_sha: "abc" } });
    const r = await conferirItem(item({ acceptanceCriteria: `migration ${MIGRATION}` }), [], fontes(pedir));
    expect(r).toEqual([
      { chave: "pr", ok: false, detalhe: "aberto, ainda não mergeado" },
      { chave: `migration:${MIGRATION}`, ok: false, detalhe: "ainda não aplicada" },
      { chave: "no-ar", ok: false, detalhe: "o PR ainda não foi mergeado" },
    ]);
    expect(resumoDaConferencia(r)).toMatch(/^0 de 3 conferidos\. Falta: PR mergeado \(aberto/);
  });

  it("mergeado mas o deploy é anterior ao merge: falta subir", async () => {
    const pedir = github({ [`${BASE}/pulls/502/files`]: [], [`${BASE}/pulls/502`]: mergeado, [`${BASE}/compare/`]: { status: "ahead" } });
    const r = await conferirItem(item(), [], fontes(pedir));
    expect(r.find(x => x.chave === "no-ar")).toMatchObject({ ok: false, detalhe: expect.stringContaining("ainda não está no deploy") });
  });

  it("fora da produção não há commit do deploy: o no ar fica sem conferir, e o resto segue", async () => {
    const pedir = github({ [`${BASE}/pulls/502/files`]: [], [`${BASE}/pulls/502`]: mergeado });
    const r = await conferirItem(item(), [], fontes(pedir, {}, null));
    expect(r).toEqual([
      { chave: "pr", ok: true, detalhe: expect.stringContaining("mergeado") },
      { chave: "no-ar", ok: false, detalhe: expect.stringContaining("só a produção sabe") },
    ]);
  });

  it("o deploy é o próprio commit do merge: no ar sem perguntar ao GitHub", async () => {
    const pedir = github({ [`${BASE}/pulls/502/files`]: [], [`${BASE}/pulls/502`]: mergeado });
    const r = await conferirItem(item(), [], fontes(pedir, {}, MERGE));
    expect(r.find(x => x.chave === "no-ar")).toMatchObject({ ok: true });
    expect(pedir).not.toHaveBeenCalledWith(expect.stringContaining("/compare/"));
  });

  it("sem acesso ao PR no GitHub: a linha diz o motivo, e a migration ainda é conferida no banco", async () => {
    const pedir = github({ [`${BASE}/pulls/502`]: new GithubError("Recurso indisponível ou sem permissão no GitHub.", 404, undefined, "access") });
    const r = await conferirItem(item({ acceptanceCriteria: MIGRATION }), [], fontes(pedir, { [MIGRATION]: "aplicada" }));
    expect(r).toEqual([
      { chave: "pr", ok: false, detalhe: "Recurso indisponível ou sem permissão no GitHub." },
      { chave: `migration:${MIGRATION}`, ok: true, detalhe: "aplicada" },
      { chave: "no-ar", ok: false, detalhe: "Recurso indisponível ou sem permissão no GitHub." },
    ]);
  });

  it("PR de outro sistema: só o PR, e os arquivos nem são lidos", async () => {
    const pedir = github({ "/repos/kauanfunaki/sped_generator/pulls/64": mergeado });
    const r = await conferirItem(item({ prUrl: "https://github.com/kauanfunaki/sped_generator/pull/64" }), [], fontes(pedir));
    expect(r.map(x => x.chave)).toEqual(["pr"]);
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
