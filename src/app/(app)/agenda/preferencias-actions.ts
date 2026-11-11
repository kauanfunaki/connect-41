"use server";

// A Agenda de cada pessoa e de cada setor (10/11/2026, pedido do Kauan) — as
// regras estão em src/lib/agendaDoSetor.ts.
//
// - da pessoa: as fontes que ela desligou (os botões acima de Prazos e Mês) e a
//   última visão que escolheu. Qualquer um, só o seu; sem auditoria, como a
//   personalização do Início — é gosto, não configuração do escritório;
// - do setor: se usa reuniões e as fontes que a Agenda mostra por padrão. O
//   coordenador do setor (SECTOR_ADMIN dele), o Admin ou o Super Admin, com
//   registro na auditoria.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { ActionState } from "@/lib/actionState";
import { lerVisaoDaAgenda } from "@/lib/agenda";
import { defDaFonte, gravarFontesOcultas, lerFontesOcultas, limparFontes } from "@/lib/fontesDaAgenda";
import { blocosDoSetor, podeConfigurarOSetor } from "@/lib/meuDia/configuracao";
import { serializeTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";

const FALTA_A_MIGRATION =
  "Falta atualizar o banco para guardar a Agenda por setor e por pessoa (a migration “agenda_e_meu_dia_por_setor”). Até lá vale o padrão.";
const SEM_PERMISSAO = "Só o coordenador do setor, o Admin ou o Super Admin mudam a Agenda do setor.";

function revalidarAsTelas() {
  revalidatePath("/agenda");
  revalidatePath("/tarefas");
  revalidatePath("/configuracoes");
  revalidatePath("/admin/setores");
}

// ─── Da pessoa ──────────────────────────────────────────────────────────────

/** Grava as fontes que a pessoa desligou. A lista inteira: a partir daqui ela não segue mais o setor. */
export async function salvarFontesDaAgenda(ocultas: string[]): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  const fontesOcultas = gravarFontesOcultas(Array.isArray(ocultas) ? ocultas : []);
  try {
    await getPrisma().userAgendaView.upsert({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, fontesOcultas },
      update: { fontesOcultas },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { error: FALTA_A_MIGRATION };
    console.error("[salvarFontesDaAgenda]", err);
    return { error: "Não foi possível guardar as fontes. Tente de novo." };
  }
  revalidatePath("/agenda");
  revalidatePath("/tarefas");
  return null;
}

/** Volta as fontes da pessoa ao padrão do setor (mantém a visão lembrada). */
export async function restaurarFontesDaAgenda(): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  try {
    await getPrisma().userAgendaView.updateMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      data: { fontesOcultas: null },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return null;
    console.error("[restaurarFontesDaAgenda]", err);
    return { error: "Não foi possível voltar ao padrão. Tente de novo." };
  }
  revalidatePath("/agenda");
  revalidatePath("/tarefas");
  return null;
}

/**
 * A visão que a pessoa acabou de escolher, para a Agenda abrir nela da próxima
 * vez. Sem revalidar: quem chama já está indo para a visão escolhida. Sem a
 * tabela, não lembra — e não incomoda ninguém com isso.
 */
export async function lembrarVisaoDaAgenda(visao: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return null;
  const valida = lerVisaoDaAgenda(visao);
  if (!valida) return null;
  try {
    await getPrisma().userAgendaView.upsert({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, visao: valida },
      update: { visao: valida },
    });
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[lembrarVisaoDaAgenda]", err);
  }
  return null;
}

// ─── Do setor ───────────────────────────────────────────────────────────────

async function setorConfiguravel(sectorCode: string) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { ok: false, erro: "Não autenticado" } as const;
  if (!sectorCode || !podeConfigurarOSetor(ctx, sectorCode)) return { ok: false, erro: SEM_PERMISSAO } as const;
  const setor = await getPrisma().sector.findFirst({
    where: { tenantId: ctx.tenantId, code: sectorCode },
    select: { id: true, code: true, label: true },
  });
  if (!setor) return { ok: false, erro: "Setor não encontrado neste escritório." } as const;
  return { ok: true, ctx, tenantId: ctx.tenantId, setor } as const;
}

/**
 * "Usa reuniões" também é o padrão do Meu dia: quando o setor muda, o bloco
 * "Próximas reuniões" do padrão GRAVADO do Meu dia do setor (se ele tem um)
 * acompanha — senão a configuração antiga, que listava o bloco porque ele era
 * de todos, desmentiria o que o coordenador acabou de dizer. O Meu dia próprio
 * de cada pessoa não muda: a pessoa vale mais que o setor.
 */
async function acompanharNoMeuDia(tenantId: string, sectorCode: string, antes: boolean, depois: boolean) {
  if (antes === depois) return;
  const prisma = getPrisma();
  const linha = await prisma.sectorTaskView.findUnique({
    where: { tenantId_sectorCode: { tenantId, sectorCode } },
    select: { widgets: true },
  });
  if (!linha) return;
  const blocos: TaskWidgetKey[] = blocosDoSetor(linha.widgets, antes).filter((k) => k !== "reunioes");
  if (depois) blocos.push("reunioes");
  await prisma.sectorTaskView.update({
    where: { tenantId_sectorCode: { tenantId, sectorCode } },
    data: { widgets: serializeTaskWidgets(blocos) },
  });
}

export type AgendaDoSetorEnviada = { usaReunioes: boolean; fontesOcultas: string[] };

export async function salvarAgendaDoSetor(sectorCode: string, dados: AgendaDoSetorEnviada): Promise<ActionState> {
  const r = await setorConfiguravel(sectorCode);
  if (!r.ok) return { error: r.erro };
  const usaReunioes = dados?.usaReunioes !== false;
  const ocultas = limparFontes(Array.isArray(dados?.fontesOcultas) ? dados.fontesOcultas : []);
  const prisma = getPrisma();
  const chave = { tenantId_sectorCode: { tenantId: r.tenantId, sectorCode: r.setor.code } };
  try {
    const antes = await prisma.sectorAgendaView.findUnique({ where: chave, select: { usaReunioes: true, fontesOcultas: true } });
    const valores = { usaReunioes, fontesOcultas: gravarFontesOcultas(ocultas), updatedById: r.ctx.userId };
    await prisma.sectorAgendaView.upsert({
      where: chave,
      create: { tenantId: r.tenantId, sectorCode: r.setor.code, ...valores },
      update: valores,
    });
    await acompanharNoMeuDia(r.tenantId, r.setor.code, antes?.usaReunioes ?? true, usaReunioes);
    await logAudit({
      tenantId: r.tenantId,
      userId: r.ctx.userId,
      action: "sector.agenda.update",
      entityType: "Sector",
      entityId: r.setor.id,
      metadata: {
        setor: r.setor.label,
        usaReunioes: usaReunioes ? "sim" : "não",
        fontesEscondidas: ocultas.length ? ocultas.map((f) => defDaFonte(f).rotulo).join(", ") : "nenhuma",
        ...(antes
          ? {
              antes: `${antes.usaReunioes ? "usava" : "não usava"} reuniões; escondia ${
                (lerFontesOcultas(antes.fontesOcultas) ?? []).map((f) => defDaFonte(f).rotulo).join(", ") || "nenhuma fonte"
              }`,
            }
          : {}),
      },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { error: FALTA_A_MIGRATION };
    console.error("[salvarAgendaDoSetor]", err);
    return { error: "Não foi possível salvar a Agenda do setor. Tente de novo." };
  }
  revalidarAsTelas();
  return null;
}

/** Volta o setor ao padrão do código (usa reuniões, todas as fontes), apagando a linha. */
export async function restaurarAgendaDoSetor(sectorCode: string): Promise<ActionState> {
  const r = await setorConfiguravel(sectorCode);
  if (!r.ok) return { error: r.erro };
  const prisma = getPrisma();
  const chave = { tenantId_sectorCode: { tenantId: r.tenantId, sectorCode: r.setor.code } };
  try {
    const antes = await prisma.sectorAgendaView.findUnique({ where: chave, select: { usaReunioes: true } });
    if (!antes) return null;
    await prisma.sectorAgendaView.delete({ where: chave });
    await acompanharNoMeuDia(r.tenantId, r.setor.code, antes.usaReunioes, true);
    await logAudit({
      tenantId: r.tenantId,
      userId: r.ctx.userId,
      action: "sector.agenda.reset",
      entityType: "Sector",
      entityId: r.setor.id,
      metadata: { setor: r.setor.label },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return null;
    console.error("[restaurarAgendaDoSetor]", err);
    return { error: "Não foi possível voltar ao padrão. Tente de novo." };
  }
  revalidarAsTelas();
  return null;
}
