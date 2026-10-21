import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { exigirGestao, type Contexto } from "./contexto";
import { categoriaSchema, PRIORIDADES } from "./regras";
import { json, travarEscritorio } from "./comandos";

export async function configurarSetores(input: unknown) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) throw new Error("Só um administrador com acesso de escrita pode configurar os setores.");
  const escolhidos = [...new Set(z.array(z.string().min(1).max(40)).max(200).parse(input))];
  const ativos = await getPrisma().sector.count({ where: { tenantId: ctx.tenantId, code: { in: escolhidos }, active: true } });
  if (ativos !== escolhidos.length) throw new Error("Selecione somente setores ativos deste escritório.");
  await getPrisma().$transaction(async tx => {
    await travarEscritorio(tx, ctx.tenantId);
    await tx.helpdeskRequesterSector.deleteMany({ where: { tenantId: ctx.tenantId } });
    if (escolhidos.length) await tx.helpdeskRequesterSector.createMany({ data: escolhidos.map(sectorCode => ({ tenantId: ctx.tenantId, sectorCode })) });
  });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "helpdesk.access", entityType: "TenantModule", entityId: "helpdesk", metadata: { setores: escolhidos } });
}
export async function salvarCategoria(c: Contexto, input: unknown) {
  exigirGestao(c); const dados = categoriaSchema.parse(input), { id, ...values } = dados;
  await getPrisma().$transaction(async tx => {
    await travarEscritorio(tx, c.ctx.tenantId);
    if (id && !await tx.helpdeskCategory.count({ where: { id, tenantId: c.ctx.tenantId } })) throw new Error("Categoria não encontrada.");
    let parentId = dados.parentId;
    const visitados = new Set(id ? [id] : []);
    while (parentId) {
      if (visitados.has(parentId)) throw new Error("A hierarquia de categorias não pode conter ciclos.");
      visitados.add(parentId);
      const parent = await tx.helpdeskCategory.findFirst({ where: { id: parentId, tenantId: c.ctx.tenantId }, select: { parentId: true } });
      if (!parent) throw new Error("Categoria pai de outro escritório ou inexistente.");
      parentId = parent.parentId;
    }
    if (dados.approvalUserIds.length && await tx.user.count({ where: { tenantId: c.ctx.tenantId, id: { in: dados.approvalUserIds }, active: true, role: { not: "READONLY" } } }) !== dados.approvalUserIds.length) throw new Error("Aprovador inválido.");
    const data = { ...values, tenantId: c.ctx.tenantId, formSchema: json(values.formSchema), requiredAttachments: json(values.requiredAttachments), checklistTemplate: json(values.checklistTemplate), approvalUserIds: values.approvalUserIds };
    if (id) await tx.helpdeskCategory.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    else await tx.helpdeskCategory.create({ data });
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "helpdesk.category", entityType: "HelpdeskCategory", entityId: id ?? "new" });
}
export async function salvarPolitica(c: Contexto, input: unknown) {
  exigirGestao(c);
  const d = z.object({ priority: z.enum(PRIORIDADES), firstResponseMinutes: z.number().int().min(1).max(525600), resolutionMinutes: z.number().int().min(1).max(525600) }).parse(input);
  await getPrisma().helpdeskSlaPolicy.upsert({ where: { tenantId_priority: { tenantId: c.ctx.tenantId, priority: d.priority } }, create: { tenantId: c.ctx.tenantId, ...d }, update: d });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "helpdesk.sla", entityType: "HelpdeskSlaPolicy", entityId: d.priority });
}
