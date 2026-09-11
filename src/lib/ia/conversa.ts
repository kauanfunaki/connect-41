// A conversa com ferramentas, contra a API do Anthropic.
//
// `src/lib/ai.ts` faz chamadas de uma ida só: manda o prompt, recebe o texto,
// acabou. Um agente com ferramentas é outra coisa — o modelo pede, a gente
// executa, devolve, ele pede de novo — e é isso que mora aqui.
//
// As regras que governam o laço são de `laco.ts` e `ferramentas.ts`, e estão
// testadas lá. Este arquivo é a tradução delas para o formato de blocos do
// provedor: `tool_use` na resposta, `tool_result` na volta.
//
// ─── Só Anthropic, por enquanto ─────────────────────────────────────────────
//
// A Responses API da OpenAI tem tool-calling, e o dia em que um cliente do
// Connect usar OpenAI com agente de ferramentas, isto ganha um irmão. Escrever
// os dois agora seria escrever um sem nenhum consumidor para exercitá-lo — e
// código de laço sem uso é onde bug mora quieto.

import Anthropic from "@anthropic-ai/sdk";
import type { AgenteDef } from "@/lib/ia/catalogo";
import { usoAnthropic } from "@/lib/ia/uso";
import {
  ferramentasDoAgente,
  podeUsarFerramenta,
  AVISO_DE_PROPOSTA,
  type ContextoDaFerramenta,
  type PropostaDeEscrita,
} from "@/lib/ia/ferramentas";
import {
  decidirProximoPasso,
  somarUsos,
  resultadoParaOModelo,
  MOTIVO_DA_TRUNCAGEM,
  type ResultadoDoLaco,
} from "@/lib/ia/laco";
import type { UsoDeTokens } from "@/lib/ia/custo";

/**
 * Uma ida ao provedor. Injetável **só para teste**.
 *
 * Sem isso, exercitar o laço exigiria rede e chave — e as regras que mais
 * importam aqui (truncar, somar uso das rodadas, recusar ferramenta de outro
 * agente, não executar escrita) são justamente as que ninguém quer descobrir
 * quebradas em produção, com a conta correndo.
 */
export type ChamadaAoModelo = (
  messages: Anthropic.MessageParam[]
) => Promise<Anthropic.Message>;

export type ParametrosDaConversa = {
  apiKey: string;
  model: string;
  def: AgenteDef;
  system: string;
  pergunta: string;
  maxTokens?: number;
  ctx: ContextoDaFerramenta;
  /** Só teste passa. Em produção o laço fala com o Anthropic. */
  chamarModelo?: ChamadaAoModelo;
};

/**
 * Roda a conversa até o modelo responder ou bater um limite.
 *
 * ─── Ao truncar, NÃO chama de novo ──────────────────────────────────────────
 *
 * A tentação é fazer uma última ida sem ferramentas, para arrancar uma resposta
 * fechada. Ela é cara justamente na hora errada: essa rodada carrega o
 * histórico inteiro, e é a mais pesada de todas. Um teto que gasta mais quando
 * é atingido não é teto.
 *
 * Então o que volta é o que existe — o texto que o modelo já tinha escrito,
 * possivelmente vazio — com `truncado: true`. Quem chama mostra o aviso.
 */
export async function conversarComFerramentas(
  p: ParametrosDaConversa
): Promise<ResultadoDoLaco<string>> {
  const ferramentas = ferramentasDoAgente(p.def);

  const tools = ferramentas.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.parametros as Anthropic.Tool.InputSchema,
  }));

  const chamarModelo: ChamadaAoModelo =
    p.chamarModelo ??
    ((messages) => {
      const client = new Anthropic({ apiKey: p.apiKey });
      return client.messages.create({
        model: p.model,
        max_tokens: p.maxTokens ?? 4096,
        system: p.system,
        ...(tools.length > 0 ? { tools } : {}),
        messages,
      });
    });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: p.pergunta }];
  const usos: (UsoDeTokens | null)[] = [];
  const propostas: PropostaDeEscrita[] = [];
  let rodadas = 0;
  let texto = "";

  for (;;) {
    const response = await chamarModelo(messages);

    rodadas++;
    usos.push(usoAnthropic(response.usage));

    // O texto da rodada mais recente é o que vale: se o modelo pedir mais
    // ferramenta, o que ele escreveu antes era raciocínio parcial, não resposta.
    const textoDaRodada = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (textoDaRodada) texto = textoDaRodada;

    const pedidos = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const passo = decidirProximoPasso({ rodadas, usos, pediuFerramenta: pedidos.length > 0 });

    if (passo.tipo === "concluir") {
      return { valor: texto, uso: somarUsos(usos), rodadas, truncado: false, propostas };
    }
    if (passo.tipo === "truncar") {
      return {
        valor: texto || MOTIVO_DA_TRUNCAGEM[passo.motivo],
        uso: somarUsos(usos),
        rodadas,
        truncado: true,
        propostas,
      };
    }

    // Continuar: o turno do assistente entra no histórico com os blocos de
    // pedido, e a resposta vem como um turno de usuário com os resultados. O
    // provedor recusa qualquer outra forma, e com razão — é o pareamento por
    // `tool_use_id` que impede resultado trocado entre duas ferramentas pedidas
    // na mesma rodada.
    messages.push({ role: "assistant", content: response.content });

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const pedido of pedidos) {
      resultados.push(await atenderPedido(pedido, p, propostas));
    }
    messages.push({ role: "user", content: resultados });
  }
}

/**
 * Atende um pedido de ferramenta — ou recusa, sem derrubar a conversa.
 *
 * Recusa volta como `is_error`, e não como exceção, de propósito: o modelo
 * pediu algo que não pode, e dizer isso a ele costuma fazê-lo seguir por outro
 * caminho. Explodir aqui jogaria fora as rodadas já pagas por causa de um
 * pedido que o próprio laço estava preparado para negar.
 */
async function atenderPedido(
  pedido: Anthropic.ToolUseBlock,
  p: ParametrosDaConversa,
  propostas: PropostaDeEscrita[]
): Promise<Anthropic.ToolResultBlockParam> {
  const base = { type: "tool_result" as const, tool_use_id: pedido.id };
  const argumentos = (pedido.input ?? {}) as Record<string, unknown>;

  const veredito = podeUsarFerramenta(p.def, pedido.name);
  if (!veredito.pode) {
    return { ...base, is_error: true, content: veredito.motivo };
  }

  const { def: fdef, executar } = veredito.ferramenta;

  // Escrita nunca executa. Vira proposta, e o modelo é avisado de que nada foi
  // gravado — ver o cabeçalho de `ferramentas.ts`.
  if (fdef.natureza === "escrita" || !executar) {
    propostas.push({ ferramenta: fdef.nome, descricao: fdef.descricao, argumentos });
    return { ...base, content: AVISO_DE_PROPOSTA };
  }

  try {
    const valor = await executar(argumentos, p.ctx);
    return { ...base, content: resultadoParaOModelo(valor) };
  } catch (err) {
    // A mensagem da exceção pode carregar dado do banco. Volta como erro, e
    // portanto dentro da mesma cerca que qualquer outro resultado.
    const motivo = err instanceof Error ? err.message : String(err);
    console.error("[ia] ferramenta falhou", fdef.nome, err);
    return { ...base, is_error: true, content: resultadoParaOModelo(`Falhou: ${motivo}`) };
  }
}
