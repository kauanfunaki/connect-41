import { getPrisma } from "@/lib/prisma";
import { CATALOGO_DE_CHAMADOS, A_CLASSIFICAR } from "./catalogo";
import { categoriaSchema } from "./regras";

// Inicialização no primeiro rascunho, sob a mesma trava por escritório usada
// nas demais escritas. Nunca reativa ou substitui formulários e aprovações.
export async function prepararCatalogo(tenantId: string) {
  const existentes = await getPrisma().helpdeskCategory.findMany({ where: { tenantId }, select: { name: true, parentId: true } });
  const porNome = new Map(existentes.map(c => [c.name, c]));
  if (porNome.has(A_CLASSIFICAR) && Object.entries(CATALOGO_DE_CHAMADOS).every(([grupo, filhos]) => porNome.has(grupo) && filhos.every(nome => porNome.get(nome)?.parentId))) return;
  await getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
    for (const [name, filhos] of Object.entries(CATALOGO_DE_CHAMADOS)) {
      const grupo = await tx.helpdeskCategory.upsert({ where: { tenantId_name: { tenantId, name } }, create: { tenantId, ...categoriaSchema.parse({ name }) }, update: {} });
      for (const nome of filhos) {
        const categoria = await tx.helpdeskCategory.upsert({ where: { tenantId_name: { tenantId, name: nome } }, create: { tenantId, ...categoriaSchema.parse({ name: nome, parentId: grupo.id }) }, update: {} });
        if (!categoria.parentId) await tx.helpdeskCategory.update({ where: { id: categoria.id }, data: { parentId: grupo.id, version: { increment: 1 } } });
      }
    }
    await tx.helpdeskCategory.upsert({ where: { tenantId_name: { tenantId, name: A_CLASSIFICAR } }, create: { tenantId, ...categoriaSchema.parse({ name: A_CLASSIFICAR }) }, update: {} });
  }, { timeout: 15000 });
}
