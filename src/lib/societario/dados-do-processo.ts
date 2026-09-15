// Os dados de cabeçalho de um processo: título, responsável, prioridade e prazo
// combinado. Lidos do formulário de abrir e do de editar pela mesma função, para
// as duas telas não aceitarem coisas diferentes.

import { lerDataDoCampo } from "./datas";
import { diasAte } from "./licencas";
import { ehPrioridade, type Prioridade } from "./prioridade";

export const MAX_TITULO = 160;

export type CamposDoProcesso = {
  titulo?: unknown;
  responsavelId?: unknown;
  prioridade?: unknown;
  prazoCombinado?: unknown;
};

export type DadosDoProcesso = {
  titulo: string | null;
  responsavelId: string | null;
  prioridade: Prioridade;
  prazoCombinado: Date | null;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Valida os dados de cabeçalho.
 *
 * `responsaveisValidos` são os ids de quem pode responder pelo processo — membros
 * do Societário e admins. Conferir aqui, e não só oferecer a lista na tela, é o
 * que impede um id de outro tenant chegar pelo formulário.
 */
export function lerDadosDoProcesso(
  campos: CamposDoProcesso,
  responsaveisValidos: ReadonlySet<string>
): { ok: true; dados: DadosDoProcesso } | { ok: false; erro: string } {
  const titulo = texto(campos.titulo);
  if (titulo.length > MAX_TITULO) {
    return { ok: false, erro: `O título passa de ${MAX_TITULO} caracteres.` };
  }

  const responsavelId = texto(campos.responsavelId);
  if (responsavelId && !responsaveisValidos.has(responsavelId)) {
    return { ok: false, erro: "O responsável precisa ser alguém do Societário." };
  }

  const prioridadeBruta = texto(campos.prioridade);
  const prioridade = prioridadeBruta || "NORMAL";
  if (!ehPrioridade(prioridade)) return { ok: false, erro: "Prioridade inválida." };

  const prazo = lerDataDoCampo(campos.prazoCombinado);
  if (!prazo.ok) return { ok: false, erro: "Prazo combinado inválido." };

  return {
    ok: true,
    dados: {
      titulo: titulo || null,
      responsavelId: responsavelId || null,
      prioridade,
      prazoCombinado: prazo.data,
    },
  };
}

export type SituacaoDoPrazoCombinado = "vencido" | "hoje" | "proximo" | "folga";

/**
 * O prazo combinado com o cliente, em palavras.
 *
 * É outra régua que o prazo previsto do tipo: aquele conta dias úteis contra o
 * que o setor declara para Constituição, Alteração e Baixa; este é a data que
 * alguém prometeu. Os dois aparecem, e um não substitui o outro.
 */
export function prazoCombinado(
  dueAt: Date,
  hoje: Date
): { dias: number; situacao: SituacaoDoPrazoCombinado; texto: string } {
  const dias = diasAte(dueAt, hoje);
  if (dias < 0) {
    return { dias, situacao: "vencido", texto: dias === -1 ? "prazo venceu ontem" : `prazo venceu há ${-dias} dias` };
  }
  if (dias === 0) return { dias, situacao: "hoje", texto: "prazo vence hoje" };
  if (dias === 1) return { dias, situacao: "proximo", texto: "prazo vence amanhã" };
  if (dias <= 3) return { dias, situacao: "proximo", texto: `prazo em ${dias} dias` };
  return { dias, situacao: "folga", texto: `prazo em ${dias} dias` };
}
