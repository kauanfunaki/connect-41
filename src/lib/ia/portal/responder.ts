// O miolo da pergunta da Ceci no portal do cliente (21/10/2026, fase 3).
//
// O irmão de `src/lib/ia/chat/responder.ts`, com três diferenças que são o
// motivo de não ser o mesmo arquivo:
//
// - quem pergunta é um acesso do portal, não uma pessoa da equipe: o escopo
//   das ferramentas é `{ portalUserId }`, posto aqui a partir da sessão, e o
//   `userId` da execução é nulo (as ferramentas do portal recusam o contrário);
// - não há conversa gravada: a tela guarda as trocas e manda as últimas junto
//   (`lerHistorico` corta e limpa). O histórico é texto do próprio cliente — o
//   que ele forjar ali não abre nada, porque a trava está nas ferramentas;
// - a resposta não leva link para a tela da equipe. Os links do texto viram só
//   o rótulo, e os do portal que uma ferramenta devolveu viram botões à parte.
//   A solicitação preparada (`portal_preparar_solicitacao`) é conferida aqui —
//   empresa do escopo, assunto ativo — e vira um link para a tela de nova
//   solicitação já preenchida, que o cliente revisa e envia.
//
// O que conta e o que limita: cada pergunta é uma `AgentRun` do agente
// `ceci_portal` (custo, tokens, modelo), com `entityId` = o acesso. O teto do
// mês é o de sempre (`podeChamar`, Integrações › IA); o limite do dia conta
// essas linhas (`perguntasDeHojeDoAcesso`).

import { conversarComAgente } from "@/lib/ai";
import { SOLICITACAO_PREPARADA } from "@/lib/ia/ferramentas-portal";
import { linksDasFerramentas } from "@/lib/ia/chat/links";
import { MAX_CARACTERES_DA_PERGUNTA } from "@/lib/ia/chat/regras";
import { apresentacaoDaCeci, cumprimentoDaCeci, primeiroNomeParaOPrompt, semCumprimento } from "@/lib/ia/ceci";
import type { TurnoAnterior } from "@/lib/ia/laco";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { assuntosAtivos } from "@/lib/solicitacoes/assuntos";
import { LIMITE_DA_DESCRICAO } from "@/lib/solicitacoes/regras";
import { acessoVeEmpresa, type EscopoDoAcesso } from "@/lib/portal/escopoDoAcesso";
import {
  AGENTE_DO_PORTAL,
  ENTIDADE_DO_PORTAL,
  LIMITE_DE_PERGUNTAS_DO_PORTAL_POR_DIA,
  agenteDoPortalPronto,
  lerEscopoDaCeci,
  perguntasDeHojeDoAcesso,
} from "@/lib/portal/ceci";

/** Um botão da resposta: um link do portal que uma ferramenta devolveu. */
export type BotaoDaResposta = { rotulo: string; href: string };

/** A solicitação que a Ceci preparou, conferida: o cliente abre a tela já preenchida. */
export type SolicitacaoPreparada = {
  empresaNome: string;
  assunto: string;
  descricao: string;
  href: string;
};

export type EventoDoPortal =
  | { tipo: "passo"; texto: string }
  | { tipo: "resposta"; texto: string; botoes: BotaoDaResposta[]; solicitacao: SolicitacaoPreparada | null; truncada: boolean }
  | { tipo: "erro"; texto: string };

export type PedidoDoPortal = { pergunta?: unknown; historico?: unknown; jaCumprimentada?: unknown };

export type PreparoDaPerguntaDoPortal =
  | { erro: string; status: number }
  | { executar: (enviar: (e: EventoDoPortal) => void) => Promise<void> };

/** Trocas anteriores que vão junto, e o tamanho de cada uma. A conversa longa fica na tela, não no custo. */
export const TURNOS_DO_HISTORICO = 6;
export const CARACTERES_POR_TURNO = 2_000;

/** Quanto da descrição preparada vai no endereço da tela de nova solicitação. */
export const CARACTERES_DA_SOLICITACAO = 1_500;

/** Botões por resposta. */
const BOTOES = 4;

export const INDISPONIVEL = "A Ceci não está disponível no seu portal. Fale com o escritório.";

/** O passo que a tela mostra enquanto a ferramenta roda. */
const PASSOS: Readonly<Record<string, string>> = {
  portal_empresas: "Vendo as suas empresas…",
  portal_pendencias: "Consultando as pendências…",
  portal_pendencia: "Abrindo a pendência…",
  portal_contas: "Consultando as contas…",
  portal_notas: "Consultando as notas fiscais…",
  portal_processos: "Consultando os processos…",
  portal_processo: "Abrindo o processo…",
  portal_solicitacoes: "Consultando as solicitações…",
  portal_solicitacao: "Abrindo a solicitação…",
  portal_assuntos: "Vendo os assuntos de solicitação…",
  [SOLICITACAO_PREPARADA]: "Preparando a solicitação…",
};

export function textoDoPassoDoPortal(nome: string): string {
  return PASSOS[nome] ?? "Consultando…";
}

/** O que o modelo lê sobre o lugar e o jeito de responder. */
const GUARDA_DO_PORTAL =
  "\n\nVocê está no portal do cliente do escritório, conversando com um CLIENTE — o dono ou alguém da empresa " +
  "dele, não da equipe. Regras:\n" +
  "- Responda só com o que as ferramentas trouxerem, e só sobre as empresas de portal_empresas. Empresa que não está " +
  "lá não existe para você: diga que não encontrou entre as empresas dele.\n" +
  "- Você só consulta. Não paga, não aprova, não responde pendência, não manda arquivo, não muda cadastro. Quando a " +
  "pessoa precisar de algo da equipe, prepare uma solicitação com portal_preparar_solicitacao (antes, " +
  "portal_assuntos para escolher o assunto) e diga que ela revisa e envia no botão abaixo. Nunca diga que enviou.\n" +
  "- Não dê orientação contábil, fiscal ou jurídica que dependa de análise (\"posso deduzir?\", \"vou ter multa?\"): " +
  "ofereça preparar uma solicitação para a equipe responder.\n" +
  "- A tela mostra Markdown simples. Comece com UMA linha de resumo, com os números em negrito. Depois, itens em " +
  "lista curta (\"- **Nome do item** — empresa — valor — prazo\"), o mais urgente primeiro. Sem emoji, sem tabela " +
  "grande.\n" +
  "- Quando a ferramenta devolver `link`, copie-o como veio no nome do item ou numa linha sozinha no fim — a tela " +
  "transforma em botão. Nunca invente endereço.\n" +
  "- Situação em palavras simples (\"vencida\", \"aguardando você\"). Nunca mostre código interno nem id.\n" +
  "- Datas em dd/mm/aaaa e valores como R$ 1.234,56.";

/** O texto de instrução da Ceci do portal. */
export function sistemaDoPortal({ primeiroNome, primeiraResposta }: { primeiroNome: string | null; primeiraResposta: boolean }): string {
  return `${apresentacaoDaCeci("Portal do cliente")}${GUARDA_DO_PORTAL}\n\n${cumprimentoDaCeci({ primeiroNome, primeiraResposta })}`;
}

/** As trocas que a tela mandou: só papel e texto, as últimas, cortadas. Puro. */
export function lerHistorico(valor: unknown): TurnoAnterior[] {
  if (!Array.isArray(valor)) return [];
  const turnos: TurnoAnterior[] = [];
  for (const t of valor) {
    if (typeof t !== "object" || t === null) continue;
    const { papel, texto } = t as { papel?: unknown; texto?: unknown };
    if ((papel !== "usuario" && papel !== "assistente") || typeof texto !== "string" || !texto.trim()) continue;
    turnos.push({ papel, texto: texto.trim().slice(0, CARACTERES_POR_TURNO) });
  }
  return turnos.slice(-TURNOS_DO_HISTORICO);
}

/** `[rótulo](endereço)` que não é citação. */
const LINK_MD = /(?<!@)\[([^\]\n]+)\]\(\s*<?([^()\s>]+)>?\s*\)/g;
/** A linha que é só um link (com marcador de lista ou negrito em volta). */
const LINHA_SO_LINK = /^\s*(?:[-*]\s+)?(?:\*\*)?\[([^\]\n]+)\]\(\s*<?([^()\s>]+)>?\s*\)(?:\*\*)?\s*$/;

function doPortal(href: string): boolean {
  return href === "/portal" || href.startsWith("/portal/") || href.startsWith("/portal?");
}

/**
 * O texto da resposta sem link nenhum (o rótulo fica), e os botões: os links do
 * texto cujo caminho é do portal e veio de uma ferramenta nesta execução. A
 * linha que era só um desses links sai do texto — ela é o botão. Puro.
 */
export function separarBotoes(texto: string, resultados: readonly string[]): { texto: string; botoes: BotaoDaResposta[] } {
  const vistos = linksDasFerramentas(resultados).caminhos;
  const vale = (href: string) => doPortal(href) && vistos.has(href);
  const botoes: BotaoDaResposta[] = [];
  const botao = (rotulo: string, href: string) => {
    if (!botoes.some((b) => b.href === href) && botoes.length < BOTOES) botoes.push({ rotulo: rotulo.replace(/\*\*/g, "").trim(), href });
  };
  const linhas: string[] = [];
  for (const linha of texto.split("\n")) {
    const so = LINHA_SO_LINK.exec(linha);
    if (so && vale(so[2]!)) {
      botao(so[1]!, so[2]!);
      continue;
    }
    linhas.push(
      linha.replace(LINK_MD, (_inteiro, rotulo: string, href: string) => {
        if (vale(href)) botao(rotulo, href);
        return rotulo;
      })
    );
  }
  return { texto: linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim(), botoes };
}

/**
 * A proposta de solicitação, conferida: a empresa tem de estar no escopo da
 * Ceci, e o assunto, entre os ativos. Qualquer coisa fora disso, nada — o
 * cliente ainda pode abrir a solicitação pela tela. Puro.
 */
export function conferirSolicitacao(
  argumentos: Record<string, unknown>,
  escopo: EscopoDoAcesso,
  empresas: readonly { id: string; nome: string }[],
  assuntos: readonly { id: string; label: string }[]
): SolicitacaoPreparada | null {
  const empresaId = typeof argumentos.empresaId === "string" ? argumentos.empresaId : "";
  const assuntoId = typeof argumentos.assuntoId === "string" ? argumentos.assuntoId : "";
  const bruta = typeof argumentos.descricao === "string" ? argumentos.descricao.trim() : "";
  if (!acessoVeEmpresa(escopo, empresaId)) return null;
  const empresa = empresas.find((e) => e.id === empresaId);
  const assunto = assuntos.find((a) => a.id === assuntoId);
  if (!empresa || !assunto || !bruta) return null;
  const descricao = bruta.slice(0, Math.min(CARACTERES_DA_SOLICITACAO, LIMITE_DA_DESCRICAO));
  const q = new URLSearchParams({ empresa: empresa.id, assunto: assunto.id, descricao });
  return { empresaNome: empresa.nome, assunto: assunto.label, descricao, href: `/portal/solicitacoes/nova?${q.toString()}` };
}

/** O erro que o cliente lê: nunca o texto interno (chave, teto, provedor). */
export function erroParaOCliente(err: unknown): string {
  const t = err instanceof Error ? err.message : "";
  if (/teto|desligado|chave de IA/i.test(t)) return "A Ceci atingiu o limite de uso do escritório por agora. Fale com o escritório ou tente mais tarde.";
  return "Não consegui responder agora. Tente de novo em instantes.";
}

/**
 * Confere o pedido e prepara a pergunta. Recusa antes de qualquer gasto; se
 * passar, devolve `executar`, que pergunta à Ceci e emite os eventos.
 */
export async function prepararPerguntaDoPortal(
  conta: { tenantId: string; portalUserId: string; nome: string | null },
  corpo: PedidoDoPortal,
  agora = new Date()
): Promise<PreparoDaPerguntaDoPortal> {
  const pergunta = typeof corpo.pergunta === "string" ? corpo.pergunta.trim() : "";
  if (!pergunta) return { erro: "Escreva a pergunta.", status: 400 };
  if (pergunta.length > MAX_CARACTERES_DA_PERGUNTA) return { erro: "Pergunta muito longa.", status: 400 };

  const [pronto, escopo] = await Promise.all([agenteDoPortalPronto(conta.tenantId), lerEscopoDaCeci(conta.tenantId, conta.portalUserId)]);
  if (!pronto || escopo.companyIds.length === 0) return { erro: INDISPONIVEL, status: 403 };

  if ((await perguntasDeHojeDoAcesso(conta.tenantId, conta.portalUserId, agora)) >= LIMITE_DE_PERGUNTAS_DO_PORTAL_POR_DIA) {
    return { erro: `Você chegou ao limite de ${LIMITE_DE_PERGUNTAS_DO_PORTAL_POR_DIA} perguntas de hoje. Volte amanhã.`, status: 429 };
  }

  const historico = lerHistorico(corpo.historico);
  const jaCumprimentada = corpo.jaCumprimentada === true;
  const primeiraResposta = historico.length === 0 && !jaCumprimentada;

  return {
    executar: async (enviar) => {
      const resultados: string[] = [];
      try {
        const r = await conversarComAgente({
          tenantId: conta.tenantId,
          agentCode: AGENTE_DO_PORTAL,
          system: sistemaDoPortal({ primeiroNome: primeiroNomeParaOPrompt(conta.nome), primeiraResposta }),
          pergunta,
          historico,
          escopo: { portalUserId: conta.portalUserId },
          contexto: { userId: null, entityType: ENTIDADE_DO_PORTAL, entityId: conta.portalUserId },
          aoUsarFerramenta: (nome) => enviar({ tipo: "passo", texto: textoDoPassoDoPortal(nome) }),
          aoReceberResultado: (_nome, conteudo, erro) => {
            if (!erro) resultados.push(conteudo);
          },
        });

        // A última solicitação que ela preparou, conferida de novo contra o banco.
        const proposta = [...r.propostas].reverse().find((p) => p.ferramenta === SOLICITACAO_PREPARADA);
        let solicitacao: SolicitacaoPreparada | null = null;
        if (proposta) {
          const [empresas, assuntos] = await Promise.all([
            empresasDoSeletor(escopo.tenantId, [...escopo.companyIds]),
            assuntosAtivos(escopo.tenantId),
          ]);
          solicitacao = conferirSolicitacao(proposta.argumentos ?? {}, escopo, empresas, assuntos);
        }

        const valor = r.valor || (solicitacao ? "Preparei a solicitação. Revise e envie no botão abaixo." : "Não consegui montar uma resposta.");
        const { texto, botoes } = separarBotoes(primeiraResposta ? valor : semCumprimento(valor), resultados);
        enviar({ tipo: "resposta", texto, botoes, solicitacao, truncada: r.truncado });
      } catch (err) {
        console.error("[ceci-portal]", conta.tenantId, err);
        enviar({ tipo: "erro", texto: erroParaOCliente(err) });
      }
    },
  };
}
