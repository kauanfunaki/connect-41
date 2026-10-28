import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { podeNoModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { getConnection } from "@/lib/github/store";
import { acessoOps, conferirResponsavel, exigirAtualizacao, ErroOps, responsaveisOps } from "./servidor";
import { exigirOrigem, lerJsonOps } from "./http";
import { MODULO_OPS } from "./regras";

// Sites e Apps do Ops Center (28/10/2026): o catálogo do que o Tech já entregou,
// ao lado dos robôs. A triagem dos chamados consulta os três antes de abrir um
// pedido, para apontar o que já existe e quem responde por ele.

const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
const endereco = z.string().trim().max(500).refine(v => { try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; } }, "Informe um endereço que comece com http:// ou https://.");
const base = { name: z.string().trim().min(1).max(120), ownerId: textoOpcional(191), description: textoOpcional(2000), isActive: z.boolean().default(true) };
export const siteSchema = z.object({ ...base, url: endereco });
export const appSchema = z.object({ ...base, repository: textoOpcional(210), url: endereco.nullish().or(z.literal("")).transform(v => v || null) });
const versao = { version: z.number().int().min(0) };
const idSchema = z.uuid();

export type ItemDoCatalogo = {
  id: string; name: string; description: string | null; url: string | null; repository: string | null;
  ownerId: string | null; ownerName: string | null; isActive: boolean; version: number;
};
export type CatalogoOps = { sites: ItemDoCatalogo[]; apps: ItemDoCatalogo[]; owners: { id: string; name: string }[]; repositorios: string[] };

const campos = { id: true, name: true, description: true, url: true, ownerId: true, owner: { select: { name: true } }, isActive: true, version: true } as const;
const serializar = (i: { id: string; name: string; description: string | null; url: string | null; repository?: string | null; ownerId: string | null; owner: { name: string } | null; isActive: boolean; version: number }): ItemDoCatalogo =>
  ({ id: i.id, name: i.name, description: i.description, url: i.url, repository: i.repository ?? null, ownerId: i.ownerId, ownerName: i.owner?.name ?? null, isActive: i.isActive, version: i.version });

/** Repositórios selecionados na integração do GitHub, pelo nome completo. */
async function repositoriosDoEscritorio(tenantId: string) {
  const conexao = await getConnection(tenantId);
  if (!conexao) return [];
  const repos = await getPrisma().githubRepository.findMany({ where: { tenantId, connectionId: conexao.id, selected: true }, select: { fullName: true }, orderBy: { fullName: "asc" } });
  return repos.map(r => r.fullName);
}

export async function catalogoOps(ctx: AuthContext): Promise<CatalogoOps> {
  const db = getPrisma(), tenantId = ctx.tenantId, gestor = await podeNoModulo(ctx, MODULO_OPS, "gerir");
  const ordem = [{ isActive: "desc" as const }, { name: "asc" as const }];
  const [sites, apps] = await Promise.all([
    db.opsSite.findMany({ where: { tenantId }, select: campos, orderBy: ordem }),
    db.opsApp.findMany({ where: { tenantId }, select: { ...campos, repository: true }, orderBy: ordem }),
  ]);
  return { sites: sites.map(serializar), apps: apps.map(serializar), owners: gestor ? await responsaveisOps(tenantId) : [], repositorios: gestor ? await repositoriosDoEscritorio(tenantId) : [] };
}

async function conferirRepositorio(tenantId: string, repository: string | null) {
  if (repository && !(await repositoriosDoEscritorio(tenantId)).includes(repository)) throw new ErroOps("Escolha um repositório selecionado na integração do GitHub.");
}

export async function obterCatalogo() { return catalogoOps(await acessoOps()); }
export async function criarSite(request: Request) {
  exigirOrigem(request); const ctx = await acessoOps("gerir");
  const dados = siteSchema.parse(await lerJsonOps(request));
  await conferirResponsavel(ctx.tenantId, dados.ownerId);
  await getPrisma().opsSite.create({ data: { tenantId: ctx.tenantId, ...dados } });
  return { ok: true };
}
export async function editarSite(request: Request, id: string) {
  exigirOrigem(request); const ctx = await acessoOps("gerir"); idSchema.parse(id);
  const { version, ...dados } = siteSchema.extend(versao).parse(await lerJsonOps(request));
  await conferirResponsavel(ctx.tenantId, dados.ownerId);
  exigirAtualizacao((await getPrisma().opsSite.updateMany({ where: { tenantId: ctx.tenantId, id, version }, data: { ...dados, version: { increment: 1 } } })).count);
  return { ok: true };
}
export async function criarApp(request: Request) {
  exigirOrigem(request); const ctx = await acessoOps("gerir");
  const dados = appSchema.parse(await lerJsonOps(request));
  await conferirResponsavel(ctx.tenantId, dados.ownerId); await conferirRepositorio(ctx.tenantId, dados.repository);
  await getPrisma().opsApp.create({ data: { tenantId: ctx.tenantId, ...dados } });
  return { ok: true };
}
export async function editarApp(request: Request, id: string) {
  exigirOrigem(request); const ctx = await acessoOps("gerir"); idSchema.parse(id);
  const { version, ...dados } = appSchema.extend(versao).parse(await lerJsonOps(request));
  await conferirResponsavel(ctx.tenantId, dados.ownerId);
  // Um repositório que saiu da integração continua aceito no app que já o usava.
  const atual = await getPrisma().opsApp.findFirst({ where: { tenantId: ctx.tenantId, id }, select: { repository: true } });
  if (dados.repository !== atual?.repository) await conferirRepositorio(ctx.tenantId, dados.repository);
  exigirAtualizacao((await getPrisma().opsApp.updateMany({ where: { tenantId: ctx.tenantId, id, version }, data: { ...dados, version: { increment: 1 } } })).count);
  return { ok: true };
}

/** O que já existe, para a triagem dos chamados: só itens ativos, sem tokens, chaves ou caminhos. */
export type ItemExistente = { ref: string; tipo: "robo" | "site" | "app"; nome: string; descricao: string | null; detalhe: string | null; responsavel: string | null; endereco: string | null };
export async function catalogoParaTriagem(tenantId: string): Promise<ItemExistente[]> {
  const db = getPrisma();
  const [robos, sites, apps] = await Promise.all([
    db.opsWatcher.findMany({ where: { tenantId, isActive: true }, select: { slug: true, name: true, description: true, client: true, owner: { select: { name: true } } }, orderBy: { name: "asc" }, take: 200 }),
    db.opsSite.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, description: true, url: true, owner: { select: { name: true } } }, orderBy: { name: "asc" }, take: 200 }),
    db.opsApp.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, description: true, url: true, repository: true, owner: { select: { name: true } } }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  return [
    ...robos.map(r => ({ ref: `robo:${r.slug}`, tipo: "robo" as const, nome: r.name, descricao: r.description, detalhe: r.client, responsavel: r.owner?.name ?? null, endereco: null })),
    ...sites.map(s => ({ ref: `site:${s.id}`, tipo: "site" as const, nome: s.name, descricao: s.description, detalhe: null, responsavel: s.owner?.name ?? null, endereco: s.url })),
    ...apps.map(a => ({ ref: `app:${a.id}`, tipo: "app" as const, nome: a.name, descricao: a.description, detalhe: a.repository, responsavel: a.owner?.name ?? null, endereco: a.url ?? (a.repository ? `https://github.com/${a.repository}` : null) })),
  ];
}
