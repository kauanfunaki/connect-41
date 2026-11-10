// Leitura das conversas para a tela.

import type { Faixa } from "@/lib/recrutamento/triagem";
import type { Respostas } from "@/lib/recrutamento/respostas";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  anterioresAo,
  contarSemResposta,
  ordenarConversas,
  paginaDeMensagens,
  resumoPorConversa,
  MENSAGENS_DO_RESUMO,
  MENSAGENS_POR_VEZ,
  type ConversaParaTela,
  type CursorDeMensagem,
} from "@/lib/whatsapp/conversas";
import { JANELA_LIVRE_EM_HORAS } from "@/lib/whatsapp/decisao";
import { janelaDoCodigo, CODIGOS_DE_WHATSAPP, provedorDaIntegracao } from "@/lib/whatsapp/provedores";
import { avaliarConexao, contarEsperandoRobo, type SaudeDaConexao } from "@/lib/whatsapp/saude";
import { lerConfig } from "@/lib/integracoes/data";
import { INTEGRATION_CATALOG } from "@/lib/integracoes/catalogo";

export type LinhaDeConversa = ConversaParaTela & {
  id: string;
  waPhone: string;
  nome: string | null;
  vaga: string | null;
  /** O começo da última mensagem, para a lista dar contexto sem abrir. */
  ultimaMensagem: string | null;
  ultimaMensagemEm: Date | null;
  handoffReason: string | null;
  naoRespondidas: number;
  /** Quem do time assumiu. Nulo com `handoffAt` = esperando alguém. */
  responsavel: { id: string; nome: string } | null;
};

/**
 * A janela de mensagem livre de cada conexão, pelo provedor dela.
 *
 * Uma consulta para todas — a janela é da conexão, não da conversa, e o mesmo
 * cliente pode ter um número na Meta e outro na Evolution.
 */
async function janelasDasConexoes(tenantId: string, integrationIds: string[]): Promise<Map<string, number | null>> {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { tenantId, id: { in: [...new Set(integrationIds)] } },
    select: { id: true, integrationCode: true },
  });
  return new Map(conexoes.map((c) => [c.id, janelaDoCodigo(c.integrationCode)]));
}

/**
 * Conexão apagada ou fora do mapa fica com a janela mais restritiva: errar para
 * o lado de recusar a resposta é a pessoa ver o motivo na tela.
 */
function janelaDe(janelas: Map<string, number | null>, integrationId: string): number | null {
  return janelas.has(integrationId) ? janelas.get(integrationId)! : JANELA_LIVRE_EM_HORAS;
}

/**
 * As conversas de um cliente, já na ordem da fila.
 *
 * Uma consulta para as threads e as últimas mensagens de todas de uma vez
 * (`ultimasDeCadaConversa`) — e não uma por thread. Com o piloto rodando, "uma por linha" é o que transforma uma tela
 * de trinta conversas em sessenta viagens ao banco.
 */
export async function listarConversas(tenantId: string, agora: Date): Promise<LinhaDeConversa[]> {
  const prisma = getPrisma();
  const threads = await prisma.whatsappThread.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      integrationId: true,
      waPhone: true,
      optedOutAt: true,
      handoffAt: true,
      handoffReason: true,
      lastInboundAt: true,
      candidaturaId: true,
      assignedTo: { select: { id: true, name: true } },
      atendimentos: { orderBy: { abertoEm: "desc" }, take: 1, select: { encerradoEm: true } },
    },
  });
  if (threads.length === 0) return [];

  const ids = threads.map((t) => t.id);
  const [ultimas, candidaturas, janelas] = await Promise.all([
    ultimasDeCadaConversa(ids),
    prisma.candidatura.findMany({
      where: {
        tenantId,
        id: { in: threads.map((t) => t.candidaturaId).filter((v): v is string => !!v) },
      },
      select: { id: true, person: { select: { name: true } }, vaga: { select: { title: true } } },
    }),
    janelasDasConexoes(
      tenantId,
      threads.map((t) => t.integrationId)
    ),
  ]);

  const resumo = resumoPorConversa(ultimas);
  const candidaturaPorId = new Map(candidaturas.map((c) => [c.id, c]));

  const linhas: LinhaDeConversa[] = threads.map((t) => {
    const ultima = resumo.get(t.id)?.ultima ?? null;
    const c = t.candidaturaId ? candidaturaPorId.get(t.candidaturaId) : null;
    return {
      id: t.id,
      waPhone: t.waPhone,
      nome: c?.person.name ?? null,
      vaga: c?.vaga.title ?? null,
      ultimaMensagem: ultima?.body.slice(0, 120) ?? null,
      ultimaMensagemEm: ultima?.createdAt ?? null,
      optedOutAt: t.optedOutAt,
      handoffAt: t.handoffAt,
      handoffReason: t.handoffReason,
      lastInboundAt: t.lastInboundAt,
      candidaturaId: t.candidaturaId,
      janelaLivreHoras: janelaDe(janelas, t.integrationId),
      atendimentoEncerradoEm: t.atendimentos[0]?.encerradoEm ?? null,
      naoRespondidas: resumo.get(t.id)?.naoRespondidas ?? 0,
      responsavel: t.assignedTo ? { id: t.assignedTo.id, nome: t.assignedTo.name } : null,
    };
  });

  return ordenarConversas(linhas, agora);
}

/**
 * As últimas `MENSAGENS_DO_RESUMO` mensagens de cada conversa, em ordem
 * decrescente. Antes a lista lia todas as mensagens das 200 conversas para
 * achar a última de cada uma.
 *
 * O `ROW_NUMBER()` (MySQL 8) roda só sobre o índice `(threadId, createdAt)` —
 * que no InnoDB já carrega o id —, sem tocar no texto das mensagens; o texto
 * vem depois, só das escolhidas, pelo Prisma (que também cuida das datas e do
 * fuso, o que a consulta crua não faz).
 */
async function ultimasDeCadaConversa(threadIds: string[]) {
  const prisma = getPrisma();
  const escolhidas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY threadId ORDER BY createdAt DESC, id DESC) AS n
        FROM whatsapp_messages
       WHERE threadId IN (${Prisma.join(threadIds)})
    ) AS r
    WHERE r.n <= ${MENSAGENS_DO_RESUMO}`;
  if (escolhidas.length === 0) return [];
  return prisma.whatsappMessage.findMany({
    where: { id: { in: escolhidas.map((e) => e.id) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { threadId: true, body: true, createdAt: true, direction: true },
  });
}

export type MensagemNaTela = {
  id: string;
  direction: "ENTRADA" | "SAIDA";
  body: string;
  createdAt: Date;
  status: string | null;
  error: string | null;
  /** Veio do robô? É o que distingue o que uma pessoa escreveu. */
  doRobo: boolean;
  /** Arquivo guardado com a mensagem (hoje, currículo em PDF). Baixa por `/api/whatsapp/midia/[id]`. */
  anexo: { nome: string } | null;
};

/**
 * O que o recrutador precisa ver da candidatura enquanto atende: a nota da
 * triagem e as respostas que o robô já coletou — sem sair da conversa.
 */
export type FichaDaCandidatura = {
  vagaId: string;
  candidaturaId: string;
  nota: { score: number; faixa: Faixa; desatualizada: boolean } | null;
  respostas: Respostas;
};

export type ConversaDetalhada = LinhaDeConversa & {
  /** As `MENSAGENS_POR_VEZ` mais novas, em ordem crescente. As anteriores vêm por `lerMensagensAnteriores`. */
  mensagens: MensagemNaTela[];
  /** Há mensagens mais antigas que as carregadas. */
  temAnteriores: boolean;
  /** Todas as mensagens da conversa, carregadas ou não: a contagem da aba. */
  totalMensagens: number;
  ficha: FichaDaCandidatura | null;
  /**
   * Vínculo automático por telefone + nome (`src/lib/whatsapp/vinculo.ts`):
   * `confirmando` enquanto espera o nome, `nao_confirmou` quando desistiu ou
   * alguém desfez um vínculo. Nulo quando nada disso se aplica.
   */
  vinculoAutomatico: "confirmando" | "nao_confirmou" | null;
  /**
   * Cada atendimento encerrado, em ordem — a tela marca na conversa onde um
   * terminou e o outro começou. `por` nulo é o próprio candidato (PARAR).
   */
  encerramentos: { em: Date; desfecho: string | null; por: string | null }[];
};

export async function lerConversa(
  tenantId: string,
  threadId: string
): Promise<ConversaDetalhada | null> {
  const prisma = getPrisma();
  const thread = await prisma.whatsappThread.findFirst({
    where: { id: threadId, tenantId },
    select: {
      id: true,
      integrationId: true,
      waPhone: true,
      optedOutAt: true,
      handoffAt: true,
      handoffReason: true,
      lastInboundAt: true,
      candidaturaId: true,
      linkPendingPersonId: true,
      linkFailedAt: true,
      assignedTo: { select: { id: true, name: true } },
      atendimentos: {
        orderBy: { abertoEm: "asc" },
        select: { id: true, abertoEm: true, encerradoEm: true, desfecho: true, encerradoPor: { select: { name: true } } },
      },
    },
  });
  if (!thread) return null;

  const [maisNovas, totalMensagens, candidatura, janelas] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { threadId, tenantId },
      // Das mais novas para trás: com `asc` e teto, uma conversa longa mostrava
      // as mais antigas e escondia as novas.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MENSAGENS_POR_VEZ + 1,
      select: SELECT_DA_MENSAGEM,
    }),
    prisma.whatsappMessage.count({ where: { threadId, tenantId } }),
    thread.candidaturaId
      ? prisma.candidatura.findFirst({
          where: { id: thread.candidaturaId, tenantId },
          select: {
            id: true,
            vagaId: true,
            pretensaoSalarial: true,
            disponibilidade: true,
            deslocamentoMinutos: true,
            person: { select: { name: true } },
            vaga: {
              select: {
                title: true,
                requisitos: { orderBy: { versao: "desc" }, take: 1, select: { id: true } },
              },
            },
            notas: { orderBy: { createdAt: "desc" }, take: 1, select: { score: true, faixa: true, requisitosId: true } },
          },
        })
      : null,
    janelasDasConexoes(tenantId, [thread.integrationId]),
  ]);

  const { mensagens, temAnteriores } = paginaDeMensagens(maisNovas);
  const ultima = mensagens.length > 0 ? mensagens[mensagens.length - 1]! : null;
  const ultimoAtendimento = thread.atendimentos.length > 0 ? thread.atendimentos[thread.atendimentos.length - 1]! : null;
  const naoRespondidas = contarSemResposta(maisNovas);

  return {
    id: thread.id,
    waPhone: thread.waPhone,
    nome: candidatura?.person.name ?? null,
    vaga: candidatura?.vaga.title ?? null,
    ultimaMensagem: ultima?.body.slice(0, 120) ?? null,
    ultimaMensagemEm: ultima?.createdAt ?? null,
    optedOutAt: thread.optedOutAt,
    handoffAt: thread.handoffAt,
    handoffReason: thread.handoffReason,
    lastInboundAt: thread.lastInboundAt,
    candidaturaId: thread.candidaturaId,
    janelaLivreHoras: janelaDe(janelas, thread.integrationId),
    atendimentoEncerradoEm: ultimoAtendimento?.encerradoEm ?? null,
    encerramentos: thread.atendimentos
      .filter((a) => a.encerradoEm)
      .map((a) => ({
        em: a.encerradoEm!,
        desfecho: a.desfecho,
        // Sem quem encerrou é o próprio candidato, pelo PARAR — ou uma pessoa
        // que já não está no sistema.
        por: a.encerradoPor?.name ?? null,
      })),
    naoRespondidas,
    responsavel: thread.assignedTo ? { id: thread.assignedTo.id, nome: thread.assignedTo.name } : null,
    vinculoAutomatico: thread.candidaturaId
      ? null
      : thread.linkPendingPersonId
        ? "confirmando"
        : thread.linkFailedAt
          ? "nao_confirmou"
          : null,
    ficha: candidatura
      ? {
          vagaId: candidatura.vagaId,
          candidaturaId: candidatura.id,
          nota: candidatura.notas[0]
            ? {
                score: candidatura.notas[0].score,
                faixa: candidatura.notas[0].faixa as Faixa,
                desatualizada: candidatura.notas[0].requisitosId !== candidatura.vaga.requisitos[0]?.id,
              }
            : null,
          respostas: {
            pretensaoSalarial: candidatura.pretensaoSalarial === null ? null : candidatura.pretensaoSalarial.toNumber(),
            disponibilidade: candidatura.disponibilidade,
            deslocamentoMinutos: candidatura.deslocamentoMinutos,
          },
        }
      : null,
    mensagens: mensagens.map(mensagemNaTela),
    temAnteriores,
    totalMensagens,
  };
}

/**
 * As `porVez` mensagens imediatamente anteriores ao cursor (a mais antiga já
 * na tela), em ordem crescente — o "Carregar mensagens anteriores".
 */
export async function lerMensagensAnteriores(
  tenantId: string,
  threadId: string,
  cursor: CursorDeMensagem,
  porVez = MENSAGENS_POR_VEZ
): Promise<{ mensagens: MensagemNaTela[]; temAnteriores: boolean }> {
  const maisNovas = await getPrisma().whatsappMessage.findMany({
    where: { threadId, tenantId, ...anterioresAo(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: porVez + 1,
    select: SELECT_DA_MENSAGEM,
  });
  const { mensagens, temAnteriores } = paginaDeMensagens(maisNovas, porVez);
  return { mensagens: mensagens.map(mensagemNaTela), temAnteriores };
}

const SELECT_DA_MENSAGEM = {
  id: true,
  direction: true,
  body: true,
  createdAt: true,
  status: true,
  error: true,
  agentRunId: true,
  automatica: true,
  mediaUrl: true,
  mediaFileName: true,
} as const;

function mensagemNaTela(m: {
  id: string;
  direction: "ENTRADA" | "SAIDA";
  body: string;
  createdAt: Date;
  status: string | null;
  error: string | null;
  agentRunId: string | null;
  automatica: boolean;
  mediaUrl: string | null;
  mediaFileName: string | null;
}): MensagemNaTela {
  return {
    id: m.id,
    direction: m.direction,
    body: m.body,
    createdAt: m.createdAt,
    status: m.status,
    error: m.error,
    // Texto fixo do Connect conta como do assistente: para o candidato, foi
    // o assistente que escreveu. "time" fica só para o que uma pessoa mandou.
    doRobo: m.agentRunId !== null || m.automatica,
    anexo: m.mediaUrl ? { nome: m.mediaFileName ?? "curriculo.pdf" } : null,
  };
}

export type ConexaoNaTela = {
  id: string;
  rotulo: string;
  /** Nome da instância na Evolution — não é segredo, e é o que se procura no Manager. */
  instancia: string | null;
  ligada: boolean;
  /** A última mensagem que chegou por esta conexão, de qualquer candidato. */
  ultimaEntradaEm: Date | null;
  /** Conversas com o assistente sem resposta há tempo demais (`contarEsperandoRobo`): o número ao lado do aviso. */
  esperandoRobo: number;
  saude: SaudeDaConexao;
};

/**
 * A saúde de cada conexão de WhatsApp do cliente, para o topo de `/whatsapp`.
 *
 * O estado vem do provedor **na hora**, e não de um cron: a tela é aberta por
 * quem está atendendo, e um estado de meia hora atrás é exatamente o que mente
 * no momento em que o número acabou de cair. O timeout do provedor é curto para
 * não segurar a página.
 */
export async function saudeDasConexoes(tenantId: string, agora: Date): Promise<ConexaoNaTela[]> {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { tenantId, integrationCode: { in: CODIGOS_DE_WHATSAPP } },
    orderBy: { createdAt: "asc" },
    select: { id: true, integrationCode: true, label: true, enabled: true, configEnc: true },
  });

  return Promise.all(
    conexoes.map(async (c) => {
      const provedor = provedorDaIntegracao(c.integrationCode);
      const config = lerConfig(c.configEnc);

      const threads = await prisma.whatsappThread.findMany({
        where: { tenantId, integrationId: c.id },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true,
          handoffAt: true,
          optedOutAt: true,
          lastInboundAt: true,
          atendimentos: { orderBy: { abertoEm: "desc" }, take: 1, select: { encerradoEm: true } },
        },
      });
      const ids = threads.map((t) => t.id);

      const [estado, saidas, ultimaFalha] = await Promise.all([
        // Conexão desligada não é consultada: o veredito já é "desligada", e
        // consultar gastaria o timeout à toa.
        c.enabled && provedor?.consultarConexao ? provedor.consultarConexao(config) : Promise.resolve(null),
        ids.length > 0
          ? prisma.whatsappMessage.groupBy({
              by: ["threadId"],
              where: { threadId: { in: ids }, direction: "SAIDA", status: "ENVIADA" },
              _max: { createdAt: true },
            })
          : Promise.resolve([]),
        ids.length > 0
          ? prisma.whatsappMessage.findFirst({
              where: { threadId: { in: ids }, direction: "SAIDA", status: "FALHOU" },
              orderBy: { createdAt: "desc" },
              select: { createdAt: true, error: true },
            })
          : Promise.resolve(null),
      ]);

      const ultimaSaidaPorThread = new Map(saidas.map((s) => [s.threadId, s._max.createdAt]));
      const esperandoRobo = contarEsperandoRobo(
        threads.map((t) => ({
          handoffAt: t.handoffAt,
          optedOutAt: t.optedOutAt,
          encerrado: !!t.atendimentos[0]?.encerradoEm,
          ultimaEntradaEm: t.lastInboundAt,
          ultimaSaidaEm: ultimaSaidaPorThread.get(t.id) ?? null,
        })),
        agora
      );

      const ultimaEntradaEm = threads.reduce<Date | null>(
        (maior, t) => (t.lastInboundAt && (!maior || t.lastInboundAt > maior) ? t.lastInboundAt : maior),
        null
      );

      return {
        id: c.id,
        rotulo: c.label ?? INTEGRATION_CATALOG.find((d) => d.code === c.integrationCode)?.label ?? c.integrationCode,
        instancia: config.instance ?? null,
        ligada: c.enabled,
        ultimaEntradaEm,
        esperandoRobo,
        saude: avaliarConexao(
          {
            ligada: c.enabled,
            estado: provedor?.consultarConexao ? estado : null,
            ultimaFalha: ultimaFalha ? { em: ultimaFalha.createdAt, erro: ultimaFalha.error } : null,
            esperandoRobo,
          },
          agora
        ),
      };
    })
  );
}
