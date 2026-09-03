// Avaliação de Atendimentos — nota de 0-100 (Escrita 0-50 + SLA 0-50) gerada
// quando uma ChatwootConversation é resolvida (resolvedAt setado em
// sync.ts). CSAT foi cogitado e descartado nesta v1 (ver
// Backlog-Avaliacao-Atendimentos-2026-07-24.md no vault Obsidian). Sem
// fila/worker — mesmo espírito de src/lib/chatwoot/sync.ts, chamado por um
// cron externo (ver src/app/api/cron/evaluate-conversations/route.ts).
import { getPrisma } from "@/lib/prisma";
import { ensureMessagesLoaded } from "./conversations";
import { evaluateConversationWriting } from "@/lib/ai";
import { segmentarAtendimento, janelaDeSla, type MensagemSegmentavel } from "./segments";

const MAX_CANDIDATES_SCANNED = 200; // teto de conversas resolvidas revisitadas por chamada, pra filtrar as pendentes sem SQL de coluna-a-coluna
const MAX_EVALUATIONS_PER_CALL = 15; // teto de chamadas de IA por chamada HTTP, evita timeout

// Limiares em minutos — ajustáveis depois de ver casos reais (não vieram de
// combinação explícita com o usuário, só um ponto de partida razoável dado o
// horário comercial 08-18h/08-17h da 41 Tech).
const FIRST_RESPONSE_THRESHOLDS: [minutes: number, points: number][] = [
  [5, 25],
  [15, 20],
  [30, 15],
  [60, 10],
  [180, 5],
];
const RESOLUTION_THRESHOLDS: [minutes: number, points: number][] = [
  [30, 25],
  [60, 20],
  [180, 15],
  [480, 10],
  [1440, 5],
];

/**
 * Nome de atendente reduzido à sua forma comparável.
 *
 * Além de `trim` + minúsculas, **colapsa espaço interno**: "Juliana  Coelho"
 * com dois espaços é a mesma pessoa que "Juliana Coelho", e sem isto vira um
 * segundo card. É o mesmo defeito que o espaço duplo do Acessórias produziu na
 * ordenação de empresas — dado digitado por gente traz espaço a mais.
 *
 * Acento é preservado de propósito: normalizar acento aproxima nomes distintos
 * e o risco de fundir duas pessoas é pior do que o de separar uma.
 */
export function normalizarNomeAtendente(nome: string | null | undefined): string | null {
  const limpo = nome?.replace(/\s+/g, " ").trim().toLowerCase();
  return limpo ? limpo : null;
}

/** O que o agrupamento precisa saber de um vínculo agente↔usuário. */
export type VinculoAtendente = {
  chatwootAgentName: string;
  linkedUserId: string | null;
};

/** Índice de vínculos por nome normalizado, para casar com quem escreveu. */
export function indexarVinculosPorNome(
  vinculos: VinculoAtendente[]
): Map<string, VinculoAtendente> {
  const mapa = new Map<string, VinculoAtendente>();
  for (const v of vinculos) {
    const chave = normalizarNomeAtendente(v.chatwootAgentName);
    if (!chave) continue;
    // Dois agentes do Chatwoot com o mesmo nome: fica o que tem vínculo de
    // conta, porque é o que consegue fundir os dois num card só. Escolher o
    // último cegamente foi o que partiu a BLD em dois clientes na importação.
    const atual = mapa.get(chave);
    if (!atual || (atual.linkedUserId === null && v.linkedUserId !== null)) mapa.set(chave, v);
  }
  return mapa;
}

/**
 * Chave de agrupamento de um atendimento na Avaliação de Atendimentos.
 *
 * **Um cadastro do Connect = um card.** Quando o nome de quem atendeu casa com
 * um agente do Chatwoot vinculado a um `User`, a chave é o id desse usuário —
 * então dois agentes do Chatwoot da mesma pessoa (renomeada, reconvidada, ou
 * com conta em dois canais) caem no mesmo card. Sem vínculo, cai no nome
 * normalizado, que é o melhor que dá para saber.
 *
 * **O que NÃO entra aqui é o `assigneeId` da conversa**, e é a correção de
 * 2026-09-03: ele é o responsável ATUAL no Chatwoot, e nesta operação a
 * recepção recebe todos os atendimentos. Usá-lo para achar o vínculo fazia
 * *todo* card exibir o nome da recepcionista — a tela mostrava doze "Juliana
 * Coelho" com contagens diferentes, que eram doze pessoas distintas. O
 * agrupamento já estava certo; quem estava errado era o nome em cima dele.
 *
 * O formato `label:` é preservado de propósito: `AgentEvaluationSummary` guarda
 * esta chave, e mudar o formato de todos invalidaria os resumos já gerados.
 */
/**
 * Chave de um card: o segmento mais quem atendeu.
 *
 * O segmento entra na chave porque a mesma pessoa aparece nas duas seções — a
 * recepção tem triagem e, quando resolve sozinha, também aparece ali — e
 * `AgentEvaluationSummary` é indexado por esta chave. Sem o prefixo, o resumo
 * da triagem de alguém sobrescreveria o da tratativa dele.
 *
 * Isto invalida os resumos gerados antes de 2026-09-03. É consequência aceita:
 * eles resumem notas da régua antiga, que a repontuação substitui de qualquer
 * forma.
 */
export function chaveDoSegmento(
  segmento: "TRIAGEM" | "TRATATIVA",
  nomeDeQuemAtendeu: string | null,
  vinculosPorNome: Map<string, VinculoAtendente>
): string {
  return `${segmento}|${chaveDoAtendente(nomeDeQuemAtendeu, vinculosPorNome)}`;
}

/** Desmonta a chave para a action de resumo saber que segmento filtrar. */
export function lerChaveDeSegmento(
  chave: string
): { segmento: "TRIAGEM" | "TRATATIVA"; chaveDoAtendente: string } | null {
  const corte = chave.indexOf("|");
  if (corte === -1) return null;
  const segmento = chave.slice(0, corte);
  if (segmento !== "TRIAGEM" && segmento !== "TRATATIVA") return null;
  return { segmento, chaveDoAtendente: chave.slice(corte + 1) };
}

export function chaveDoAtendente(
  nomeDeQuemAtendeu: string | null,
  vinculosPorNome: Map<string, VinculoAtendente>
): string {
  const nome = normalizarNomeAtendente(nomeDeQuemAtendeu);
  if (!nome) return "sem-atendente";
  const vinculo = vinculosPorNome.get(nome);
  if (vinculo?.linkedUserId) return `user:${vinculo.linkedUserId}`;
  return `label:${nome}`;
}

function scoreByThreshold(minutes: number | null, thresholds: [number, number][]): number {
  if (minutes == null) return 0;
  for (const [maxMinutes, points] of thresholds) {
    if (minutes <= maxMinutes) return points;
  }
  return 0;
}

/**
 * 25 pts pelo tempo até a primeira resposta, 25 pts pelo tempo até o trecho
 * fechar. Recebe a janela já recortada por `janelaDeSla` em vez da conversa
 * inteira: com o atendimento partido em triagem e tratativa, cada metade tem o
 * seu próprio começo e o seu próprio fim, e medir as duas contra a abertura da
 * conversa daria à tratativa o atraso da triagem.
 */
export function computeSlaScore(janela: { inicio: Date; primeiraResposta: Date | null; fim: Date }): number {
  const minutos = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;
  const ateResposta = janela.primeiraResposta ? minutos(janela.inicio, janela.primeiraResposta) : null;
  return (
    scoreByThreshold(ateResposta, FIRST_RESPONSE_THRESHOLDS) +
    scoreByThreshold(minutos(janela.inicio, janela.fim), RESOLUTION_THRESHOLDS)
  );
}

/** Nomes de quem faz triagem, marcados em `chatwoot_agent_links.isReception`. */
export async function nomesDaRecepcao(tenantId: string): Promise<string[]> {
  const prisma = getPrisma();
  const linhas = await prisma.chatwootAgentLink.findMany({
    where: { tenantId, isReception: true },
    select: { chatwootAgentName: true },
  });
  return linhas.map((l) => l.chatwootAgentName);
}

function buildTranscript(messages: { messageType: string; senderLabel: string | null; content: string | null }[]): string {
  return messages
    .map((m) => `[${m.messageType === "incoming" ? "Cliente" : "Atendente"}${m.senderLabel ? ` - ${m.senderLabel}` : ""}] ${m.content ?? "(sem texto)"}`)
    .join("\n");
}

/**
 * Avalia uma conversa resolvida, **uma nota por segmento**.
 *
 * Idempotente: pode ser chamado de novo para recalcular (conversa que reabriu e
 * foi resolvida outra vez, ou repontuação com régua nova). Segmento que deixou
 * de existir é apagado — sem isso, uma conversa que antes tinha tratativa e
 * depois de reprocessada não tem mais deixaria a linha velha viva, contando
 * para a média de alguém que não atendeu.
 *
 * Custa **uma chamada de IA por segmento**, não por conversa. É o preço de
 * medir separado: a nota de escrita da recepção não pode sair de um texto que
 * inclui o que o setor escreveu.
 */
export async function evaluateConversation(
  tenantId: string,
  conversationId: string,
  recepcao?: string[]
): Promise<void> {
  const prisma = getPrisma();
  const conversation = await prisma.chatwootConversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true, resolvedAt: true },
  });
  if (!conversation?.resolvedAt) return;

  await ensureMessagesLoaded(tenantId, conversationId);

  const messages: MensagemSegmentavel[] = await prisma.chatwootMessage.findMany({
    where: { conversationId, isPrivate: false, messageType: { not: "activity" } },
    orderBy: { chatwootCreatedAt: "asc" },
    select: { messageType: true, senderLabel: true, content: true, chatwootCreatedAt: true },
  });
  // Sem mensagem de verdade (só atividade/nota interna) — nada pra avaliar.
  if (messages.length === 0) return;

  const segmentos = segmentarAtendimento(
    messages,
    recepcao ?? (await nomesDaRecepcao(tenantId)),
    conversation.resolvedAt
  );

  const avaliadoEm = new Date();
  const vistos: ("TRIAGEM" | "TRATATIVA")[] = [];

  for (const [i, seg] of segmentos.entries()) {
    const anteriores = i === 0 ? [] : segmentos[i - 1]!.mensagens;
    const janela = janelaDeSla(seg, anteriores);
    if (!janela) continue;

    const slaScore = computeSlaScore(janela);
    const { writingScore, reasoning } = await evaluateConversationWriting(
      tenantId,
      buildTranscript(seg.mensagens)
    );
    const clampedWriting = Math.max(0, Math.min(50, Math.round(writingScore)));
    const dados = {
      score: clampedWriting + slaScore,
      writingScore: clampedWriting,
      slaScore,
      reasoning,
      handlerLabel: seg.atendente,
      evaluatedAt: avaliadoEm,
    };

    await prisma.conversationEvaluation.upsert({
      where: { conversationId_segment: { conversationId, segment: seg.tipo } },
      create: { tenantId, conversationId, segment: seg.tipo, ...dados },
      update: dados,
    });
    vistos.push(seg.tipo);
  }

  await prisma.conversationEvaluation.deleteMany({
    where: { conversationId, segment: { notIn: vistos } },
  });
}

export type EvaluationRunResult = { scanned: number; evaluated: number; failed: number };

// Chamado pelo cron (n8n) — busca conversas resolvidas sem nota (ou com nota
// desatualizada, de antes da resolução mais recente — caso de reabertura) e
// avalia um lote pequeno por chamada. A comparação evaluatedAt < resolvedAt é
// feita em memória (não dá pra comparar duas colunas direto no filtro do
// Prisma) — MAX_CANDIDATES_SCANNED limita o custo disso a uma leitura só.
export async function runEvaluationForAllTenants(): Promise<EvaluationRunResult> {
  const prisma = getPrisma();

  const candidates = await prisma.chatwootConversation.findMany({
    where: { resolvedAt: { not: null } },
    orderBy: { resolvedAt: "desc" },
    take: MAX_CANDIDATES_SCANNED,
    select: { id: true, tenantId: true, resolvedAt: true, evaluations: { select: { evaluatedAt: true } } },
  });

  // Pendente é quem não tem NENHUMA avaliação, ou cuja avaliação mais antiga é
  // anterior à resolução. A mais antiga, e não a mais recente: se a conversa
  // reabriu e foi resolvida de novo, os dois segmentos precisam ser refeitos, e
  // olhar só o mais recente deixaria a outra metade parada no passado.
  const pending = candidates
    .filter((c) => {
      if (!c.resolvedAt) return false;
      if (c.evaluations.length === 0) return true;
      const maisAntiga = c.evaluations.reduce((a, b) => (a.evaluatedAt <= b.evaluatedAt ? a : b));
      return maisAntiga.evaluatedAt < c.resolvedAt;
    })
    .slice(0, MAX_EVALUATIONS_PER_CALL);

  // Uma leitura só dos nomes da recepção para o lote inteiro, em vez de uma por
  // conversa. Cache por tenant porque o cron varre todos.
  const recepcaoPorTenant = new Map<string, string[]>();

  let evaluated = 0;
  let failed = 0;
  for (const c of pending) {
    try {
      let recepcao = recepcaoPorTenant.get(c.tenantId);
      if (!recepcao) {
        recepcao = await nomesDaRecepcao(c.tenantId);
        recepcaoPorTenant.set(c.tenantId, recepcao);
      }
      await evaluateConversation(c.tenantId, c.id, recepcao);
      evaluated++;
    } catch (err) {
      console.error("[chatwoot:evaluation] falha ao avaliar conversa", c.id, err);
      failed++;
    }
  }

  return { scanned: candidates.length, evaluated, failed };
}
