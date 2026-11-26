import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { setoresDoModulo } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { MODULO_DA_TABELA_DINAMICA, lerConfiguracao } from "./tabelaDinamica";
import {
  lerParametrosDoModelo,
  motivoParaNaoSalvar,
  nomeDoModeloSchema,
  novoModeloSchema,
  parametrosDoModelo,
  podeExcluirModelo,
  podeRenomearModelo,
  type ModeloDaTabela,
  type ModelosDaTela,
  type PeriodoDoModelo,
  type QuemVe,
} from "./modelosDaTabela";

/**
 * Os modelos da Tabela dinâmica do BPO (25/11/2026, funcionalidade-816). Tudo
 * pela pessoa da sessão: o modelo pessoal de outra pessoa não aparece nem se
 * renomeia ou exclui daqui — para ela, ele não existe.
 *
 * - Ver a tela basta para salvar um modelo pessoal; para "Todo o setor", é
 *   preciso agir no setor (o somente leitura não grava para os outros).
 * - Renomear: quem criou. Excluir: quem criou e, no do setor, a coordenação do
 *   setor (`podeNoModulo` "gerir").
 *
 * Com Auditoria ao salvar, renomear e excluir: o modelo do setor é
 * configuração de todos, e a trilha diz quem mexeu.
 */

const FALTA_A_MIGRATION = "Falta atualizar o banco para guardar modelos (a migration “bpo_modelos_da_tabela”).";
const NAO_ENCONTRADO = "Modelo não encontrado.";

type Falha = { error: string };

function falha(e: unknown): Falha {
  if (isPrismaMissingTableError(e)) return { error: FALTA_A_MIGRATION };
  console.error("[tabela-dinamica] Falha no modelo", typeof e === "object" && e && "code" in e ? (e as { code: unknown }).code : "indisponivel");
  return { error: "Não foi possível salvar agora. Tente de novo." };
}

/** Recusa no meio da transação, com a mensagem para a pessoa. */
class Recusa extends Error {}

/** O setor da tela (o dono do módulo), se a pessoa alcança o módulo no nível pedido. */
async function setorDaTela(ctx: AuthContext, nivel: NivelNoModulo): Promise<string | null> {
  if (!ctx.tenantId || !ctx.userId) return null;
  const setores = await setoresDoModulo(ctx.tenantId, MODULO_DA_TABELA_DINAMICA);
  if (!setores?.length || !(await podeNoModulo(ctx, MODULO_DA_TABELA_DINAMICA, nivel))) return null;
  return setores[0]!;
}

/** Os do grupo do modelo: os pessoais de quem criou, ou os do setor. */
const doGrupo = (tenantId: string, quemVe: QuemVe, userId: string) =>
  quemVe === "setor" ? { tenantId, setor: { not: null } } : { tenantId, setor: null, criadoPorId: userId };

const SELECAO = {
  id: true,
  nome: true,
  setor: true,
  periodo: true,
  comFiltros: true,
  parametros: true,
  criadoPorId: true,
  criadoPor: { select: { name: true } },
} as const;

/**
 * Os modelos que a tela mostra: os pessoais de quem está vendo e os do setor,
 * em ordem de nome. Sem a tabela (deploy antes da migration), as listas saem
 * vazias e a tela continua de pé.
 */
export async function modelosDaTela(ctx: AuthContext): Promise<ModelosDaTela> {
  const tenantId = ctx.tenantId!;
  const userId = ctx.userId;
  const setores = (await setoresDoModulo(tenantId, MODULO_DA_TABELA_DINAMICA)) ?? [];
  const codigo = setores[0] ?? "bpo";
  const [maps, podeCompartilhar, gereOSetor] = await Promise.all([
    getSectorMaps(tenantId),
    podeNoModulo(ctx, MODULO_DA_TABELA_DINAMICA, "agir"),
    podeNoModulo(ctx, MODULO_DA_TABELA_DINAMICA, "gerir"),
  ]);
  const setor = { codigo, rotulo: sectorLabel(maps.labels, codigo) };
  // Sem a pessoa, o filtro dos pessoais ficaria sem `criadoPorId` — e o Prisma
  // ignora o `undefined`, o que mostraria os modelos pessoais de todo mundo.
  if (!userId) return { meus: [], doSetor: [], setor, podeCompartilhar: false };

  let linhas;
  try {
    linhas = await getPrisma().bpoModeloDaTabela.findMany({
      where: { tenantId, OR: [{ setor: null, criadoPorId: userId }, { setor: { not: null } }] },
      select: SELECAO,
    });
  } catch (e) {
    if (isPrismaMissingTableError(e)) return { meus: [], doSetor: [], setor, podeCompartilhar };
    throw e;
  }

  const modelos: ModeloDaTabela[] = linhas
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      setor: l.setor,
      periodo: (l.periodo === "fixo" ? "fixo" : "relativo") as PeriodoDoModelo,
      comFiltros: l.comFiltros,
      parametros: lerParametrosDoModelo(l.parametros),
      criadoPorNome: l.criadoPor?.name ?? null,
      podeRenomear: podeRenomearModelo(userId, l),
      podeExcluir: podeExcluirModelo({ userId, gereOSetor }, l),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    meus: modelos.filter((m) => m.setor === null),
    doSetor: modelos.filter((m) => m.setor !== null),
    setor,
    podeCompartilhar,
  };
}

/** Salva a tabela da tela como modelo. A configuração é relida do endereço, como a tela faz. */
export async function salvarModeloDaTabela(ctx: AuthContext, raw: unknown): Promise<{ ok: true; id: string; nome: string } | Falha> {
  try {
    const parsed = novoModeloSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]!.message };
    const { nome, quemVe, periodo, comFiltros, query } = parsed.data;

    const setor = await setorDaTela(ctx, quemVe === "setor" ? "agir" : "ver");
    if (!setor) {
      return { error: quemVe === "setor" ? "Só quem trabalha no setor pode salvar um modelo para todo o setor." : "Você não tem acesso à Tabela dinâmica." };
    }
    const tenantId = ctx.tenantId!;
    const userId = ctx.userId!;

    const hoje = saoPauloParts(new Date()).dateKey;
    const config = lerConfiguracao(Object.fromEntries(new URLSearchParams(query)), hoje);
    const parametros = parametrosDoModelo(config, { periodo, comFiltros });

    const criado = await getPrisma().$transaction(async (tx) => {
      const existentes = await tx.bpoModeloDaTabela.findMany({ where: doGrupo(tenantId, quemVe, userId), select: { id: true, nome: true } });
      const motivo = motivoParaNaoSalvar(existentes, nome, quemVe);
      if (motivo) throw new Recusa(motivo);
      return tx.bpoModeloDaTabela.create({
        data: { tenantId, criadoPorId: userId, setor: quemVe === "setor" ? setor : null, nome, parametros, periodo, comFiltros },
        select: { id: true },
      });
    });

    await logAudit({
      tenantId,
      userId,
      action: "financeiro.tabela_dinamica.modelo_salvo",
      entityType: "BpoModeloDaTabela",
      entityId: criado.id,
      metadata: { nome, quemVe: quemVe === "setor" ? "setor" : "só quem criou", periodo, comFiltros },
    });
    return { ok: true, id: criado.id, nome };
  } catch (e) {
    if (e instanceof Recusa) return { error: e.message };
    return falha(e);
  }
}

/** O modelo, se a pessoa o enxerga: o pessoal só de quem criou; o do setor, de quem vê a tela. */
async function modeloVisivel(tenantId: string, userId: string, id: unknown) {
  if (typeof id !== "string" || !id || id.length > 191) return null;
  const m = await getPrisma().bpoModeloDaTabela.findFirst({
    where: { id, tenantId },
    select: { id: true, nome: true, setor: true, criadoPorId: true },
  });
  if (!m || (m.setor === null && m.criadoPorId !== userId)) return null;
  return m;
}

/** Renomeia um modelo — só quem criou. */
export async function renomearModeloDaTabela(ctx: AuthContext, id: unknown, novoNome: unknown): Promise<{ ok: true; nome: string } | Falha> {
  try {
    if (!(await setorDaTela(ctx, "ver"))) return { error: NAO_ENCONTRADO };
    const tenantId = ctx.tenantId!;
    const userId = ctx.userId!;
    const parsed = nomeDoModeloSchema.safeParse(novoNome);
    if (!parsed.success) return { error: parsed.error.issues[0]!.message };
    const nome = parsed.data;

    const m = await modeloVisivel(tenantId, userId, id);
    if (!m) return { error: NAO_ENCONTRADO };
    if (!podeRenomearModelo(userId, m)) return { error: "Só quem criou o modelo pode renomeá-lo." };
    if (m.nome === nome) return { ok: true, nome };

    const quemVe: QuemVe = m.setor === null ? "eu" : "setor";
    await getPrisma().$transaction(async (tx) => {
      const existentes = await tx.bpoModeloDaTabela.findMany({ where: doGrupo(tenantId, quemVe, userId), select: { id: true, nome: true } });
      const motivo = motivoParaNaoSalvar(existentes, nome, quemVe, m.id);
      if (motivo) throw new Recusa(motivo);
      await tx.bpoModeloDaTabela.update({ where: { id: m.id }, data: { nome } });
    });

    await logAudit({
      tenantId,
      userId,
      action: "financeiro.tabela_dinamica.modelo_renomeado",
      entityType: "BpoModeloDaTabela",
      entityId: m.id,
      metadata: { nome, anterior: m.nome },
    });
    return { ok: true, nome };
  } catch (e) {
    if (e instanceof Recusa) return { error: e.message };
    return falha(e);
  }
}

/** Exclui um modelo: quem criou, ou — no do setor — a coordenação do setor. */
export async function excluirModeloDaTabela(ctx: AuthContext, id: unknown): Promise<{ ok: true } | Falha> {
  try {
    if (!(await setorDaTela(ctx, "ver"))) return { error: NAO_ENCONTRADO };
    const tenantId = ctx.tenantId!;
    const userId = ctx.userId!;
    const m = await modeloVisivel(tenantId, userId, id);
    if (!m) return { error: NAO_ENCONTRADO };
    const gereOSetor = m.setor !== null && (await podeNoModulo(ctx, MODULO_DA_TABELA_DINAMICA, "gerir"));
    if (!podeExcluirModelo({ userId, gereOSetor }, m)) return { error: "Só quem criou o modelo ou a coordenação do setor pode excluí-lo." };

    const { count } = await getPrisma().bpoModeloDaTabela.deleteMany({ where: { id: m.id, tenantId } });
    if (!count) return { error: NAO_ENCONTRADO };

    await logAudit({
      tenantId,
      userId,
      action: "financeiro.tabela_dinamica.modelo_excluido",
      entityType: "BpoModeloDaTabela",
      entityId: m.id,
      metadata: { nome: m.nome, quemVe: m.setor === null ? "só quem criou" : "setor" },
    });
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}
