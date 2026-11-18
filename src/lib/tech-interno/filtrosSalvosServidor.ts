import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { isPrismaMissingTableError, isPrismaUniqueError } from "@/lib/prismaErrors";
import { conferirAcesso, ErroTechInterno, type FalhaTech } from "./servidor";
import { filtroSalvoSchema, motivoParaNaoSalvar, type FiltroSalvo } from "./filtrosSalvos";

/**
 * Os filtros salvos da lista do Controle interno (18/11/2026,
 * funcionalidade-783): toda leitura e gravação vai pela pessoa da sessão
 * (`tenantId` + `userId`) — o filtro de outra pessoa não aparece nem se
 * exclui daqui. Quem vê a lista pode salvar os próprios filtros (nível "ver").
 *
 * Sem Auditoria, como a personalização do Início e as fontes da Agenda: é
 * gosto de cada pessoa, não configuração do escritório.
 */

const FALTA_A_MIGRATION = "Falta atualizar o banco para guardar filtros salvos (a migration “filtros_salvos_do_controle_interno”).";

function falha(e: unknown): FalhaTech {
  if (e instanceof ErroTechInterno) return { error: e.message, code: e.code };
  if (isPrismaUniqueError(e)) return { error: "Já existe um filtro salvo com esse nome.", code: "conflict" };
  if (isPrismaMissingTableError(e)) return { error: FALTA_A_MIGRATION, code: "internal_error" };
  console.error("[tech-interno] Falha no filtro salvo", typeof e === "object" && e && "code" in e ? (e as { code: unknown }).code : "indisponivel");
  return { error: "Não foi possível salvar agora. Tente de novo.", code: "internal_error" };
}

const doDono = (ctx: AuthContext) => ({ tenantId: ctx.tenantId!, userId: ctx.userId! });

async function lerDaPessoa(ctx: AuthContext): Promise<FiltroSalvo[]> {
  const linhas = await getPrisma().techInternalSavedFilter.findMany({
    where: doDono(ctx), select: { id: true, name: true, query: true }, orderBy: { name: "asc" },
  });
  return linhas.map(l => ({ id: l.id, nome: l.name, query: l.query }));
}

/**
 * Os filtros salvos de quem está vendo, em ordem de nome. Sem a tabela (deploy
 * antes da migration), a lista sai vazia e a tela continua de pé.
 */
export async function listarFiltrosSalvos(ctx: AuthContext): Promise<FiltroSalvo[]> {
  await conferirAcesso(ctx, "ver");
  try {
    return await lerDaPessoa(ctx);
  } catch (e) {
    if (isPrismaMissingTableError(e)) return [];
    throw e;
  }
}

/** Salva a combinação de filtros com um nome, dentro do limite por pessoa. */
export async function salvarFiltro(ctx: AuthContext, raw: { nome: unknown; query: unknown }): Promise<{ ok: true; id: string; nome: string } | FalhaTech> {
  try {
    await conferirAcesso(ctx, "ver");
    const parsed = filtroSalvoSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message, code: "validation_error" };
    const { nome, query } = parsed.data;
    const criado = await getPrisma().$transaction(async tx => {
      const existentes = (await tx.techInternalSavedFilter.findMany({ where: doDono(ctx), select: { id: true, name: true, query: true } }))
        .map(l => ({ id: l.id, nome: l.name, query: l.query }));
      const motivo = motivoParaNaoSalvar(existentes, { nome, query });
      if (motivo) throw new ErroTechInterno(motivo, "conflict");
      return tx.techInternalSavedFilter.create({ data: { ...doDono(ctx), name: nome, query }, select: { id: true } });
    });
    return { ok: true, id: criado.id, nome };
  } catch (e) {
    return falha(e);
  }
}

/** Exclui um filtro salvo da própria pessoa; o de outra pessoa não é achado. */
export async function excluirFiltroSalvo(ctx: AuthContext, id: unknown): Promise<{ ok: true } | FalhaTech> {
  try {
    await conferirAcesso(ctx, "ver");
    if (typeof id !== "string" || !id || id.length > 191) return { error: "Filtro salvo não encontrado.", code: "not_found" };
    const { count } = await getPrisma().techInternalSavedFilter.deleteMany({ where: { id, ...doDono(ctx) } });
    if (!count) return { error: "Filtro salvo não encontrado.", code: "not_found" };
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}
