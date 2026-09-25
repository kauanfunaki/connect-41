// A conversa com ferramentas, contra a Responses API da OpenAI.
//
// É só o adaptador: as regras (rodadas, teto de tokens, allowlist, escrita que
// vira proposta, cerca no resultado) são as mesmas de `rodarLaco`, em
// `conversa.ts`. Aqui mora a tradução de formato — e as decisões que só
// existem porque o formato é outro.
//
// Fetch cru, sem SDK — mesmo padrão das funções `*OpenAi` de `src/lib/ai.ts`.
// Formato conferido em developers.openai.com/api/docs/guides/function-calling
// em 15/09/2026.
//
// ─── `store: false` e o histórico reenviado, não `previous_response_id` ─────
//
// `previous_response_id` deixaria a requisição menor, mas exige `store: true`:
// a OpenAI guardaria a conversa do lado dela. O que passa por este laço é
// mensagem de candidato, dado de processo societário, retorno de ferramenta
// com nome e situação de pessoa — e não há motivo para deixar cópia disso
// num terceiro. Custo não muda: com ou sem id, o histórico entra como tokens
// de entrada em toda rodada. Então reenviamos os itens de saída inteiros
// (inclusive os de raciocínio, que sem `store` só voltam utilizáveis com
// `reasoning.encrypted_content`) e acrescentamos os `function_call_output`.
//
// ─── `strict` só quando o schema aguenta ────────────────────────────────────
//
// Strict mode exige `additionalProperties: false` e todo campo em `required`,
// em todo objeto do schema. As ferramentas atuais cumprem; uma futura que não
// cumpra seria recusada pela API com erro 400 e derrubaria o agente inteiro.
// Por isso a decisão é por ferramenta, conferindo o schema — ver
// `schemaParaStrict`.

import { usoOpenAi } from "@/lib/ia/uso";
import type { UsoDeTokens } from "@/lib/ia/custo";
import type { FerramentaDef } from "@/lib/ia/ferramentas";
import { normalizarHistorico, type ResultadoDoLaco } from "@/lib/ia/laco";
import {
  rodarLaco,
  ferramentasParaOLaco,
  type AdaptadorDeProvedor,
  type ParametrosDaConversa,
  type PedidoDeFerramenta,
} from "@/lib/ia/conversa";

export const URL_DA_RESPONSES_API = "https://api.openai.com/v1/responses";

/**
 * Folga de tokens de saída para o raciocínio, nos modelos que raciocinam.
 *
 * Nesses modelos, `max_output_tokens` conta raciocínio **e** texto. O
 * atendente do WhatsApp pede 800 pensando no tamanho da mensagem; sem folga,
 * o raciocínio come o limite e a resposta volta vazia — o que para o
 * candidato é pior que uma resposta cara. O tamanho do texto continua
 * contido por quem chama (ver `politica.maxCaracteres`).
 */
export const FOLGA_DE_RACIOCINIO = 2_048;

/**
 * Quantas vezes o limite cresce na segunda tentativa, quando a primeira voltou
 * **incompleta por limite e sem nada** — nem texto, nem pedido de ferramenta.
 *
 * Visto em 25/09 no atendente do WhatsApp: numa rodada depois de consultar a
 * vaga, o `gpt-5-nano` raciocinou até o limite (800 + 2.048) e devolveu vazio;
 * o candidato foi transferido para uma pessoa e ficou sem resposta. Repetir com
 * três vezes o limite custa frações de centavo nesse modelo, e só acontece
 * quando a alternativa é o silêncio.
 */
export const MULTIPLICADOR_DA_SEGUNDA_TENTATIVA = 3;

/** A primeira tentativa acabou no limite de tokens sem produzir nada utilizável? */
export function acabouNoLimiteSemNada(
  data: { status?: unknown; incomplete_details?: { reason?: unknown } | null },
  texto: string,
  pedidos: number
): boolean {
  return data.status === "incomplete" && data.incomplete_details?.reason === "max_output_tokens" && !texto && pedidos === 0;
}

/**
 * O modelo raciocina (e portanto aceita `reasoning.encrypted_content`)?
 *
 * Os legados `gpt-4*` não, e pedir o `include` a eles é erro. Todo o resto da
 * linha atual raciocina. Heurística por nome, deliberadamente conservadora do
 * lado de quem pode receber override de cliente.
 */
export function ehModeloDeRaciocinio(model: string): boolean {
  return !/^(gpt-4|gpt-3)/i.test(model.trim());
}

/**
 * O schema pronto para `strict: true`, ou `null` se ele não cumpre as regras.
 *
 * Único ajuste feito: objeto sem propriedade nenhuma e sem `required` ganha
 * `required: []` — é o mesmo schema, só explícito. Qualquer outra divergência
 * (campo opcional, `additionalProperties` ausente) devolve `null`, e a
 * ferramenta vai sem strict: reescrever o schema mudaria o que o modelo pode
 * mandar.
 */
export function schemaParaStrict(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
  const s = schema as Record<string, unknown>;
  const copia: Record<string, unknown> = { ...s };

  const tipos = Array.isArray(s.type) ? s.type : [s.type];
  if (tipos.includes("object") || "properties" in s) {
    if (s.additionalProperties !== false) return null;
    const props = s.properties;
    if (!props || typeof props !== "object" || Array.isArray(props)) return null;
    const chaves = Object.keys(props);
    const required = s.required ?? (chaves.length === 0 ? [] : undefined);
    if (!Array.isArray(required)) return null;
    if (!chaves.every((k) => required.includes(k))) return null;
    copia.required = required;

    const novas: Record<string, unknown> = {};
    for (const k of chaves) {
      const sub = schemaParaStrict((props as Record<string, unknown>)[k]);
      if (!sub) return null;
      novas[k] = sub;
    }
    copia.properties = novas;
  }

  if ("items" in s) {
    const itens = schemaParaStrict(s.items);
    if (!itens) return null;
    copia.items = itens;
  }
  for (const chave of ["anyOf", "oneOf", "allOf"] as const) {
    if (chave in s) {
      if (!Array.isArray(s[chave])) return null;
      const subs = (s[chave] as unknown[]).map(schemaParaStrict);
      if (subs.some((x) => x === null)) return null;
      copia[chave] = subs;
    }
  }
  return copia;
}

export function ferramentaOpenAi(f: FerramentaDef) {
  const strict = schemaParaStrict(f.parametros);
  return {
    type: "function" as const,
    name: f.nome,
    description: f.descricao,
    parameters: strict ?? f.parametros,
    strict: strict !== null,
  };
}

type ItemDaResponses = { type?: unknown; [campo: string]: unknown };

/** O texto final de uma resposta: os `output_text` das mensagens, juntos. */
function textoDaSaida(saida: ItemDaResponses[]): string {
  return saida
    .filter((i) => i.type === "message" && Array.isArray(i.content))
    .flatMap((i) => i.content as ItemDaResponses[])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
}

/** Uso das duas tentativas de uma rodada. Uso desconhecido de um lado não zera o outro. */
function somarUso(a: UsoDeTokens | null, b: UsoDeTokens | null): UsoDeTokens | null {
  if (!a) return b;
  if (!b) return a;
  return { entrada: a.entrada + b.entrada, saida: a.saida + b.saida };
}

/** Os argumentos de um `function_call` — string JSON, que pode vir quebrada. */
function lerArgumentos(bruto: unknown): PedidoDeFerramenta["argumentos"] {
  if (bruto === undefined || bruto === null || bruto === "") return {};
  if (typeof bruto !== "string") return { invalido: "argumentos ausentes" };
  try {
    const v: unknown = JSON.parse(bruto);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    return { invalido: "esperava um objeto" };
  } catch {
    return { invalido: bruto.slice(0, 200) };
  }
}

/** Erro HTTP da OpenAI com a mensagem dela, não o JSON cru. */
async function erroDaOpenAi(res: Response): Promise<Error> {
  const bruto = await res.text().catch(() => "");
  let mensagem = bruto;
  try {
    const j = JSON.parse(bruto) as { error?: { message?: unknown } };
    if (typeof j.error?.message === "string") mensagem = j.error.message;
  } catch {
    // Corpo não-JSON (proxy, HTML de erro): vai o texto como veio, cortado.
  }
  return new Error(
    `Falha ao consultar a OpenAI (HTTP ${res.status}): ${mensagem.slice(0, 500) || res.statusText}`
  );
}

/** A conversa com ferramentas contra a OpenAI. Mesmos parâmetros do Anthropic. */
export async function conversarComFerramentasOpenAi(
  p: Omit<ParametrosDaConversa, "chamarModelo">
): Promise<ResultadoDoLaco<string>> {
  const tools = ferramentasParaOLaco(p.def).map(ferramentaOpenAi);
  const raciocina = ehModeloDeRaciocinio(p.model);

  const itens: unknown[] = [
    ...normalizarHistorico(p.historico ?? []).map((t) => ({
      role: t.papel === "usuario" ? "user" : "assistant",
      content: t.texto,
    })),
    { role: "user", content: p.pergunta },
  ];
  let ultimaSaida: ItemDaResponses[] = [];

  const adaptador: AdaptadorDeProvedor = {
    async rodada() {
      const limite = (p.maxTokens ?? 4096) + (raciocina ? FOLGA_DE_RACIOCINIO : 0);
      const pedir = async (maxOutput: number) => {
        const res = await fetch(URL_DA_RESPONSES_API, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: p.model,
            instructions: p.system,
            input: itens,
            store: false,
            max_output_tokens: maxOutput,
            ...(tools.length > 0 ? { tools } : {}),
            ...(raciocina ? { include: ["reasoning.encrypted_content"] } : {}),
          }),
        });
        if (!res.ok) throw await erroDaOpenAi(res);
        return (await res.json()) as {
          status?: unknown;
          output?: unknown;
          usage?: unknown;
          error?: { message?: unknown } | null;
          incomplete_details?: { reason?: unknown } | null;
        };
      };

      let data = await pedir(limite);
      let usoDaPrimeira: ReturnType<typeof usoOpenAi> | null = null;
      {
        const saida0 = (Array.isArray(data.output) ? data.output : []) as ItemDaResponses[];
        const texto0 = textoDaSaida(saida0);
        const pedidos0 = saida0.filter((i) => i.type === "function_call").length;
        if (acabouNoLimiteSemNada(data, texto0, pedidos0)) {
          // O gasto da tentativa perdida também é gasto: soma no uso da rodada.
          usoDaPrimeira = usoOpenAi(data.usage);
          data = await pedir(limite * MULTIPLICADOR_DA_SEGUNDA_TENTATIVA);
        }
      }
      if (data.status === "failed") {
        const motivo = typeof data.error?.message === "string" ? data.error.message : "sem detalhe";
        throw new Error(`A OpenAI não concluiu a resposta: ${motivo}`);
      }

      const saida = (Array.isArray(data.output) ? data.output : []) as ItemDaResponses[];
      ultimaSaida = saida;

      const texto = textoDaSaida(saida);

      const pedidos: PedidoDeFerramenta[] = saida
        .filter((i) => i.type === "function_call")
        .map((i) => ({
          id: String(i.call_id ?? ""),
          nome: String(i.name ?? ""),
          argumentos: lerArgumentos(i.arguments),
        }));

      // `input_tokens` já inclui os `cached_tokens`. O custo trata tudo como
      // entrada cheia, o que superestima um pouco — o lado seguro de um teto.
      const uso = usoOpenAi(data.usage);
      return { texto, pedidos, uso: usoDaPrimeira ? somarUso(usoDaPrimeira, uso) : uso };
    },
    devolver(respostas) {
      // Os itens de saída voltam inteiros e na ordem: é o que mantém o
      // raciocínio pareado com o `function_call` que ele produziu.
      itens.push(...ultimaSaida);
      for (const r of respostas) {
        itens.push({
          type: "function_call_output",
          call_id: r.id,
          // Não há `is_error` neste formato; o erro é declarado no texto.
          output: r.erro ? `ERRO: ${r.conteudo}` : r.conteudo,
        });
      }
    },
  };

  return rodarLaco(adaptador, p.def, p.ctx, p.aoUsarFerramenta);
}
