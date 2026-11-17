import { getPrisma } from "@/lib/prisma";
import { gerarEstruturado } from "@/lib/ai";
import { logAudit } from "@/lib/audit";
import { caminhoDaCategoria, categoriasClassificaveis } from "./catalogo";
import { prepararCatalogo } from "./catalogo-servidor";
import { configDoHub } from "./hub";
import { motivoDaFalha } from "./falhaDaIa";
import {
  ORIGEM_HUB,
  PROMPT_DO_HISTORICO,
  TENTATIVAS_DA_IA,
  categoriaDoConnect,
  lerHistoricoDoHub,
  limparSegredos,
  resultadoDaLeituraSchema,
  situacaoDepoisDaLeitura,
  textoDoCaso,
  type RespostaDaEquipe,
} from "./historico";

// O histórico de chamados do Hub como casos (17/11/2026). As regras estão em
// ./historico.ts. Três passos:
// 1. `importarHistoricoDoHub`: busca os chamados na rota de histórico do Hub e
//    grava os novos como PROCESSANDO (rápido; o botão da tela chama);
// 2. `processarCasos`: a IA lê cada caso e sugere a categoria (fora da
//    resposta, com `after()`, e a cada 15 minutos pelo motor de alertas, para
//    o que sobrar);
// 3. `revisarCaso`: alguém da equipe escolhe a categoria do caso que ficou A
//    revisar, ou descarta.

const ESPERA_DO_HUB_MS = 30_000;
/** Quantos casos a IA lê por vez e quantos ao mesmo tempo. */
const POR_RODADA = 40;
const AO_MESMO_TEMPO = 3;

const log = (texto: string) => `[chamados] histórico do Hub: ${texto}`;

/** As categorias do Connect que a IA pode sugerir: as folhas ativas, com o caminho. */
async function opcoesDeCategoria(tenantId: string) {
  await prepararCatalogo(tenantId);
  const linhas = await getPrisma().helpdeskCategory.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true, active: true } });
  return categoriasClassificaveis(linhas).map((c) => ({ id: c.id, nome: c.name, caminho: caminhoDaCategoria(linhas, c.id) }));
}

export type ResultadoDaImportacao = { novos: number; jaExistiam: number };

export async function importarHistoricoDoHub(tenantId: string, userId: string): Promise<ResultadoDaImportacao> {
  const config = configDoHub(process.env);
  if (!config) throw new Error("A ligação com o Hub não está configurada neste ambiente.");
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (tenant?.slug !== config.escritorio) throw new Error("Este escritório não está ligado ao Hub.");

  let corpo: unknown;
  try {
    const r = await fetch(`${config.url}/api/integrations/connect41/historico`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(ESPERA_DO_HUB_MS),
    });
    corpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`O Hub respondeu ${r.status}.`);
  } catch (err) {
    throw new Error(`Não foi possível buscar o histórico no Hub: ${motivoDaFalha(err)}`);
  }
  const chamados = lerHistoricoDoHub(corpo);

  const db = getPrisma();
  const existentes = new Set(
    (await db.helpdeskHistoricCase.findMany({ where: { tenantId, source: ORIGEM_HUB }, select: { externalId: true } })).map((c) => c.externalId)
  );
  const opcoes = await opcoesDeCategoria(tenantId);
  const novos = chamados.filter((c) => !existentes.has(c.id));
  if (novos.length > 0) {
    await db.helpdeskHistoricCase.createMany({
      data: novos.map((c) => ({
        tenantId,
        source: ORIGEM_HUB,
        externalId: c.id,
        title: limparSegredos(c.titulo).slice(0, 255),
        description: limparSegredos(c.descricao),
        teamReplies: c.respostasDaEquipe.map((r) => ({ ...r, texto: limparSegredos(r.texto) })),
        originalCategory: c.categoria.slice(0, 255),
        originalCategoryId: categoriaDoConnect(c.categoria, opcoes),
        requesterSector: c.setorQuePediu?.slice(0, 120) ?? null,
        priority: c.prioridade,
        sourceStatus: c.situacao,
        openedAt: new Date(c.abertoEm),
        closedAt: c.fechadoEm && !Number.isNaN(Date.parse(c.fechadoEm)) ? new Date(c.fechadoEm) : null,
        tags: [],
      })),
      skipDuplicates: true,
    });
  }
  await logAudit({
    tenantId,
    userId,
    action: "helpdesk.historico.import",
    entityType: "HelpdeskHistoricCase",
    metadata: { origem: ORIGEM_HUB, novos: novos.length, jaExistiam: chamados.length - novos.length },
  });
  return { novos: novos.length, jaExistiam: chamados.length - novos.length };
}

/** A IA lê os casos que estão PROCESSANDO, até `limite`. Devolve quantos leu. */
export async function processarCasos(tenantId: string, limite = POR_RODADA): Promise<number> {
  const db = getPrisma();
  const casos = await db.helpdeskHistoricCase.findMany({
    where: { tenantId, status: "PROCESSANDO", attempts: { lt: TENTATIVAS_DA_IA } },
    orderBy: { openedAt: "asc" },
    take: limite,
  });
  if (casos.length === 0) return 0;
  const opcoes = await opcoesDeCategoria(tenantId);
  const ids = opcoes.map((o) => o.id);
  let lidos = 0;

  for (let i = 0; i < casos.length; i += AO_MESMO_TEMPO) {
    await Promise.all(
      casos.slice(i, i + AO_MESMO_TEMPO).map(async (caso) => {
        try {
          const texto = JSON.stringify({
            chamado: JSON.parse(textoDoCaso({ ...caso, teamReplies: caso.teamReplies as RespostaDaEquipe[] })),
            categorias: opcoes.map((o) => ({ categoryId: o.id, caminho: o.caminho })),
          });
          const { valor } = await gerarEstruturado({
            tenantId,
            agentCode: "triagem_chamados",
            sistema: PROMPT_DO_HISTORICO,
            texto,
            nome: "caso_do_historico",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                resumo: { type: "string" },
                solucao: { anyOf: [{ type: "string" }, { type: "null" }] },
                categoryId: { anyOf: [{ type: "string", enum: ids }, { type: "null" }] },
                tags: { type: "array", items: { type: "string" } },
                aproveitavel: { type: "boolean" },
              },
              required: ["resumo", "solucao", "categoryId", "tags", "aproveitavel"],
            },
            maxTokens: 1200,
            estrito: true,
            timeoutMs: 30_000,
            esforco: "low",
            store: false,
            contexto: { trigger: "SISTEMA", entityType: "HelpdeskHistoricCase", entityId: caso.id },
          });
          const r = resultadoDaLeituraSchema.parse(valor);
          const sugerida = r.categoryId && ids.includes(r.categoryId) ? r.categoryId : null;
          const { situacao, finalId } = situacaoDepoisDaLeitura({ ...r, categoryId: sugerida }, caso.originalCategoryId);
          await db.helpdeskHistoricCase.update({
            where: { id: caso.id },
            data: {
              summary: limparSegredos(r.resumo) || null,
              solution: r.solucao ? limparSegredos(r.solucao) : null,
              suggestedCategoryId: sugerida,
              finalCategoryId: finalId,
              tags: [...new Set(r.tags.map((t) => t.trim().toLocaleLowerCase("pt-BR")).filter((t) => t && t.length <= 60))].slice(0, 5),
              status: situacao,
              attempts: { increment: 1 },
              lastError: null,
            },
          });
          lidos++;
        } catch (err) {
          const motivo = motivoDaFalha(err).slice(0, 300);
          console.error(log(`a IA não leu o caso ${caso.id}: ${motivo}`));
          // Na última tentativa, o caso vai para a revisão sem sugestão.
          const ultima = caso.attempts + 1 >= TENTATIVAS_DA_IA;
          await db.helpdeskHistoricCase
            .update({ where: { id: caso.id }, data: { attempts: { increment: 1 }, lastError: motivo, ...(ultima ? { status: "A_REVISAR" } : {}) } })
            .catch(() => {});
        }
      })
    );
  }
  return lidos;
}

/** Depois da importação: a IA lê todos os novos, em rodadas, até acabar ou passar do tempo. */
export async function processarTudo(tenantId: string, limiteMs = 10 * 60_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const pendentes = await getPrisma().helpdeskHistoricCase.count({ where: { tenantId, status: "PROCESSANDO", attempts: { lt: TENTATIVAS_DA_IA } } });
    if (pendentes === 0) return;
    await processarCasos(tenantId);
  }
}

export type DecisaoDaRevisao = { categoryId: string } | { descartar: true };

/** A revisão de um caso: a categoria escolhida pela equipe, ou descartado. */
export async function revisarCaso(tenantId: string, userId: string, casoId: string, decisao: DecisaoDaRevisao): Promise<void> {
  const db = getPrisma();
  const caso = await db.helpdeskHistoricCase.findFirst({ where: { tenantId, id: casoId }, select: { id: true, status: true } });
  if (!caso) throw new Error("Caso não encontrado.");
  if (caso.status === "PROCESSANDO") throw new Error("A IA ainda está lendo este caso.");
  let dados: { status: "CONFIRMADO" | "DESCARTADO"; finalCategoryId: string | null };
  if ("descartar" in decisao) dados = { status: "DESCARTADO", finalCategoryId: null };
  else {
    const valida = (await opcoesDeCategoria(tenantId)).some((o) => o.id === decisao.categoryId);
    if (!valida) throw new Error("Categoria inválida.");
    dados = { status: "CONFIRMADO", finalCategoryId: decisao.categoryId };
  }
  await db.helpdeskHistoricCase.update({ where: { id: caso.id }, data: { ...dados, reviewedById: userId, reviewedAt: new Date() } });
  await logAudit({ tenantId, userId, action: "helpdesk.historico.review", entityType: "HelpdeskHistoricCase", entityId: caso.id, metadata: dados });
}
