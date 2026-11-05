// Anexos do Controle interno (05/11/2026): print de tela, PDF, planilha — o que
// ajuda a entender o bug ou a melhoria. Mesmo armazenamento e mesma régua de
// tipo dos Arquivos (`validarArquivoDoDrive`, conferido pelos bytes), numa
// pasta própria. Um arquivo por requisição, pela rota, para o navegador mostrar
// o progresso e o corpo não esbarrar no limite das Server Actions.
//
// O anexo não mexe na versão do item: como o comentário, entra sem conflitar
// com quem está com o formulário aberto.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";
import { validarArquivoDoDrive } from "@/lib/drive/tipoDoArquivo";
import { MODULO_TECH_INTERNO } from "./regras";
import { metadadosDoAtor, type AtorTech } from "./servidor";

export const armazenamentoTech = criarArmazenamento("tech-interno", { validar: validarArquivoDoDrive, maximoPorEnvio: 1 });

/** Teto por item: evita que um item vire depósito de arquivos. */
export const MAXIMO_DE_ANEXOS_POR_ITEM = 50;

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string; status: number };

export async function anexarArquivo(ctx: AtorTech, itemId: string, arquivo: File): Promise<Resultado<{ id: string; nome: string }>> {
  if (!ctx.userId || !ctx.tenantId || !await podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")) {
    return { ok: false, erro: "Você não pode anexar arquivos neste item.", status: 403 };
  }
  const db = getPrisma();
  const [item, pessoa, total] = await Promise.all([
    db.techInternalItem.findFirst({ where: { id: itemId, tenantId: ctx.tenantId }, select: { id: true, title: true } }),
    db.user.findFirst({ where: { id: ctx.userId, tenantId: ctx.tenantId, active: true }, select: { name: true } }),
    db.techInternalAttachment.count({ where: { tenantId: ctx.tenantId, itemId } }),
  ]);
  if (!item) return { ok: false, erro: "Item não encontrado.", status: 404 };
  if (!pessoa) return { ok: false, erro: "Sessão indisponível. Entre novamente.", status: 401 };
  if (total >= MAXIMO_DE_ANEXOS_POR_ITEM) return { ok: false, erro: `Até ${MAXIMO_DE_ANEXOS_POR_ITEM} anexos por item.`, status: 400 };

  const gravados = await armazenamentoTech.gravarAnexos(ctx.tenantId, [arquivo]);
  if (!gravados.ok) return { ok: false, erro: gravados.erro, status: 400 };
  const [gravado] = gravados.anexos;
  try {
    const anexo = await db.techInternalAttachment.create({
      data: { tenantId: ctx.tenantId, itemId, uploadedById: ctx.userId, uploadedByName: pessoa.name, ...gravado },
      select: { id: true, fileName: true },
    });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tech_interno.item.attachment", entityType: "TechInternalItem", entityId: itemId, metadata: { title: item.title, arquivo: anexo.fileName, ...metadadosDoAtor(ctx) } });
    return { ok: true, valor: { id: anexo.id, nome: anexo.fileName } };
  } catch (err) {
    await armazenamentoTech.apagarAnexosGravados(gravados.anexos);
    throw err;
  }
}

export async function removerAnexo(ctx: AuthContext, id: string): Promise<Resultado<{ itemId: string }>> {
  if (!ctx.userId || !ctx.tenantId || !await podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")) {
    return { ok: false, erro: "Você não pode remover anexos.", status: 403 };
  }
  const db = getPrisma();
  const anexo = await db.techInternalAttachment.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { item: { select: { title: true } } } });
  if (!anexo) return { ok: false, erro: "Anexo não encontrado.", status: 404 };
  const r = await db.techInternalAttachment.deleteMany({ where: { id, tenantId: ctx.tenantId } });
  if (r.count !== 1) return { ok: false, erro: "Anexo não encontrado.", status: 404 };
  await armazenamentoTech.apagarArquivos([anexo.fileUrl]);
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tech_interno.item.attachment_remove", entityType: "TechInternalItem", entityId: anexo.itemId, metadata: { title: anexo.item.title, arquivo: anexo.fileName } });
  return { ok: true, valor: { itemId: anexo.itemId } };
}

/** O anexo para abrir ou baixar, só para quem vê o módulo. */
export async function anexoParaVer(ctx: AuthContext, id: string) {
  if (!ctx.userId || !ctx.tenantId || !await podeNoModulo(ctx, MODULO_TECH_INTERNO, "ver")) return null;
  return getPrisma().techInternalAttachment.findFirst({ where: { id, tenantId: ctx.tenantId } });
}
