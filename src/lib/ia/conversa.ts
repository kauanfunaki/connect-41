// A conversa com ferramentas — o laço, e a tradução dele para cada provedor.
//
// `src/lib/ai.ts` faz chamadas de uma ida só: manda o prompt, recebe o texto,
// acabou. Um agente com ferramentas é outra coisa — o modelo pede, a gente
// executa, devolve, ele pede de novo — e é isso que mora aqui.
//
// As regras que governam o laço são de `laco.ts` e `ferramentas.ts`, e estão
// testadas lá. Este arquivo tem duas metades:
//
// - `rodarLaco`, que não sabe de provedor nenhum: conta rodadas, soma uso,
//   checa allowlist, transforma escrita em proposta, cerca o resultado;
// - um **adaptador por provedor**, que só traduz formato. Anthropic (aqui):
//   `tool_use` na resposta, `tool_result` na volta. OpenAI (em
//   `conversa-openai.ts`): `function_call` na saída, `function_call_output` na
//   entrada.
//
// ─── Por que dois provedores, desde 15/09/2026 ──────────────────────────────
//
// A primeira versão era só Anthropic, com a justificativa de que um laço sem
// consumidor é onde bug mora quieto. O consumidor chegou: a 41 roda com chave
// OpenAI, e o atendente de candidato do WhatsApp e o assistente do Societário
// usam ferramentas. A separação em adaptador é o que garante que as regras do
// laço continuem num lugar só — um segundo laço copiado divergiria na primeira
// correção feita num e esquecida no outro.

import Anthropic from "@anthropic-ai/sdk";
import type { AgenteDef } from "@/lib/ia/catalogo";
import { usoAnthropic } from "@/lib/ia/uso";
import {
  ferramentasDoAgente,
  podeUsarFerramenta,
  viraProposta,
  AVISO_DE_PROPOSTA,
  type ContextoDaFerramenta,
  type FerramentaDef,
  type PropostaDeEscrita,
} from "@/lib/ia/ferramentas";
import { registrarTodasAsFerramentas } from "@/lib/ia/registro";
import {
  decidirProximoPasso,
  somarUsos,
  resultadoParaOModelo,
  MOTIVO_DA_TRUNCAGEM,
  type ResultadoDoLaco,
} from "@/lib/ia/laco";
import type { UsoDeTokens } from "@/lib/ia/custo";

// ─── A parte agnóstica ─────────────────────────────────────────────────────

/** Um pedido de ferramenta, já fora do formato do provedor. */
export type PedidoDeFerramenta = {
  /** O id de pareamento do provedor (`tool_use_id` / `call_id`). */
  id: string;
  nome: string;
  /**
   * Os argumentos, ou o motivo de não haver argumentos legíveis. A OpenAI
   * manda JSON em string, e JSON de modelo pode vir quebrado — isso volta ao
   * modelo como erro de ferramenta, não como exceção.
   */
  argumentos: Record<string, unknown> | { invalido: string };
};

/** O que uma rodada produziu, no formato comum. */
export type RodadaDoModelo = {
  texto: string;
  pedidos: PedidoDeFerramenta[];
  uso: UsoDeTokens | null;
};

/** A resposta a um pedido, pronta para o adaptador devolver ao modelo. */
export type RespostaAoPedido = { id: string; conteudo: string; erro: boolean };

/**
 * O que cada provedor precisa saber fazer. O adaptador guarda o próprio
 * histórico, porque é ele que conhece o formato em que o histórico existe.
 */
export type AdaptadorDeProvedor = {
  /** Uma ida ao provedor com o histórico atual. */
  rodada(): Promise<RodadaDoModelo>;
  /** Acrescenta ao histórico a última rodada e as respostas aos pedidos dela. */
  devolver(respostas: RespostaAoPedido[]): void;
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
export async function rodarLaco(
  adaptador: AdaptadorDeProvedor,
  def: AgenteDef,
  ctx: ContextoDaFerramenta
): Promise<ResultadoDoLaco<string>> {
  const usos: (UsoDeTokens | null)[] = [];
  const propostas: PropostaDeEscrita[] = [];
  let rodadas = 0;
  let texto = "";

  for (;;) {
    const r = await adaptador.rodada();

    rodadas++;
    usos.push(r.uso);

    // O texto da rodada mais recente é o que vale: se o modelo pedir mais
    // ferramenta, o que ele escreveu antes era raciocínio parcial, não resposta.
    if (r.texto) texto = r.texto;

    const passo = decidirProximoPasso({ rodadas, usos, pediuFerramenta: r.pedidos.length > 0 });

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

    const respostas: RespostaAoPedido[] = [];
    for (const pedido of r.pedidos) {
      respostas.push(await atenderPedido(pedido, def, ctx, propostas));
    }
    adaptador.devolver(respostas);
  }
}

/**
 * Atende um pedido de ferramenta — ou recusa, sem derrubar a conversa.
 *
 * Recusa volta como erro de ferramenta, e não como exceção, de propósito: o
 * modelo pediu algo que não pode, e dizer isso a ele costuma fazê-lo seguir
 * por outro caminho. Explodir aqui jogaria fora as rodadas já pagas por causa
 * de um pedido que o próprio laço estava preparado para negar.
 */
async function atenderPedido(
  pedido: PedidoDeFerramenta,
  def: AgenteDef,
  ctx: ContextoDaFerramenta,
  propostas: PropostaDeEscrita[]
): Promise<RespostaAoPedido> {
  const id = pedido.id;

  const veredito = podeUsarFerramenta(def, pedido.nome);
  if (!veredito.pode) {
    return { id, erro: true, conteudo: veredito.motivo };
  }

  if ("invalido" in pedido.argumentos && typeof pedido.argumentos.invalido === "string") {
    return {
      id,
      erro: true,
      conteudo: `Os argumentos não são um JSON válido: ${pedido.argumentos.invalido}`,
    };
  }
  const argumentos = pedido.argumentos as Record<string, unknown>;

  const { def: fdef, executar } = veredito.ferramenta;

  // Escrita nunca executa. Vira proposta, e o modelo é avisado de que nada foi
  // gravado — ver o cabeçalho de `ferramentas.ts`. A única exceção é o
  // `registro` que está em `REGISTROS_AUTOMATICOS`.
  if (viraProposta(fdef, executar) || !executar) {
    propostas.push({ ferramenta: fdef.nome, descricao: fdef.descricao, argumentos });
    return { id, erro: false, conteudo: AVISO_DE_PROPOSTA };
  }

  try {
    const valor = await executar(argumentos, ctx);
    return { id, erro: false, conteudo: resultadoParaOModelo(valor) };
  } catch (err) {
    // A mensagem da exceção pode carregar dado do banco. Volta como erro, e
    // portanto dentro da mesma cerca que qualquer outro resultado.
    const motivo = err instanceof Error ? err.message : String(err);
    console.error("[ia] ferramenta falhou", fdef.nome, err);
    return { id, erro: true, conteudo: resultadoParaOModelo(`Falhou: ${motivo}`) };
  }
}

/** As ferramentas do agente, com o registro garantidamente carregado. */
export function ferramentasParaOLaco(def: AgenteDef): FerramentaDef[] {
  registrarTodasAsFerramentas();
  return ferramentasDoAgente(def);
}

// ─── Adaptador Anthropic ───────────────────────────────────────────────────

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

/** A conversa com ferramentas contra o Anthropic. */
export async function conversarComFerramentas(
  p: ParametrosDaConversa
): Promise<ResultadoDoLaco<string>> {
  const tools = ferramentasParaOLaco(p.def).map((f) => ({
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
  let ultima: Anthropic.Message | null = null;

  const adaptador: AdaptadorDeProvedor = {
    async rodada() {
      const response = await chamarModelo(messages);
      ultima = response;
      return {
        texto: response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim(),
        pedidos: response.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
          .map((b) => ({
            id: b.id,
            nome: b.name,
            argumentos: (b.input ?? {}) as Record<string, unknown>,
          })),
        uso: usoAnthropic(response.usage),
      };
    },
    devolver(respostas) {
      // O turno do assistente entra no histórico com os blocos de pedido, e a
      // resposta vem como um turno de usuário com os resultados. O provedor
      // recusa qualquer outra forma, e com razão — é o pareamento por
      // `tool_use_id` que impede resultado trocado entre duas ferramentas
      // pedidas na mesma rodada.
      messages.push({ role: "assistant", content: ultima!.content });
      messages.push({
        role: "user",
        content: respostas.map(
          (r): Anthropic.ToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: r.id,
            ...(r.erro ? { is_error: true } : {}),
            content: r.conteudo,
          })
        ),
      });
    },
  };

  return rodarLaco(adaptador, p.def, p.ctx);
}
