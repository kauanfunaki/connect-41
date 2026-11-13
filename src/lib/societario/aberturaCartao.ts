// O cartão "Abrir processo" da Ceci — a parte da abertura que o cliente lê
// (13/11/2026, Controle interno melhoria-661). Saiu de `abertura.ts` porque o
// cartão entra no chat de IA, que está no menu de toda tela (ChatDeIA →
// DetalhesDaProposta → `ia/chat/regras.ts`), e `abertura.ts` traz o zod dos
// argumentos do modelo: ~110 KB no JS de todas as telas. Aqui não entra zod; o
// resumo gravado na proposta é conferido à mão, campo a campo, com a mesma
// regra do esquema que havia.

import { PRIORIDADE_LABEL, ehPrioridade } from "./prioridade";

/** A ferramenta de escrita da Ceci do Societário — vira o cartão "Abrir processo". */
export const ABRIR_PROCESSO = "propor_abrir_processo";

/** "2026-11-20" → "20/11/2026". O que não for data volta como veio. */
export function dataLegivel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** O que o cartão mostra — nomes lidos do banco, não o texto do modelo. */
export type ResumoDaAbertura = {
  tipo: string;
  versao: number;
  etapas: number;
  empresa: string;
  documento: string | null;
  responsavel: string | null;
  /** Os rótulos, na ordem do roteiro. */
  jaTemos: string[];
  aPedir: string[];
  /** Processos do mesmo tipo, nesta empresa, que ainda não terminaram. */
  emAndamento: number;
};

const ehTexto = (v: unknown): v is string => typeof v === "string";
const ehTextoOuNulo = (v: unknown): v is string | null => v === null || typeof v === "string";
/** Como o `z.number()` do zod 4: número finito (nem NaN, nem infinito). */
const ehNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function ehListaDeTexto(v: unknown): v is string[] {
  if (!Array.isArray(v)) return false;
  // Pelo índice, e não com `every`: buraco na lista é `undefined`, que não é texto.
  for (let i = 0; i < v.length; i++) if (typeof v[i] !== "string") return false;
  return true;
}

/** O resumo gravado na proposta, ou nulo se ela não passou pela conferência (ou veio torta). */
export function resumoDaProposta(argumentos: Record<string, unknown> | undefined): ResumoDaAbertura | null {
  const r = argumentos?.resumo;
  if (typeof r !== "object" || r === null || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const { tipo, versao, etapas, empresa, documento, responsavel, jaTemos, aPedir, emAndamento } = o;
  if (
    !ehTexto(tipo) ||
    !ehNumero(versao) ||
    !ehNumero(etapas) ||
    !ehTexto(empresa) ||
    !ehTextoOuNulo(documento) ||
    !ehTextoOuNulo(responsavel) ||
    !ehListaDeTexto(jaTemos) ||
    !ehListaDeTexto(aPedir) ||
    !ehNumero(emAndamento)
  ) {
    return null;
  }
  // Só os campos do resumo, em listas novas — o que o esquema devolvia.
  return { tipo, versao, etapas, empresa, documento, responsavel, jaTemos: [...jaTemos], aPedir: [...aPedir], emAndamento };
}

const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A frase do cartão: "Abrir processo de Alteração contratual para Padaria Modelo". */
export function descreverAbertura(argumentos: Record<string, unknown> | undefined): string {
  const r = resumoDaProposta(argumentos);
  return r ? `Abrir processo de ${r.tipo} para ${r.empresa}` : "Abrir um processo no Societário";
}

export type DetalheDoCartao = {
  rotulo: string;
  texto: string;
  /** Texto de várias linhas: quebra como veio e rola dentro do cartão. */
  longo?: boolean;
  /** Algo para conferir antes do sim. */
  atencao?: boolean;
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/**
 * As linhas embaixo da frase: o que a pessoa confere antes de abrir. A
 * duplicata vem primeiro — é o erro mais caro de deixar passar ("pedi duas
 * vezes, abriu dois").
 */
export function detalhesDaAbertura(argumentos: Record<string, unknown> | undefined): DetalheDoCartao[] {
  const a = argumentos ?? {};
  const r = resumoDaProposta(a);
  if (!r) return [{ rotulo: "Atenção", texto: "Esta proposta não foi conferida — peça à Ceci para montar de novo.", atencao: true }];

  const prioridade = textoDe(a.prioridade);
  const prazo = textoDe(a.prazo);
  const titulo = textoDe(a.titulo);
  const pedido = textoDe(a.pedidoAoCliente);
  const total = r.jaTemos.length + r.aPedir.length;

  const checklist =
    total === 0
      ? "O roteiro não tem checklist."
      : r.jaTemos.length === 0
        ? `Nenhum dos ${total} itens está com o escritório ainda.`
        : `${r.jaTemos.length} de ${total} já com o escritório: ${r.jaTemos.join("; ")}.`;

  const semPedido =
    r.aPedir.length === 0
      ? "Nada a pedir — o escritório já tem tudo o que o roteiro lista."
      : `Não mandar. ${plural(r.aPedir.length, "item fica", "itens ficam")} sem pedido ao cliente.`;

  return [
    ...(r.emAndamento > 0
      ? [{ rotulo: "Atenção", texto: `Já há ${plural(r.emAndamento, "processo", "processos")} de ${r.tipo} em andamento nesta empresa.`, atencao: true }]
      : []),
    { rotulo: "Empresa", texto: r.documento ? `${r.empresa} · ${r.documento}` : r.empresa },
    { rotulo: "Tipo", texto: `${r.tipo} — roteiro versão ${r.versao}, ${plural(r.etapas, "etapa", "etapas")}` },
    ...(titulo ? [{ rotulo: "Título", texto: titulo }] : []),
    { rotulo: "Responsável", texto: r.responsavel ?? "Sem responsável" },
    { rotulo: "Prioridade", texto: ehPrioridade(prioridade) ? PRIORIDADE_LABEL[prioridade] : "Normal" },
    { rotulo: "Prazo combinado", texto: prazo ? dataLegivel(prazo) : "Sem prazo combinado" },
    { rotulo: "Checklist", texto: checklist },
    pedido ? { rotulo: "Pedido ao cliente", texto: pedido, longo: true } : { rotulo: "Pedido ao cliente", texto: semPedido },
  ];
}
