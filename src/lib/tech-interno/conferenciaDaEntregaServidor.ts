// A leitura do "Conferir" do Controle interno (11/11/2026, funcionalidade-579):
// o PR no GitHub, as migrations no banco e o commit do deploy. As regras e os
// textos estão em conferenciaDaEntrega.ts; quem pode conferir e o que fica
// gravado, em servidor.ts (`conferirEntrega`).

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { GithubClient, repoPath } from "@/lib/github/client";
import { GithubError } from "@/lib/github/rules";
import { getConnection } from "@/lib/github/store";
import { validToken, withGithubLease } from "@/lib/github/sync";
import { formatInstantDateTime } from "@/lib/format";
import {
  REPOSITORIO_DO_CONNECT_PADRAO, commitDoDeploy, conferenciasDoItem, estaNoDeploy, lerPr, migrationsDosArquivos,
  type ChaveDaConferencia, type ItemParaConferir, type PrDoGithub, type ResultadoDaConferencia,
} from "./conferenciaDaEntrega";

/** Uma consulta à API do GitHub, já com a conta (ou sem ela). */
export type PedirAoGithub = (path: string) => Promise<unknown>;

/** O repositório do Connect: o padrão, ou CONNECT_REPOSITORIO ("dono/repo") no ambiente. */
export function repositorioDoConnect(): string {
  const valor = process.env.CONNECT_REPOSITORIO?.trim();
  return valor && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(valor) ? valor : REPOSITORIO_DO_CONNECT_PADRAO;
}

/**
 * O commit que está rodando. O Next coloca o deploymentId no código do servidor
 * no build (`process.env.NEXT_DEPLOYMENT_ID`), e o Dockerfile o preenche com o
 * GIT_SHA que o EasyPanel passa. Em desenvolvimento não há.
 */
export function commitQueEstaRodando(): string | null {
  return commitDoDeploy(process.env.NEXT_DEPLOYMENT_ID);
}

/**
 * Abre o GitHub com a conta conectada do escritório (Integrações › GitHub). Sem
 * conta, ou com ela ocupada pela sincronização, consulta sem token: o PR do
 * Connect é público, e o de um repositório privado volta "sem permissão".
 */
export async function comGithub<T>(tenantId: string, fn: (pedir: PedirAoGithub) => Promise<T>): Promise<T> {
  const semConta = () => fn(async path => (await new GithubClient("").request(path)).data);
  const conexao = await getConnection(tenantId);
  if (!conexao || conexao.status !== "connected" || !conexao.githubUserId) return semConta();
  try {
    return await withGithubLease(conexao.githubUserId, async dono => {
      const cliente = new GithubClient(await validToken(conexao, dono));
      return fn(async path => (await cliente.request(path)).data);
    });
  } catch (e) {
    if (e instanceof GithubError && e.status === 409) return semConta();
    throw e;
  }
}

const prSchema = z.object({
  state: z.string(),
  merged: z.boolean().nullish(),
  merged_at: z.string().nullish(),
  merge_commit_sha: z.string().nullish(),
});
const arquivosSchema = z.array(z.object({ filename: z.string() })).max(100);
const comparacaoSchema = z.object({ status: z.string() });

export type DadosDoPr = { estado: "aberto" | "mergeado" | "fechado"; mergeadoEm: Date | null; commitDoMerge: string | null; arquivos: string[] };

export async function lerDadosDoPr(pedir: PedirAoGithub, pr: PrDoGithub, comArquivos: boolean): Promise<DadosDoPr> {
  const base = `${repoPath(pr.dono, pr.repo)}/pulls/${pr.numero}`;
  const dados = prSchema.parse(await pedir(base));
  const mergeado = !!dados.merged || !!dados.merged_at;
  const arquivos: string[] = [];
  // Até 300 arquivos (3 páginas): a migration fica em prisma/migrations, e PR maior que isso é exceção.
  for (let pagina = 1; comArquivos && pagina <= 3; pagina++) {
    const lote = arquivosSchema.parse(await pedir(`${base}/files?per_page=100&page=${pagina}`));
    arquivos.push(...lote.map(a => a.filename));
    if (lote.length < 100) break;
  }
  return {
    estado: mergeado ? "mergeado" : dados.state === "closed" ? "fechado" : "aberto",
    mergeadoEm: dados.merged_at ? new Date(dados.merged_at) : null,
    commitDoMerge: mergeado ? dados.merge_commit_sha ?? null : null,
    arquivos,
  };
}

/** Situação de cada migration no `_prisma_migrations`: aplicada, falhou (começou e não terminou) ou ausente. */
export type SituacaoDaMigration = "aplicada" | "falhou" | "desfeita" | "ausente";
export async function situacaoDasMigrations(nomes: readonly string[]): Promise<Map<string, SituacaoDaMigration>> {
  const situacao = new Map<string, SituacaoDaMigration>(nomes.map(n => [n, "ausente"]));
  if (!nomes.length) return situacao;
  const linhas = await getPrisma().$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name IN (${Prisma.join([...nomes])})`;
  for (const l of linhas) {
    const atual = situacao.get(l.migration_name);
    const desta: SituacaoDaMigration = l.rolled_back_at ? "desfeita" : l.finished_at ? "aplicada" : "falhou";
    // Uma tentativa que falhou e outra que deu certo: vale a que deu certo.
    if (atual !== "aplicada") situacao.set(l.migration_name, desta);
  }
  return situacao;
}

const DETALHE_DA_MIGRATION: Record<SituacaoDaMigration, string> = {
  aplicada: "aplicada", falhou: "começou e não terminou; confira com prisma migrate status", desfeita: "marcada como desfeita", ausente: "ainda não aplicada",
};

export type FontesDaConferencia = {
  repositorio: string;
  deploy: string | null;
  pedir: PedirAoGithub;
  migrations: (nomes: readonly string[]) => Promise<Map<string, SituacaoDaMigration>>;
};

/**
 * Confere o item. `jaMarcadas` são as chaves da conferência anterior (para não
 * perder uma migration achada nos arquivos do PR). Um erro do GitHub vira o
 * detalhe da linha, e as outras conferências seguem.
 */
export async function conferirItem(item: ItemParaConferir, jaMarcadas: readonly string[], fontes: FontesDaConferencia): Promise<ResultadoDaConferencia[]> {
  const pr = lerPr(item.prUrl);
  let dados: DadosDoPr | null = null, erroDoGithub: string | null = null;
  const chaves = conferenciasDoItem(item, fontes.repositorio, jaMarcadas);
  if (pr) {
    try { dados = await lerDadosDoPr(fontes.pedir, pr, chaves.includes("no-ar")); }
    catch (e) { erroDoGithub = e instanceof GithubError ? e.message : "não foi possível ler o PR no GitHub"; }
  }
  // As migrations que o PR traz entram na lista mesmo sem o texto citar.
  for (const nome of migrationsDosArquivos(dados?.arquivos ?? [])) {
    const chave: ChaveDaConferencia = `migration:${nome}`, antesDoNoAr = chaves.indexOf("no-ar");
    if (antesDoNoAr >= 0 && !chaves.includes(chave)) chaves.splice(antesDoNoAr, 0, chave);
  }
  const nomes = chaves.filter(c => c.startsWith("migration:")).map(c => c.slice("migration:".length));
  const migrations = await fontes.migrations(nomes);

  const resultados: ResultadoDaConferencia[] = [];
  for (const chave of chaves) {
    if (chave === "pr") {
      resultados.push(dados
        ? { chave, ok: dados.estado === "mergeado", detalhe: dados.estado === "mergeado" ? `mergeado${dados.mergeadoEm ? ` em ${formatInstantDateTime(dados.mergeadoEm)}` : ""}` : dados.estado === "fechado" ? "fechado sem merge" : "aberto, ainda não mergeado" }
        : { chave, ok: false, detalhe: erroDoGithub ?? "PR não lido" });
    } else if (chave === "no-ar") {
      resultados.push(await conferirNoAr(item, dados, erroDoGithub, fontes));
    } else {
      const situacao = migrations.get(chave.slice("migration:".length)) ?? "ausente";
      resultados.push({ chave, ok: situacao === "aplicada", detalhe: DETALHE_DA_MIGRATION[situacao] });
    }
  }
  return resultados;
}

async function conferirNoAr(item: ItemParaConferir, dados: DadosDoPr | null, erroDoGithub: string | null, fontes: FontesDaConferencia): Promise<ResultadoDaConferencia> {
  const chave = "no-ar" as const;
  if (!fontes.deploy) return { chave, ok: false, detalhe: "este ambiente não sabe o commit do deploy (só a produção sabe)" };
  if (item.prUrl && !dados) return { chave, ok: false, detalhe: erroDoGithub ?? "PR não lido" };
  if (dados && dados.estado !== "mergeado") return { chave, ok: false, detalhe: "o PR ainda não foi mergeado" };
  const alvo = (dados?.commitDoMerge ?? item.commitSha ?? "").toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(alvo)) return { chave, ok: false, detalhe: "sem o commit do merge" };
  if (fontes.deploy.startsWith(alvo) || alvo.startsWith(fontes.deploy)) return { chave, ok: true, detalhe: `no ar (deploy ${fontes.deploy.slice(0, 7)})` };
  const [dono, repo] = fontes.repositorio.split("/");
  try {
    const { status } = comparacaoSchema.parse(await fontes.pedir(`${repoPath(dono, repo)}/compare/${fontes.deploy}...${alvo}`));
    return estaNoDeploy(status)
      ? { chave, ok: true, detalhe: `no ar (deploy ${fontes.deploy.slice(0, 7)})` }
      : { chave, ok: false, detalhe: `ainda não está no deploy de produção (${fontes.deploy.slice(0, 7)})` };
  } catch (e) {
    return { chave, ok: false, detalhe: e instanceof GithubError ? e.message : "não foi possível comparar com o deploy" };
  }
}
