// Sessão assistida do robô (06/11/2026) — o banco e os avisos. A regra mora em
// `assistencia.ts`, e o quadro e os cliques em `assistenciaAoVivo.ts`.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { pessoaOuRotina } from "@/lib/auditoria/rotinas";
import { notifySector, notifyUser } from "@/lib/notifications";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantTime } from "@/lib/format";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { canActOnSector, type AuthContext } from "@/lib/auth/context";
import { ErroOps, type CredencialAutenticadaOps } from "@/lib/ops/servidor";
import { TIPOS_DE_TAREFA, ehTipoDeTarefa, rotuloNaFrase } from "./tarefas";
import {
  TIPOS_COM_ASSISTENCIA,
  aceitaClique,
  dentroDoHorarioComercial,
  estadoDaAssistencia,
  precisaEscalar,
  prazoDaAssistencia,
  type Clique,
  type EstadoDaAssistencia,
  type FimDaAssistencia,
  type MotivoDaAssistencia,
} from "./assistencia";
import { enfileirarClique, esquecerSessao, guardarQuadro, retirarCliques, ultimoQuadro } from "./assistenciaAoVivo";

const MODULO = "societario_robo";
export const TIPO_DO_AVISO = "ROBO_CAPTCHA";

type Tarefa = { id: string; tenantId: string; kind: string; attempts: number; companyId: string | null; requestedById: string | null };

/** Só a máquina que está com a tarefa, e só nos tipos que pedem ajuda. */
async function tarefaDaMaquina(w: CredencialAutenticadaOps, id: string): Promise<Tarefa> {
  if (!w.slug) throw new ErroOps("O endereço precisa da automação.", 400);
  const t = await getPrisma().robotTask.findFirst({
    where: { id, tenantId: w.tenantId, status: "EM_EXECUCAO", machineSlug: w.slug, kind: { in: [...TIPOS_COM_ASSISTENCIA] } },
    select: { id: true, tenantId: true, kind: true, attempts: true, companyId: true, requestedById: true },
  });
  if (!t) throw new ErroOps("A tarefa não está mais com esta máquina.", 409);
  return t;
}

function sessaoAberta(t: Tarefa) {
  return getPrisma().robotAssist.findFirst({ where: { tenantId: t.tenantId, taskId: t.id, attempt: t.attempts, endedAt: null } });
}

async function textoDoAviso(t: Tarefa, ate: Date): Promise<string> {
  const empresa = t.companyId
    ? await getPrisma().company.findFirst({ where: { id: t.companyId, tenantId: t.tenantId }, select: { name: true, displayName: true } })
    : null;
  const oQue = ehTipoDeTarefa(t.kind) ? rotuloNaFrase(t.kind) : "fazer a tarefa";
  const deQuem = empresa ? ` de ${nomeExibicao(empresa)}` : "";
  return `O robô parou no "Não sou um robô" ao ${oQue}${deQuem}. Abra e marque com o mouse até ${formatInstantTime(ate, { hour: "2-digit", minute: "2-digit" })}.`;
}

async function setoresDoRobo(tenantId: string): Promise<string[]> {
  return (await setoresDoModulo(tenantId, MODULO)) ?? ["societario"];
}

/** Chama o setor inteiro, uma vez só por sessão, mesmo com dois quadros chegando juntos. */
async function escalar(t: Tarefa, sessaoId: string, ate: Date, agora: Date): Promise<void> {
  const r = await getPrisma().robotAssist.updateMany({ where: { id: sessaoId, escalatedAt: null, endedAt: null }, data: { escalatedAt: agora } });
  if (r.count !== 1) return;
  const message = `Ninguém respondeu ainda. ${await textoDoAviso(t, ate)}`;
  for (const setor of await setoresDoRobo(t.tenantId)) {
    await notifySector(setor, { tenantId: t.tenantId, type: TIPO_DO_AVISO, message, entityId: t.id }).catch((err) =>
      console.error("[robo] aviso ao setor", err instanceof Error ? err.name : "erro"),
    );
  }
}

export type RespostaDaAbertura = { aguardar: true; prazoMs: number; ate: string } | { aguardar: false; motivo: "fora_do_horario" };

/**
 * O robô parou e pede ajuda. Fora do horário comercial a resposta é "não
 * espere": ninguém está para resolver, e a tarefa segue para o caminho do PDF.
 * Pedir de novo na mesma tentativa devolve a mesma sessão (ou reabre a que já
 * terminou, se o captcha voltou).
 */
export async function abrirAssistencia(w: CredencialAutenticadaOps, id: string, motivo: MotivoDaAssistencia, agora = new Date()): Promise<RespostaDaAbertura> {
  const t = await tarefaDaMaquina(w, id);
  if (!dentroDoHorarioComercial(agora)) return { aguardar: false, motivo: "fora_do_horario" };
  const db = getPrisma();
  const chave = { taskId_attempt: { taskId: t.id, attempt: t.attempts } };
  const existente = await db.robotAssist.findUnique({ where: chave });
  if (existente && !existente.endedAt && existente.deadlineAt > agora) {
    return { aguardar: true, prazoMs: existente.deadlineAt.getTime() - agora.getTime(), ate: existente.deadlineAt.toISOString() };
  }
  const ate = prazoDaAssistencia(agora);
  const dados = { reason: motivo, startedAt: agora, deadlineAt: ate, escalatedAt: null, endedAt: null, outcome: null, clicks: 0, lastClickById: null, lastClickAt: null };
  const sessao = existente
    ? await db.robotAssist.update({ where: chave, data: dados })
    : await db.robotAssist.create({ data: { tenantId: t.tenantId, taskId: t.id, attempt: t.attempts, ...dados } });
  esquecerSessao(t.id);
  // O pedido de ajuda vale como sinal de vida: a máquina fica até 10 min sem
  // pedir trabalho, e a tela do robô não pode dizer que ela sumiu.
  // (`w.slug` existe: `tarefaDaMaquina` recusa sem ele. Nunca `undefined` aqui,
  // que tiraria o filtro e marcaria todas as automações do escritório.)
  await db.opsWatcher.updateMany({ where: { tenantId: t.tenantId, slug: w.slug as string, isActive: true }, data: { lastHeartbeatAt: agora } });

  await logAudit({ tenantId: t.tenantId, ...pessoaOuRotina(null, "roboDoSocietario"), action: "societario.robo.assistencia_pedida", entityType: "RobotTask", entityId: t.id, metadata: { motivo, maquina: w.slug, ate: ate.toISOString() } });

  // Quem pediu primeiro; sem quem pediu, o setor já de saída.
  if (t.requestedById) {
    await notifyUser(t.requestedById, { tenantId: t.tenantId, type: TIPO_DO_AVISO, message: await textoDoAviso(t, ate), entityId: t.id }).catch((err) =>
      console.error("[robo] aviso", err instanceof Error ? err.name : "erro"),
    );
  } else {
    await escalar(t, sessao.id, ate, agora);
  }
  return { aguardar: true, prazoMs: ate.getTime() - agora.getTime(), ate: ate.toISOString() };
}

export type RespostaDoQuadro = { encerrar: boolean; cliques: Clique[] };

/**
 * O robô manda a tela e leva os cliques que a pessoa deu desde o último
 * quadro. É também o relógio da sessão: passados 2 min sem clique, o aviso vai
 * para o setor; passado o prazo, a resposta manda o robô parar.
 */
export async function receberQuadro(w: CredencialAutenticadaOps, id: string, bytes: Uint8Array, tipo: string, agora = new Date()): Promise<RespostaDoQuadro> {
  const t = await tarefaDaMaquina(w, id);
  const s = await sessaoAberta(t);
  if (!s || agora > s.deadlineAt) return { encerrar: true, cliques: [] };
  guardarQuadro(t.id, { bytes, tipo, em: agora });
  if (precisaEscalar(s, agora)) await escalar(t, s.id, s.deadlineAt, agora);
  return { encerrar: false, cliques: retirarCliques(t.id).map(({ x, y }) => ({ x, y })) };
}

/** O robô terminou a espera: resolvido, prazo ou desistiu (fechou a janela, a página mudou). */
export async function encerrarAssistencia(w: CredencialAutenticadaOps, id: string, fim: FimDaAssistencia, agora = new Date()): Promise<{ ok: true }> {
  const t = await tarefaDaMaquina(w, id);
  const s = await sessaoAberta(t);
  esquecerSessao(t.id);
  if (!s) return { ok: true };
  const r = await getPrisma().robotAssist.updateMany({ where: { id: s.id, endedAt: null }, data: { endedAt: agora, outcome: fim } });
  if (r.count !== 1) return { ok: true };
  // Quem clicou responde por ter resolvido: é o nome que a auditoria mostra.
  await logAudit({
    tenantId: t.tenantId,
    ...pessoaOuRotina(fim === "resolvido" ? s.lastClickById : null, "roboDoSocietario"),
    action: fim === "resolvido" ? "societario.robo.assistencia_resolvida" : "societario.robo.assistencia_sem_resposta",
    entityType: "RobotTask",
    entityId: t.id,
    metadata: { fim, cliques: s.clicks, segundos: Math.round((agora.getTime() - s.startedAt.getTime()) / 1000), maquina: w.slug },
  });
  return { ok: true };
}

// ─── o lado da pessoa ────────────────────────────────────────────────────────

/** O mesmo portão da tela do robô: o setor que opera o módulo, com o módulo ligado. */
export async function podeAssistir(ctx: AuthContext): Promise<boolean> {
  if (!ctx.tenantId) return false;
  return canActOnSector(ctx, await setoresDoRobo(ctx.tenantId)) && (await isModuleEnabled(ctx.tenantId, MODULO));
}

export type AssistenciaParaPessoa = {
  tarefaId: string;
  oQue: string;
  empresa: string | null;
  estado: EstadoDaAssistencia | "sem_sessao";
  ate: string | null;
  cliques: number;
  /** Só quando há quadro mais novo que o `desde` pedido. */
  quadro: { dataUrl: string; em: number } | null;
};

/** O que a página mostra; `null` quando a tarefa não existe neste escritório ou não é de assistência. */
export async function lerAssistencia(ctx: AuthContext, id: string, desde = 0, agora = new Date()): Promise<AssistenciaParaPessoa | null> {
  const db = getPrisma();
  const t = await db.robotTask.findFirst({ where: { id, tenantId: ctx.tenantId, kind: { in: [...TIPOS_COM_ASSISTENCIA] } }, select: { id: true, kind: true, companyId: true } });
  if (!t) return null;
  const [s, empresa] = await Promise.all([
    db.robotAssist.findFirst({ where: { tenantId: ctx.tenantId, taskId: t.id }, orderBy: { startedAt: "desc" } }),
    t.companyId ? db.company.findFirst({ where: { id: t.companyId, tenantId: ctx.tenantId }, select: { name: true, displayName: true } }) : null,
  ]);
  const q = ultimoQuadro(t.id);
  const estado = s ? estadoDaAssistencia(s, q?.em ?? null, agora) : "sem_sessao";
  const mostrarQuadro = q && aceitaCliqueOuAoVivo(estado) && q.em.getTime() > desde;
  return {
    tarefaId: t.id,
    oQue: ehTipoDeTarefa(t.kind) ? TIPOS_DE_TAREFA[t.kind].rotulo : t.kind,
    empresa: empresa ? nomeExibicao(empresa) : null,
    estado,
    ate: s?.deadlineAt.toISOString() ?? null,
    cliques: s?.clicks ?? 0,
    quadro: mostrarQuadro ? { dataUrl: `data:${q.tipo};base64,${Buffer.from(q.bytes).toString("base64")}`, em: q.em.getTime() } : null,
  };
}

function aceitaCliqueOuAoVivo(estado: EstadoDaAssistencia | "sem_sessao"): boolean {
  return estado !== "sem_sessao" && aceitaClique(estado);
}

export type ResultadoDoClique = { ok: true } | { ok: false; erro: string };

/** A pessoa clicou na tela espelhada. O clique vai para a fila que o robô busca com o próximo quadro. */
export async function cliqueDaPessoa(ctx: AuthContext, id: string, clique: Clique, agora = new Date()): Promise<ResultadoDoClique> {
  const db = getPrisma();
  const s = await db.robotAssist.findFirst({ where: { tenantId: ctx.tenantId, taskId: id }, orderBy: { startedAt: "desc" } });
  if (!s) return { ok: false, erro: "Esta tarefa não pediu ajuda." };
  const estado = estadoDaAssistencia(s, ultimoQuadro(id)?.em ?? null, agora);
  if (!aceitaClique(estado)) return { ok: false, erro: estado === "aguardando_tela" ? "A tela do robô ainda não chegou." : "A sessão já terminou." };
  enfileirarClique(id, { ...clique, userId: ctx.userId, em: agora });
  await db.robotAssist.updateMany({ where: { id: s.id, endedAt: null }, data: { clicks: { increment: 1 }, lastClickById: ctx.userId, lastClickAt: agora } });
  return { ok: true };
}
