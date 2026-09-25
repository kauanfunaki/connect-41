// O miolo da pergunta do chat de IA do canto da tela.
//
// A rota `/api/ia/chat` passa por aqui, e a bateria de testes dos agentes
// (script) também — é assim que o teste exercita o mesmo caminho que a tela, e
// não uma cópia dele.
//
// A rota responde em NDJSON — uma linha JSON por evento — para a tela mostrar o
// passo ("consultando a fila…") enquanto o agente trabalha. Uma pergunta com
// duas ou três consultas leva de 10 a 40 s; sem sinal de vida, parece travado.
//
// Eventos: `conversa` (id, logo no início), `passo`, `mensagem` (a pergunta e a
// resposta gravadas) e `erro`. A resposta não vem token a token nesta versão:
// o laço com ferramentas só sabe o texto final quando o modelo para de pedir
// consulta.

import type { AuthContext } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { conversarComAgente } from "@/lib/ai";
import { logAudit } from "@/lib/audit";
import {
  agentesDoChat,
  contextoParaOAgente,
  escopoDoAgente,
  podeAbrirTransferencia,
  rotularPropostas,
  setorDaTransferencia,
  sistemaDoChat,
  GUARDA_DO_ENCAMINHADO,
  GUARDA_DO_PROPRIO_SETOR,
  type AgenteDoChat,
} from "@/lib/ia/chat/agentes";
import {
  apagarConversasVencidas,
  conversaParaPerguntar,
  gravarMensagem,
  historicoDaConversa,
  perguntasDeHoje,
} from "@/lib/ia/chat/conversas";
import {
  contextoDaTela,
  descricaoDaTransferencia,
  encaminhamentoPedido,
  IA_DO_SETOR,
  LIMITE_DE_PERGUNTAS_POR_DIA,
  MAX_CARACTERES_DA_PERGUNTA,
  textoDoPasso,
  type PropostaGravada,
} from "@/lib/ia/chat/regras";

export type EventoDoChat =
  | { tipo: "conversa"; id: string }
  | { tipo: "passo"; texto: string }
  | { tipo: "mensagem"; mensagem: Awaited<ReturnType<typeof gravarMensagem>> }
  | { tipo: "erro"; texto: string };

export type PedidoDoChat = { conversaId?: unknown; agentCode?: unknown; pergunta?: unknown; caminho?: unknown };

export type PreparoDaPergunta =
  | { erro: string; status: number }
  | { executar: (enviar: (e: EventoDoChat) => void) => Promise<void> };

/**
 * Confere o pedido e prepara a pergunta. Recusa antes de qualquer gasto; se
 * passar, devolve `executar`, que grava, pergunta ao agente (e ao do outro
 * setor, se ele encaminhar) e emite os eventos.
 *
 * `limiteDiario` só existe para a bateria de testes, que faz mais perguntas
 * num dia do que uma pessoa pode; a rota nunca passa.
 */
export async function prepararPerguntaDoChat(
  ctx: AuthContext,
  corpo: PedidoDoChat,
  opcoes: { limiteDiario?: number } = {}
): Promise<PreparoDaPergunta> {
  if (!ctx.tenantId || !ctx.userId) return { erro: "Não autenticado.", status: 401 };
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const pergunta = typeof corpo.pergunta === "string" ? corpo.pergunta.trim() : "";
  if (!pergunta) return { erro: "Escreva a pergunta.", status: 400 };
  if (pergunta.length > MAX_CARACTERES_DA_PERGUNTA) return { erro: "Pergunta muito longa.", status: 400 };

  // O agente pedido tem de estar entre os que esta pessoa pode abrir agora —
  // mesma lista que desenhou o botão, recalculada aqui.
  const agentes = await agentesDoChat(ctx);
  if (agentes.length === 0) return { erro: "O chat de IA não está disponível para você.", status: 403 };

  const agora = new Date();
  const limite = opcoes.limiteDiario ?? LIMITE_DE_PERGUNTAS_POR_DIA;
  if ((await perguntasDeHoje(dono, agora)) >= limite) {
    return { erro: `Você chegou ao limite de ${limite} perguntas de hoje. Volta amanhã.`, status: 429 };
  }

  const conversaId = typeof corpo.conversaId === "string" && corpo.conversaId ? corpo.conversaId : null;
  const pedido = typeof corpo.agentCode === "string" ? corpo.agentCode : "";
  const agenteNovo = agentes.find((a) => a.code === pedido) ?? agentes[0]!;

  if (!conversaId) await apagarConversasVencidas(ctx.tenantId, agora);
  const conversa = await conversaParaPerguntar(dono, conversaId, agenteNovo.code, pergunta);
  if (!conversa) return { erro: "Conversa não encontrada.", status: 404 };
  // Conversa antiga continua com o agente dela — se ele saiu do alcance da
  // pessoa (setor trocado, agente desligado), a pergunta não passa.
  const agente = agentes.find((a) => a.code === conversa.agentCode);
  if (!agente) return { erro: "A IA desta conversa não está mais disponível para você. Comece uma nova.", status: 403 };

  const tela = contextoDaTela(typeof corpo.caminho === "string" ? corpo.caminho : "");
  const contexto = await contextoParaOAgente(ctx, agente.code, tela);
  const historico = await historicoDaConversa(conversa.id);

  const { labels } = await getSectorMaps(ctx.tenantId);
  const escopo = await escopoDoAgente(ctx, agente.code, Object.keys(labels));

  return {
    executar: async (enviar) => {
      enviar({ tipo: "conversa", id: conversa.id });
      const minha = await gravarMensagem({ conversaId: conversa.id, papel: "usuario", texto: pergunta, contexto: contexto?.rotulo });
      enviar({ tipo: "mensagem", mensagem: minha });

      /** Uma ida a um agente do chat, com o recorte e o contexto dele. */
      const perguntarA = async (alvo: AgenteDoChat, comHistorico: boolean, aviso: "encaminhada" | "proprio_setor" | null = null) => {
        const ctxDoAlvo = alvo.code === agente.code ? contexto : await contextoParaOAgente(ctx, alvo.code, tela);
        return conversarComAgente({
          tenantId: dono.tenantId,
          agentCode: alvo.code,
          system:
            sistemaDoChat(alvo.code) +
            (ctxDoAlvo ? `\n\n${ctxDoAlvo.texto}` : "") +
            (aviso === "encaminhada" ? GUARDA_DO_ENCAMINHADO : aviso === "proprio_setor" ? GUARDA_DO_PROPRIO_SETOR : ""),
          pergunta,
          historico: comHistorico ? historico : [],
          escopo: alvo.code === agente.code ? escopo : await escopoDoAgente(ctx, alvo.code, Object.keys(labels)),
          contexto: { userId: dono.userId, entityType: "chat", entityId: conversa.id },
          aoUsarFerramenta: (nome) => enviar({ tipo: "passo", texto: textoDoPasso(nome) }),
        });
      };
      const propostasDe = (r: Awaited<ReturnType<typeof perguntarA>>): PropostaGravada[] =>
        r.propostas
          .filter((p) => p.ferramenta !== "encaminhar_pergunta")
          .map((p) => ({ ferramenta: p.ferramenta, descricao: p.descricao, argumentos: p.argumentos ?? {} }));

      try {
        let r = await perguntarA(agente, true);
        let pedido = encaminhamentoPedido(r.propostas.map((p) => ({ ferramenta: p.ferramenta, argumentos: p.argumentos ?? {} })));
        // A IA "encaminhou" para o próprio setor (visto na bateria de 25/09: a
        // Ajuda respondeu só "pergunta encaminhada para o setor ajuda"). Em vez
        // de devolver a frase vazia, pergunta de novo, avisando que é com ela.
        if (pedido && IA_DO_SETOR[pedido.setor] === agente.code) {
          r = await perguntarA(agente, true, "proprio_setor");
          pedido = null;
        }

        // ─── Orquestrador ───────────────────────────────────────────────
        // A IA disse que a pergunta é de outro setor. Se a pessoa tem a IA
        // daquele setor, a pergunta vai para ela; se não tem (ou o setor não
        // tem IA), o cartão oferece abrir uma transferência.
        const codigoDoDestino = pedido ? IA_DO_SETOR[pedido.setor] : null;
        const destino =
          pedido && codigoDoDestino && codigoDoDestino !== agente.code
            ? agentes.find((a) => a.code === codigoDoDestino) ?? null
            : null;
        const extras: PropostaGravada[] = [];
        if (pedido && !destino && codigoDoDestino !== agente.code && podeAbrirTransferencia(ctx)) {
          const setor = await setorDaTransferencia(ctx.tenantId, pedido.setor, Object.keys(labels));
          if (setor) {
            extras.push({
              ferramenta: "abrir_transferencia",
              descricao: "Abrir uma transferência",
              argumentos: { setor, descricao: descricaoDaTransferencia(pergunta, pedido.motivo) },
              alvo: labels[setor] ?? setor,
            });
          }
        }

        const resposta = await gravarMensagem({
          conversaId: conversa.id,
          papel: "assistente",
          texto: r.valor || (pedido ? "Essa pergunta é de outro setor." : "Não consegui montar uma resposta."),
          propostas: [...(await rotularPropostas(dono.tenantId, propostasDe(r))), ...extras],
          runId: (r as { runId?: string }).runId ?? null,
          truncada: r.truncado,
        });
        enviar({ tipo: "mensagem", mensagem: resposta });

        if (pedido) {
          await logAudit({
            tenantId: dono.tenantId,
            userId: dono.userId,
            action: pedido.setor === "outro" ? "ia.chat.sem_ia" : "ia.chat.encaminhada",
            entityType: "AgentConversation",
            entityId: conversa.id,
            // Só os setores e o desfecho — o painel do orquestrador conta,
            // nunca lê a pergunta (a conversa é da pessoa).
            metadata: {
              de: agente.code,
              para: pedido.setor,
              desfecho: destino ? "respondida" : extras.length > 0 ? "transferencia_oferecida" : "sem_destino",
            },
          });
        }

        if (destino) {
          enviar({ tipo: "passo", texto: `Passando para a ${destino.titulo}…` });
          const r2 = await perguntarA(destino, false, "encaminhada");
          const resposta2 = await gravarMensagem({
            conversaId: conversa.id,
            papel: "assistente",
            texto: r2.valor || "Não consegui montar uma resposta.",
            propostas: await rotularPropostas(dono.tenantId, propostasDe(r2)),
            runId: (r2 as { runId?: string }).runId ?? null,
            truncada: r2.truncado,
            contexto: `Respondido pela ${destino.titulo}`,
          });
          enviar({ tipo: "mensagem", mensagem: resposta2 });
        }
      } catch (err) {
        console.error("[chat-ia]", agente.code, err);
        const texto = err instanceof Error ? err.message : "Erro ao falar com a IA.";
        const falha = await gravarMensagem({ conversaId: conversa.id, papel: "assistente", texto, falhou: true }).catch(() => null);
        if (falha) enviar({ tipo: "mensagem", mensagem: falha });
        else enviar({ tipo: "erro", texto });
      }
    },
  };
}
