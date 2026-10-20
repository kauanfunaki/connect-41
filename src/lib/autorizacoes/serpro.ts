// Conferir as autorizações de acesso pelo Serpro (consulta de procurações).
//
// Um cliente por vez, pela tela; ou a carteira inteira, em lotes pelo
// agendador dos alertas — 340 consultas não cabem numa requisição da tela, e o
// lote parado no meio continua de onde estava. Cada consulta é cobrada como
// Consulta (R$ 0,24 na primeira faixa), por isso o lote conta o custo antes.
//
// O lote ficou mais robusto em 20/10/2026 (Fase 0 do Integra Contador):
// - o 429 (cota) e o 504 (tempo esgotado) pausam o ciclo sem contar o cliente
//   como conferido — antes o 429 contava como feito, e o lote podia fechar
//   como "terminou" sem reconferir ninguém; o 504 encerrava o lote inteiro;
// - uma trava no cursor impede dois ciclos ao mesmo tempo: o agendador roda a
//   cada 10 minutos e um ciclo de 40 consultas pode passar disso, e os dois
//   pagariam pelo mesmo cliente;
// - na demonstração não roda: o trial só responde aos exemplos fictícios.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifySector, notifyUser } from "@/lib/notifications";
import { executar } from "@/lib/integracoes/data";
import { hojeIso } from "@/lib/datas/calendario";
import { chamarSerpro, configuracaoDoSerpro, contagemDoMes, prontidaoDoSerpro, type ResultadoDaChamada } from "@/lib/serpro/cliente";
import type { Transporte } from "@/lib/serpro/transporte";
import { custoDoMes, pedidoDeProcuracao, resultadoDaConferencia, type ResultadoDaConferencia } from "@/lib/serpro/regras";
import { carteiraDasAutorizacoes, representantesDasChaves, setorDasAutorizacoes } from "./servidor";

const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const SERVICO = "OBTERPROCURACAO41";

export const NA_DEMONSTRACAO =
  "A conexão do Serpro está em demonstração, que só responde aos exemplos fictícios da documentação: a conferência dos clientes não é enviada.";

/** Grava o que o Serpro disse. "Não se aplica" fica como o setor marcou: só a data da conferência muda. */
async function aplicar(tenantId: string, chave: string, resultado: ResultadoDaConferencia, userId: string | null, hoje: string) {
  if (resultado.tipo === "erro") return;
  const prisma = getPrisma();
  const atual = await prisma.accessAuthorization.findUnique({
    where: { tenantId_documento: { tenantId, documento: chave } },
    select: { id: true, status: true, validatedAt: true },
  });
  const conferida = { checkedVia: "SERPRO", checkedAt: new Date() };
  let para: string | null = null;

  if (atual?.status === "NOT_APPLICABLE") {
    await prisma.accessAuthorization.update({ where: { id: atual.id }, data: conferida });
  } else if (resultado.tipo === "ativa") {
    para = "ACTIVE";
    const dados = {
      status: "ACTIVE" as const,
      expiresAt: paraData(resultado.expiraEm),
      validatedAt: atual?.validatedAt ?? paraData(hoje),
      ...conferida,
      ...(userId ? { updatedByUserId: userId } : {}),
    };
    await prisma.accessAuthorization.upsert({
      where: { tenantId_documento: { tenantId, documento: chave } },
      create: { tenantId, documento: chave, ...dados },
      update: dados,
    });
  } else if (atual) {
    // Sem procuração ativa no Serpro: a validada caiu (cancelada ou vencida).
    // Pedida ou à espera de validação continua como está — ainda não valia.
    if (atual.status === "ACTIVE") para = "CANCELLED";
    await prisma.accessAuthorization.update({ where: { id: atual.id }, data: { ...conferida, ...(para ? { status: "CANCELLED" as const } : {}) } });
  }

  // A auditoria pede uma pessoa: no lote, é quem pediu a conferência.
  if (userId && (atual || para)) {
    await logAudit({
      tenantId,
      userId,
      action: "autorizacoes.serpro",
      entityType: "AccessAuthorization",
      entityId: atual?.id ?? chave,
      metadata: { documento: chave, de: atual?.status ?? null, para: para ?? atual?.status ?? null, resultado },
    });
  }
}

/**
 * O que um erro faz com o lote (20/10/2026):
 * - "seguir": o erro é deste cliente (400, um 404 que não é "sem procuração"):
 *   conta como conferido, com erro, e o lote segue;
 * - "pausar": passa sozinho (429 da cota, 504 do tempo esgotado, chamada sem
 *   resposta): o ciclo para aqui sem contar o cliente, e o próximo continua;
 * - "parar": não melhora no próximo cliente (ligação, teto, credencial, 403,
 *   5xx): o lote acaba e quem pediu é avisado.
 */
export type EfeitoNoLote = "seguir" | "pausar" | "parar";

export function efeitoDoErro(r: Extract<ResultadoDaChamada, { ok: false }>): EfeitoNoLote {
  if (r.motivo === "rede") return "pausar";
  if (r.motivo !== "falha") return "parar";
  if (r.status === 429 || r.status === 504) return "pausar";
  // 403 aqui é da ligação (procurador ≠ autor, certificado de outro CNPJ),
  // 401 é credencial, 5xx é o Serpro fora: nenhum deles melhora no próximo cliente.
  if (r.status === 401 || r.status === 403 || (r.status !== null && r.status >= 500)) return "parar";
  return "seguir";
}

export type ConferenciaDeUm = { ok: true; resultado: Exclude<ResultadoDaConferencia, { tipo: "erro" }> } | { ok: false; erro: string; efeito: EfeitoNoLote };

/** Confere um cliente. */
export async function conferirNoSerpro(
  tenantId: string,
  chave: string,
  opcoes: { userId?: string | null; origem: string; transporte?: Transporte },
  hoje = hojeIso()
): Promise<ConferenciaDeUm> {
  const rep = (await representantesDasChaves(tenantId)).get(chave);
  if (!rep?.documento) return { ok: false, erro: "Empresa não encontrada.", efeito: "seguir" };
  const escritorio = await getPrisma().accessAuthorizationGrantee.findUnique({ where: { tenantId }, select: { cnpj: true } });
  if (!escritorio) return { ok: false, erro: "Falta definir quem recebe as autorizações.", efeito: "parar" };

  const r = await chamarSerpro(tenantId, pedidoDeProcuracao(rep.documento, escritorio.cnpj), {
    userId: opcoes.userId ?? null,
    origem: opcoes.origem,
    transporte: opcoes.transporte,
  });
  if (!r.ok && !r.resposta) return { ok: false, erro: r.erro, efeito: efeitoDoErro(r) };
  // O 404 "sem procuração" chega como falha, mas é a resposta: quem decide é a leitura.
  const resultado = resultadoDaConferencia(r.resposta!, hoje);
  if (resultado.tipo === "erro") return { ok: false, erro: resultado.texto, efeito: r.ok ? "seguir" : efeitoDoErro(r) };
  await aplicar(tenantId, chave, resultado, opcoes.userId ?? null, hoje);
  return { ok: true, resultado };
}

// ─── A carteira inteira, em lotes ────────────────────────────────────────────

type PedidoDoLote = {
  pedidaEm: string;
  pedidaPor: string | null;
  total: number;
  ativas: number;
  sem: number;
  erros: number;
  /** O ciclo que está rodando agora: é a trava contra o ciclo seguinte. */
  rodandoDesde?: string | null;
  /** Ciclos seguidos parados por 429 ou 504, sem conferir ninguém. */
  pausas?: number;
};

/** Trava mais velha que isso é de um ciclo que morreu no meio (o servidor reiniciou): vale tomar. */
const TRAVA_VENCIDA_MS = 30 * 60_000;
/** O ciclo não começa cliente novo depois disso: termina antes de a trava vencer. */
const DURACAO_DO_CICLO_MS = 20 * 60_000;
/** Pausas seguidas até o lote desistir e avisar: a cada 10 minutos, uma hora. */
const PAUSAS_ATE_PARAR = 6;

function lerPedido(cursor: string | null): PedidoDoLote | null {
  if (!cursor) return null;
  try {
    const o = JSON.parse(cursor) as { conferencia?: PedidoDoLote };
    return o.conferencia ?? null;
  } catch {
    return null;
  }
}

const textoDoPedido = (pedido: PedidoDoLote | null) => (pedido ? JSON.stringify({ conferencia: pedido }) : null);

async function gravarPedido(integrationId: string, pedido: PedidoDoLote | null) {
  await getPrisma().tenantIntegration.update({ where: { id: integrationId }, data: { cursor: textoDoPedido(pedido) } });
}

/**
 * Grava só se o cursor ainda é o que este ciclo leu — troca e confere numa
 * instrução só, no banco. É a trava: de dois ciclos que leram o mesmo cursor,
 * só um consegue gravar. (GET_LOCK do MySQL vale por conexão, e o Prisma
 * devolve a conexão ao pool entre uma consulta e outra.)
 */
async function trocarPedido(integrationId: string, lido: string, novo: PedidoDoLote | null): Promise<string | null | false> {
  const texto = textoDoPedido(novo);
  const { count } = await getPrisma().tenantIntegration.updateMany({ where: { id: integrationId, cursor: lido }, data: { cursor: texto } });
  return count === 1 ? texto : false;
}

/** As chaves que entram na conferência: a carteira, menos o que o setor marcou como "não se aplica". */
async function chavesDaConferencia(tenantId: string): Promise<string[]> {
  const { linhas } = await carteiraDasAutorizacoes(tenantId);
  return linhas.filter((l) => l.situacao !== "nao_se_aplica").map((l) => l.chave);
}

export type EstimativaDoLote = { clientes: number; custoCentavos: number; mesDepoisCentavos: number; tetoCentavos: number };

/** Quanto custa conferir a carteira inteira agora, contando o que o mês já gastou. */
export async function estimativaDaConferencia(tenantId: string): Promise<EstimativaDoLote | null> {
  const cfg = await configuracaoDoSerpro(tenantId);
  if (!prontidaoDoSerpro(cfg).pronta || cfg!.ambiente === "demonstracao") return null;
  const [clientes, contagem] = await Promise.all([chavesDaConferencia(tenantId), contagemDoMes(tenantId)]);
  const antes = custoDoMes(contagem).totalCentavos;
  const depois = custoDoMes({ ...contagem, CONSULTA: contagem.CONSULTA + clientes.length }).totalCentavos;
  return { clientes: clientes.length, custoCentavos: depois - antes, mesDepoisCentavos: depois, tetoCentavos: cfg!.tetoCentavos! };
}

export async function pedirConferenciaGeral(tenantId: string, userId: string): Promise<{ ok: true; clientes: number } | { ok: false; erro: string }> {
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  if (cfg!.ambiente === "demonstracao") return { ok: false, erro: NA_DEMONSTRACAO };
  const conexao = await getPrisma().tenantIntegration.findUnique({ where: { id: cfg!.integrationId }, select: { cursor: true } });
  if (lerPedido(conexao?.cursor ?? null)) return { ok: false, erro: "Já há uma conferência em andamento." };
  const total = (await chavesDaConferencia(tenantId)).length;
  await gravarPedido(cfg!.integrationId, { pedidaEm: new Date().toISOString(), pedidaPor: userId, total, ativas: 0, sem: 0, erros: 0 });
  await logAudit({ tenantId, userId, action: "autorizacoes.serpro_lote", entityType: "TenantIntegration", entityId: cfg!.integrationId, metadata: { total } });
  return { ok: true, clientes: total };
}

/** A conferência em andamento, para a tela mostrar o progresso. null = nenhuma. */
export async function conferenciaEmAndamento(tenantId: string): Promise<{ total: number; feitas: number; pedidaEm: string } | null> {
  const cfg = await configuracaoDoSerpro(tenantId);
  if (!cfg) return null;
  const conexao = await getPrisma().tenantIntegration.findUnique({ where: { id: cfg.integrationId }, select: { cursor: true } });
  const pedido = lerPedido(conexao?.cursor ?? null);
  if (!pedido) return null;
  return { total: pedido.total, feitas: pedido.ativas + pedido.sem + pedido.erros, pedidaEm: pedido.pedidaEm };
}

/** Respostas que encerram o cliente no lote — as outras (rede, 429, 5xx) voltam no próximo ciclo. */
const RESPOSTAS_FINAIS = [200, 400, 403, 404];

/**
 * Um ciclo do lote (a cada 10 minutos, no agendador dos alertas): confere até
 * `lote` clientes que ainda não foram conferidos desde o pedido. No fim, ou se
 * a ligação parar (teto, credencial, Serpro fora), avisa quem pediu.
 */
export async function processarConferencias(
  tenantId: string,
  opcoes: { lote?: number; transporte?: Transporte; agora?: () => number } = {}
): Promise<number> {
  const agora = opcoes.agora ?? Date.now;
  const cfg = await configuracaoDoSerpro(tenantId);
  if (!cfg) return 0;
  const prisma = getPrisma();
  const conexao = await prisma.tenantIntegration.findUnique({ where: { id: cfg.integrationId }, select: { cursor: true } });
  const lido = conexao?.cursor ?? null;
  const pedido = lerPedido(lido);
  if (!pedido) return 0;
  // Outro ciclo está rodando, e a trava dele ainda vale.
  if (pedido.rodandoDesde && agora() - Date.parse(pedido.rodandoDesde) < TRAVA_VENCIDA_MS) return 0;
  const travado = await trocarPedido(cfg.integrationId, lido!, { ...pedido, rodandoDesde: new Date(agora()).toISOString() });
  if (travado === false || travado === null) return 0;

  const avisar = async (mensagem: string) => {
    const aviso = { tenantId, type: "SERPRO_CONFERENCIA", message: mensagem.slice(0, 255) };
    if (pedido.pedidaPor) await notifyUser(pedido.pedidaPor, aviso);
    else await notifySector(await setorDasAutorizacoes(tenantId), aviso);
  };
  const resumo = (p: PedidoDoLote) =>
    `${p.ativas} com autorização ativa, ${p.sem} sem autorização${p.erros ? `, ${p.erros} com erro` : ""}`;

  // A demonstração não confere cliente de verdade: o lote pedido antes da troca de ambiente acaba aqui.
  if (cfg.ambiente === "demonstracao") {
    if ((await trocarPedido(cfg.integrationId, travado, null)) !== false) await avisar(`Conferência das autorizações no Serpro parou: ${NA_DEMONSTRACAO}`);
    return 0;
  }

  const hoje = hojeIso();
  const [chaves, reps, feitas] = await Promise.all([
    chavesDaConferencia(tenantId),
    representantesDasChaves(tenantId),
    prisma.serproCall.findMany({
      where: { tenantId, idServico: SERVICO, ambiente: "PRODUCAO", createdAt: { gte: new Date(pedido.pedidaEm) }, httpStatus: { in: RESPOSTAS_FINAIS } },
      select: { contribuinte: true },
      distinct: ["contribuinte"],
    }),
  ]);
  const conferidos = new Set(feitas.map((f) => f.contribuinte));
  const pendentes = chaves.filter((c) => {
    const doc = reps.get(c)?.documento;
    return doc && !conferidos.has(doc.replace(/\D/g, ""));
  });

  const fimDoCiclo = agora() + DURACAO_DO_CICLO_MS;
  let feitasNoCiclo = 0;
  let pausa: string | null = null;
  let parada: string | null = null;
  try {
    // Parada vira erro da execução: a saúde da integração mostra o motivo.
    await executar({ tenantId, integrationId: cfg.integrationId, trigger: "CRON" }, async () => {
      for (const chave of pendentes.slice(0, opcoes.lote ?? 40)) {
        if (agora() > fimDoCiclo) break;
        const r = await conferirNoSerpro(tenantId, chave, { userId: pedido.pedidaPor, origem: "autorizacoes:lote", transporte: opcoes.transporte }, hoje);
        if (r.ok) {
          if (r.resultado.tipo === "ativa") pedido.ativas++;
          else pedido.sem++;
          feitasNoCiclo++;
        } else if (r.efeito === "parar") {
          throw new Error(r.erro);
        } else if (r.efeito === "pausar") {
          pausa = r.erro;
          break;
        } else {
          pedido.erros++;
          feitasNoCiclo++;
        }
      }
      return { resultado: null, counters: { conferidas: feitasNoCiclo, ...(pausa ? { pausas: 1 } : {}) } };
    });
  } catch (e) {
    parada = e instanceof Error ? e.message : "falha desconhecida";
  }

  // Só conta para desistir a pausa de um ciclo que não conferiu ninguém.
  const pausas = pausa && feitasNoCiclo === 0 ? (pedido.pausas ?? 0) + 1 : 0;
  if (pausa && pausas >= PAUSAS_ATE_PARAR) parada = `o Serpro respondeu “${pausa}” em ${pausas} ciclos seguidos.`;

  const terminou = !parada && !pausa && pendentes.length <= feitasNoCiclo;
  // A troca confere que ninguém mexeu no cursor durante o ciclo; se mexeu, o que está lá vale.
  const gravado = await trocarPedido(cfg.integrationId, travado, parada || terminou ? null : { ...pedido, rodandoDesde: null, pausas });
  if (gravado === false) return feitasNoCiclo;
  if (parada) await avisar(`Conferência das autorizações no Serpro parou: ${parada} Até aqui: ${resumo(pedido)}.`);
  else if (terminou) await avisar(`Conferência das autorizações no Serpro terminou: ${resumo(pedido)}.`);
  return feitasNoCiclo;
}
