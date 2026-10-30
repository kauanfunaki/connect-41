"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { TerminationType, TerminationStatus } from "@/generated/prisma/enums";
import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { dataDoDesligamento, DESLIGAMENTO_ENCERRADO } from "@/lib/situacoesDoDP";

export type TerminationState = { error: string } | null;

async function assertPersonInScope(personId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  return !!person;
}

export async function criarDesligamento(
  personId: string,
  _prev: TerminationState,
  form: FormData
): Promise<TerminationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, "dp_colaboradores", "gerir"))) return { error: "Sem permissão para registrar desligamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const type = form.get("type") as TerminationType;
  if (!Object.values(TerminationType).includes(type)) return { error: "Tipo de desligamento inválido." };
  const reason = (form.get("reason") as string)?.trim() || null;
  const notes = (form.get("notes") as string)?.trim() || null;

  const prisma = getPrisma();
  // A mesma regra da tela (05/10/2026): um desligamento em andamento por vez;
  // o finalizado e o cancelado não impedem o próximo.
  const emAndamento = await prisma.termination.count({
    where: { tenantId: ctx.tenantId, personId, status: { notIn: [...DESLIGAMENTO_ENCERRADO] } },
  });
  if (emAndamento > 0) return { error: "Já há um desligamento em andamento para esta pessoa." };
  try {
    await prisma.termination.create({
      data: { tenantId: ctx.tenantId, personId, type, reason, notes },
    });
  } catch (err) {
    console.error("[criarDesligamento]", err);
    return { error: "Erro ao registrar desligamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarDesligamento(
  personId: string,
  terminationId: string,
  _prev: TerminationState,
  form: FormData
): Promise<TerminationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, "dp_colaboradores", "gerir"))) return { error: "Sem permissão para atualizar desligamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as TerminationStatus;
  if (!Object.values(TerminationStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.termination.findFirst({ where: { id: terminationId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Registro não encontrado." };

  try {
    const finalizedAt = status === "FINALIZADO" ? new Date() : existing.finalizedAt;
    await prisma.termination.update({
      where: { id: terminationId },
      data: { status, finalizedAt },
    });

    if (status === "FINALIZADO") {
      await prisma.person.update({
        where: { id: personId },
        data: { employmentStatus: "DESLIGADO", dismissalDate: dataDoDesligamento({ terminationDate: existing.terminationDate, finalizedAt }, new Date()) },
      });
    } else if (existing.status === "FINALIZADO") {
      // Reabrir um desligamento finalizado desfaz o que a finalização fez na
      // pessoa (auditoria de UX, 30/10/2026): antes ela seguia DESLIGADA, com a
      // data de demissão, e o registro dizia o contrário. Volta a ATIVO, como
      // no fim de um afastamento ou de férias — só se ainda está desligada,
      // para não atropelar outra situação gravada depois.
      await prisma.termination.update({ where: { id: terminationId }, data: { finalizedAt: null } });
      await prisma.person.updateMany({
        where: { id: personId, tenantId: ctx.tenantId, employmentStatus: "DESLIGADO" },
        data: { employmentStatus: "ATIVO", dismissalDate: null },
      });
    }
  } catch (err) {
    console.error("[atualizarDesligamento]", err);
    return { error: "Erro ao atualizar desligamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirDesligamento(personId: string, terminationId: string): Promise<void> {
  const ctx = await getAuthContext();
  // Excluir: só o administrador (13/10/2026). Antes, quem gere o módulo no setor.
  if (!ctx.tenantId || !podeExcluir(ctx) || !(await podeNoModulo(ctx, "dp_colaboradores", "gerir"))) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.termination.findFirst({ where: { id: terminationId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.termination.delete({ where: { id: terminationId } });
  } catch (err) {
    console.error("[excluirDesligamento]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
