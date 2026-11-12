import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { exigirGestao, type Contexto } from "./contexto";
import { categoriaSchema, MODULO, PRIORIDADES } from "./regras";
import { podeEscolherSetores } from "./acesso";
import { setModuleSector, setModuleSharedSectors } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { setorParaGravar } from "@/lib/modulo-setor";
import { json, travarEscritorio } from "./comandos";

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

/**
 * Os setores que administram os chamados (12/11/2026, funcionalidade-640): um
 * ou mais, e o padrão — o que atende quando quem abre não escolhe. Moram onde
 * moram os setores de qualquer tela: o padrão é o dono do módulo
 * (`TenantModule.sectorCode`) e os outros, os setores ligados
 * (`TenantModuleSector`). Um setor com chamado em aberto só sai depois de a
 * equipe redirecionar esses chamados.
 */
export async function salvarSetores(c: Contexto, input: unknown) {
  if (!podeEscolherSetores(c.ctx, c.config)) throw new Error("Só o administrador do escritório escolhe os setores que administram os chamados.");
  const d = z.object({ setores: z.array(z.string().trim().min(1).max(40)).min(1, "Escolha ao menos um setor.").max(30), padrao: z.string().trim().min(1).max(40) }).parse(input);
  const setores = [...new Set(d.setores)];
  if (!setores.includes(d.padrao)) throw new Error("O setor padrão precisa estar entre os que administram.");
  const tenantId = c.ctx.tenantId, db = getPrisma();
  const ativos = new Set((await db.sector.findMany({ where: { tenantId, code: { in: setores }, active: true }, select: { code: true } })).map(s => s.code));
  if (setores.some(s => !ativos.has(s))) throw new Error("Setor inativo ou inexistente.");
  const saindo = c.config.sectorCodes.filter(s => !setores.includes(s));
  if (saindo.length) {
    const abertos = await db.helpdeskTicket.groupBy({ by: ["handlingSectorCode"], where: { tenantId, handlingSectorCode: { in: saindo }, status: { notIn: ["RESOLVIDO", "CANCELADO"] } }, _count: { _all: true } });
    if (abertos.length) {
      const nomes = new Map((await db.sector.findMany({ where: { tenantId, code: { in: abertos.map(a => a.handlingSectorCode) } }, select: { code: true, label: true } })).map(s => [s.code, s.label]));
      throw new Error(`Redirecione antes os chamados em aberto de ${abertos.map(a => `${nomes.get(a.handlingSectorCode) ?? a.handlingSectorCode} (${a._count._all})`).join(", ")}.`);
    }
  }
  const def = getModuleDef(MODULO);
  if (!def) throw new Error("Módulo de chamados fora do catálogo.");
  await setModuleSector(tenantId, MODULO, setorParaGravar(def.sectorCode, d.padrao));
  await setModuleSharedSectors(tenantId, MODULO, setores.filter(s => s !== d.padrao));
  await logAudit({ tenantId, userId: c.ctx.userId, action: "helpdesk.sectors", entityType: "TenantModule", entityId: MODULO, metadata: { setores, padrao: d.padrao, antes: c.config.sectorCodes } });
}
