// Leitura das conversas para a tela.

import type { Faixa } from "@/lib/recrutamento/triagem";
import type { Respostas } from "@/lib/recrutamento/respostas";
import { getPrisma } from "@/lib/prisma";
import { ordenarConversas, type ConversaParaTela } from "@/lib/whatsapp/conversas";
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
 * Uma consulta para as threads e uma para a última mensagem de cada — e não uma
 * por thread. Com o piloto rodando, "uma por linha" é o que transforma uma tela
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
    },
  });
  if (threads.length === 0) return [];

  const ids = threads.map((t) => t.id);
  const [ultimas, candidaturas, janelas] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { threadId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { threadId: true, body: true, createdAt: true, direction: true },
    }),
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

  // A consulta veio em ordem decrescente, então a primeira de cada thread é a
  // última mensagem, e as de ENTRADA antes da primeira SAIDA são exatamente as
  // que ninguém respondeu. `fechada` marca onde parar de contar.
  const ultimaPorThread = new Map<string, { body: string; createdAt: Date }>();
  const naoRespondidas = new Map<string, number>();
  const fechada = new Set<string>();
  for (const m of ultimas) {
    if (!ultimaPorThread.has(m.threadId)) {
      ultimaPorThread.set(m.threadId, { body: m.body, createdAt: m.createdAt });
    }
    if (fechada.has(m.threadId)) continue;
    if (m.direction === "ENTRADA") {
      naoRespondidas.set(m.threadId, (naoRespondidas.get(m.threadId) ?? 0) + 1);
    } else {
      fechada.add(m.threadId);
    }
  }

  const candidaturaPorId = new Map(candidaturas.map((c) => [c.id, c]));

  const linhas: LinhaDeConversa[] = threads.map((t) => {
    const ultima = ultimaPorThread.get(t.id) ?? null;
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
      naoRespondidas: naoRespondidas.get(t.id) ?? 0,
    };
  });

  return ordenarConversas(linhas, agora);
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
  mensagens: MensagemNaTela[];
  ficha: FichaDaCandidatura | null;
  /**
   * Vínculo automático por telefone + nome (`src/lib/whatsapp/vinculo.ts`):
   * `confirmando` enquanto espera o nome, `nao_confirmou` quando desistiu ou
   * alguém desfez um vínculo. Nulo quando nada disso se aplica.
   */
  vinculoAutomatico: "confirmando" | "nao_confirmou" | null;
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
    },
  });
  if (!thread) return null;

  const [mensagens, candidatura, janelas] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { threadId, tenantId },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
        status: true,
        error: true,
        agentRunId: true,
        mediaUrl: true,
        mediaFileName: true,
      },
    }),
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

  const ultima = mensagens.length > 0 ? mensagens[mensagens.length - 1]! : null;
  let naoRespondidas = 0;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    if (mensagens[i]!.direction !== "ENTRADA") break;
    naoRespondidas++;
  }

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
    naoRespondidas,
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
    mensagens: mensagens.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
      status: m.status,
      error: m.error,
      doRobo: m.agentRunId !== null,
      anexo: m.mediaUrl ? { nome: m.mediaFileName ?? "curriculo.pdf" } : null,
    })),
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
        select: { id: true, handoffAt: true, optedOutAt: true, lastInboundAt: true },
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
