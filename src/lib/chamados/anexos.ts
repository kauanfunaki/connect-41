import { createHash } from "crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { Contexto } from "./contexto";
import { exigirAbertura } from "./contexto";
import { rascunho } from "./consultas";
import { podeResponder } from "./acesso";
import { strings } from "./consultas";
import { anexosDoChamado } from "./armazenamento";
import { depois, evento, paraAgir, travarEscritorio } from "./comandos";

export async function enviarAnexo(c: Contexto, form: FormData) {
  const d = z.object({ id: z.uuid(), draftId: z.string().min(1).max(191), ticketId: z.string().max(191).optional(), version: z.coerce.number().int().nonnegative(), attachmentKey: z.string().max(80).nullable(), internal: z.boolean() }).parse({ id: form.get("id"), draftId: form.get("draftId"), ticketId: form.get("ticketId") || undefined, version: form.get("version"), attachmentKey: form.get("attachmentKey") || null, internal: form.get("internal") === "1" });
  const arquivo = form.get("file");
  if (!(arquivo instanceof File) || arquivo.size === 0 || arquivo.size > 10 * 1024 * 1024) throw new Error("Envie um arquivo de até 10 MB.");
  const sha256 = createHash("sha256").update(Buffer.from(await arquivo.arrayBuffer())).digest("hex");
  const anterior = await getPrisma().helpdeskAttachment.findFirst({ where: { id: d.id, tenantId: c.ctx.tenantId, uploadedById: c.ctx.userId, draftId: d.draftId, ticketId: d.ticketId ?? null } });
  if (anterior) {
    if (anterior.sha256 !== sha256) throw new Error("Conflito: este identificador já foi usado para outro arquivo.");
    return { id: anterior.id, version: d.version + 1 };
  }
  if (!d.ticketId) { exigirAbertura(c); const draft = await rascunho(c, d.draftId); if (draft.submittedAt) throw new Error("O rascunho já foi enviado."); }
  const gravados = await anexosDoChamado.gravarAnexos(c.ctx.tenantId, [arquivo]);
  if (!gravados.ok) throw new Error(gravados.erro);
  try {
    await getPrisma().$transaction(async tx => {
      await travarEscritorio(tx, c.ctx.tenantId);
      if (d.ticketId) {
        const t = await paraAgir(tx, c, d.ticketId, d.version);
        if (t.draftId !== d.draftId || !podeResponder(c.ctx, c.config, { ...t, approverIds: strings(t.approverIds) }, t.status, d.internal)) throw new Error("Não é possível anexar neste chamado.");
      } else {
        if (await tx.helpdeskAttachment.count({ where: { tenantId: c.ctx.tenantId, draftId: d.draftId } }) >= 20) throw new Error("Até vinte anexos na abertura do chamado.");
        const r = await tx.helpdeskDraft.updateMany({ where: { id: d.draftId, tenantId: c.ctx.tenantId, createdById: c.ctx.userId, version: d.version, submittedAt: null }, data: { version: { increment: 1 }, review: Prisma.DbNull, reviewVersion: null, analysisToken: null } });
        if (r.count !== 1) throw new Error("O rascunho mudou. Atualize a página.");
      }
      await tx.helpdeskAttachment.create({ data: { id: d.id, tenantId: c.ctx.tenantId, draftId: d.draftId, ticketId: d.ticketId ?? null, uploadedById: c.ctx.userId, sha256, attachmentKey: d.attachmentKey, internal: d.ticketId ? d.internal : false, ...gravados.anexos[0] } });
      if (d.ticketId) await evento(tx, c.ctx.tenantId, d.ticketId, c.ctx.userId, "attachment", {}, d.internal);
    });
  } catch (err) { await anexosDoChamado.apagarAnexosGravados(gravados.anexos); throw err; }
  if (d.ticketId) await depois(c, d.ticketId, "attachment");
  return { id: d.id, version: d.version + 1 };
}
export async function removerAnexoRascunho(c: Contexto, draftId: string, id: string, version: number) {
  exigirAbertura(c);
  await getPrisma().$transaction(async tx => {
    const d = await tx.helpdeskDraft.updateMany({ where: { id: draftId, tenantId: c.ctx.tenantId, createdById: c.ctx.userId, submittedAt: null, version }, data: { version: { increment: 1 }, review: Prisma.DbNull, reviewVersion: null, analysisToken: null } });
    if (d.count !== 1) throw new Error("O rascunho mudou. Atualize a página.");
    const a = await tx.helpdeskAttachment.deleteMany({ where: { id, tenantId: c.ctx.tenantId, draftId, ticketId: null } });
    if (!a.count) throw new Error("Anexo não encontrado.");
  });
  // Não apaga arquivos de um trabalho pendente automaticamente. A remoção
  // explícita só desvincula a evidência do formulário e da próxima análise.
  return { version: version + 1 };
}
