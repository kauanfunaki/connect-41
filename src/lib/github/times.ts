import { z } from "zod";
import type { AuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { corAutomatica, hexDaCor, type TimeDoPainel } from "./cores";
import { linkedPeople } from "./conta";
import { GithubError } from "./rules";
import { changeIntegration } from "./service";
import { getConnection } from "./store";

// Aba Times do GitHub (04/11/2026): o coordenador do Tech monta os times (nome e
// cor), põe cada pessoa em um time só e escolhe a cor de cada uma. Cor e time são
// gravados pelo ID estável do GitHub, então valem também depois de trocar a conta.

/** Uma pessoa que o coordenador pode pôr num time. `userId` é o da conexão atual (para deixar de acompanhar). */
export type PessoaDosTimes = {
  externalId: string; userId: string | null; login: string; name: string | null;
  cor: string; corPropria: boolean; time: string | null; tracked: boolean;
};
export type TimesView = { conectado: boolean; generation: number; times: TimeDoPainel[]; pessoas: PessoaDosTimes[] };

export async function timesView(tenantId: string): Promise<TimesView> {
  const db = getPrisma(), [connection, names] = await Promise.all([getConnection(tenantId), linkedPeople(tenantId)]);
  // Quem pode entrar num time: acompanhado, vinculado em Sua conta ou com contribuição gravada. Robôs e autores sem conta ficam de fora.
  const [usuarios, gravadas, times] = await Promise.all([
    connection ? db.githubUser.findMany({ where: { tenantId, connectionId: connection.id, unidentified: false, isBot: false,
      OR: [{ tracked: true }, { externalId: { in: [...names.keys()] } }, { daily: { some: { count: { gt: 0 } } } }] }, select: { id: true, externalId: true, login: true, tracked: true } }) : [],
    db.githubPerson.findMany({ where: { tenantId }, select: { externalId: true, login: true, color: true, teamId: true } }),
    db.githubTeam.findMany({ where: { tenantId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true } }),
  ]);
  const porExterno = new Map(gravadas.map(pessoa => [pessoa.externalId, pessoa]));
  const pessoas = new Map<string, PessoaDosTimes>();
  for (const usuario of usuarios) {
    const gravada = porExterno.get(usuario.externalId);
    pessoas.set(usuario.externalId, { externalId: usuario.externalId, userId: usuario.id, login: usuario.login, name: names.get(usuario.externalId) ?? null,
      cor: gravada?.color ?? corAutomatica(usuario.externalId), corPropria: Boolean(gravada?.color), time: gravada?.teamId ?? null, tracked: usuario.tracked });
  }
  // Quem já tem time ou cor e não está na conexão atual (conta do escritório trocada) continua na tela.
  for (const gravada of gravadas) if (!pessoas.has(gravada.externalId) && (gravada.teamId || gravada.color)) {
    pessoas.set(gravada.externalId, { externalId: gravada.externalId, userId: null, login: gravada.login, name: names.get(gravada.externalId) ?? null,
      cor: gravada.color ?? corAutomatica(gravada.externalId), corPropria: Boolean(gravada.color), time: gravada.teamId, tracked: false });
  }
  return {
    conectado: connection?.status === "connected", generation: connection?.generation ?? 0,
    times: times.map(time => ({ id: time.id, nome: time.name, cor: time.color })),
    pessoas: [...pessoas.values()].sort((a, b) => (a.name ?? a.login).localeCompare(b.name ?? b.login, "pt-BR")),
  };
}

const cor = z.string().transform((valor, ctx) => hexDaCor(valor) ?? (ctx.addIssue({ code: "custom", message: "Cor inválida." }), z.NEVER));
const nome = z.string().trim().min(1, "Dê um nome ao time.").max(80, "Use até 80 caracteres.");
const id = z.string().uuid();
const externalId = z.string().min(1).max(100);
export const acaoSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("criarTime"), nome, cor }),
  z.object({ action: z.literal("editarTime"), id, nome: nome.optional(), cor: cor.optional() }),
  z.object({ action: z.literal("excluirTime"), id }),
  // `timeId: null` tira do time; `cor: null` volta à cor automática. Campo ausente não muda.
  z.object({ action: z.literal("definirPessoa"), externalId, login: z.string().min(1).max(100), timeId: id.nullable().optional(), cor: cor.nullable().optional() }),
  z.object({ action: z.literal("acompanhar"), login: z.string().trim().min(1).max(100), generation: z.number().int().nonnegative() }),
  z.object({ action: z.literal("deixarDeAcompanhar"), userId: id, generation: z.number().int().nonnegative() }),
]);

export async function mudarTimes(ctx: AuthContext & { tenantId: string; userId: string }, input: unknown) {
  const acao = acaoSchema.parse(input), db = getPrisma(), tenantId = ctx.tenantId;
  const time = async (timeId: string) => { if (!await db.githubTeam.count({ where: { id: timeId, tenantId } })) throw new GithubError("Time não encontrado.", 404); };
  const nomeLivre = async (valor: string, exceto?: string) => {
    if (await db.githubTeam.count({ where: { tenantId, name: valor, ...(exceto ? { id: { not: exceto } } : {}) } })) throw new GithubError("Já existe um time com esse nome.", 409);
  };
  switch (acao.action) {
    case "criarTime": {
      await nomeLivre(acao.nome);
      const position = (await db.githubTeam.aggregate({ where: { tenantId }, _max: { position: true } }))._max.position ?? -1;
      const criado = await db.githubTeam.create({ data: { tenantId, name: acao.nome, color: acao.cor, position: position + 1 }, select: { id: true } });
      await logAudit({ tenantId, userId: ctx.userId, action: "github.team_create", entityType: "GithubTeam", entityId: criado.id });
      return { ok: true, id: criado.id };
    }
    case "editarTime": {
      await time(acao.id); if (acao.nome) await nomeLivre(acao.nome, acao.id);
      await db.githubTeam.update({ where: { id: acao.id }, data: { ...(acao.nome ? { name: acao.nome } : {}), ...(acao.cor ? { color: acao.cor } : {}) } });
      await logAudit({ tenantId, userId: ctx.userId, action: "github.team_update", entityType: "GithubTeam", entityId: acao.id });
      return { ok: true };
    }
    case "excluirTime": {
      // As pessoas ficam sem time (onDelete: SetNull), com a cor que já tinham.
      await time(acao.id); await db.githubTeam.delete({ where: { id: acao.id } });
      await logAudit({ tenantId, userId: ctx.userId, action: "github.team_delete", entityType: "GithubTeam", entityId: acao.id });
      return { ok: true };
    }
    case "definirPessoa": {
      if (acao.timeId) await time(acao.timeId);
      const dados = { login: acao.login, ...(acao.timeId !== undefined ? { teamId: acao.timeId } : {}), ...(acao.cor !== undefined ? { color: acao.cor } : {}) };
      await db.githubPerson.upsert({ where: { tenantId_externalId: { tenantId, externalId: acao.externalId } }, create: { tenantId, externalId: acao.externalId, ...dados }, update: dados });
      return { ok: true };
    }
    case "acompanhar": return changeIntegration(ctx, { action: "track", login: acao.login, generation: acao.generation });
    case "deixarDeAcompanhar": return changeIntegration(ctx, { action: "untrack", userId: acao.userId, generation: acao.generation });
  }
}
