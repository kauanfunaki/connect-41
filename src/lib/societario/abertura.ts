// A abertura de processo do Societário — a parte pura (09/11/2026).
//
// Duas portas abrem processo: a abertura guiada (`/processos/novo`) e o cartão
// "Abrir processo" da Ceci, quando a pessoa escreve no chat algo como "abrir
// alteração de endereço da empresa X, prazo dia 20, responsável a Ana". As
// duas gravam pela mesma função, `abrirProcessoNoServidor`
// (`aberturaServidor.ts`).
//
// Aqui fica o que não precisa de banco — e por isso entra também no cartão do
// chat, que é componente de cliente: os argumentos da proposta (zod), a
// conferência deles contra o que o banco devolveu e as frases do cartão.

import { z } from "zod";
import { formatCnpj, formatCpf } from "@/lib/format";
import { MAX_TITULO } from "./dados-do-processo";
import { lerDataDoCampo } from "./datas";
import { PRIORIDADES, PRIORIDADE_LABEL, ehPrioridade } from "./prioridade";

/** A ferramenta de escrita da Ceci do Societário — vira o cartão "Abrir processo". */
export const ABRIR_PROCESSO = "propor_abrir_processo";

/** O tamanho do pedido ao cliente — o mesmo teto da abertura guiada. */
export const MAX_PEDIDO = 5000;

/** Teto da lista de "já temos": um roteiro real tem dezenas de itens, não centenas. */
const MAX_ITENS = 200;

/**
 * As empresas em que a abertura abre processo. A tela só lista estas no seletor;
 * a Ceci confere o mesmo, porque a lista dela vem de `buscar_empresa`, que acha
 * também as inativas.
 */
export const SITUACOES_QUE_ABREM = ["ACTIVE", "PROSPECT"] as const;

const SITUACAO_DA_EMPRESA: Readonly<Record<string, string>> = {
  ACTIVE: "ativa",
  PROSPECT: "prospecto",
  INACTIVE: "inativa",
  CHURNED: "cancelada",
};

/** O prazo previsto do tipo, como a abertura guiada mostra ("10 a 15 dias úteis"). */
export function prazoDoTipo(t: { variableFlow: boolean; expectedDaysMin: number | null; expectedDaysMax: number | null }): string {
  return t.variableFlow || t.expectedDaysMax === null
    ? "fluxo variável"
    : t.expectedDaysMin === t.expectedDaysMax || t.expectedDaysMin === null
      ? `${t.expectedDaysMax} dias úteis`
      : `${t.expectedDaysMin} a ${t.expectedDaysMax} dias úteis`;
}

/** "2026-11-20" → "20/11/2026". O que não for data volta como veio. */
export function dataLegivel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ─── Os argumentos da proposta ───────────────────────────────────────────────

const texto = (nome: string) => z.string({ error: `${nome} precisa ser texto ("" quando não há).` }).trim();
const id = (falta: string) => z.string({ error: falta }).trim().min(1, falta).max(64, falta);

/**
 * O que o modelo manda em `propor_abrir_processo`. Os campos "opcionais" vêm
 * sempre, vazios quando não há — é o que o modo estrito da OpenAI exige.
 *
 * As mensagens voltam ao modelo quando a proposta é recusada, então dizem de
 * onde tirar o valor certo.
 */
export const argumentosDaAbertura = z.object({
  tipoId: id("Falta o tipo de processo: use o tipoId de tipos_de_processo."),
  empresaId: id("Falta a empresa: use o empresaId de buscar_empresa."),
  responsavelId: texto("responsavelId").max(64, "O responsavelId é o id de responsaveis_do_societario."),
  titulo: texto("O título").max(MAX_TITULO, `O título passa de ${MAX_TITULO} caracteres.`),
  prioridade: z.enum(PRIORIDADES, { error: "A prioridade é BAIXA, NORMAL, ALTA ou URGENTE." }),
  prazo: texto("O prazo").refine((v) => lerDataDoCampo(v).ok, "O prazo combinado vai no formato AAAA-MM-DD, ou \"\" quando não há."),
  jaTemos: z
    .array(id("Cada item de jaTemos é um itemId de roteiro_do_tipo."), { error: "jaTemos é a lista de itemId de roteiro_do_tipo ([] se nenhum)." })
    .max(MAX_ITENS, "Itens demais em jaTemos.")
    .transform((itens) => [...new Set(itens)]),
  pedidoAoCliente: texto("O pedido ao cliente").max(MAX_PEDIDO, `O pedido ao cliente passa de ${MAX_PEDIDO} caracteres.`),
});

export type ArgumentosDaAbertura = z.infer<typeof argumentosDaAbertura>;

/**
 * Na aplicação, a proposta traz também o roteiro que o cartão mostrou — gravado
 * pelo servidor ao preparar a proposta, não escrito pelo modelo.
 */
export const aberturaParaAplicar = argumentosDaAbertura.extend({
  roteiroId: z.string().max(64).optional(),
});

export type AberturaParaAplicar = z.infer<typeof aberturaParaAplicar>;

function primeiroErro(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Argumentos inválidos.";
}

/** Lê os argumentos que o modelo mandou. */
export function lerArgumentosDaAbertura(bruto: unknown): { ok: true; dados: ArgumentosDaAbertura } | { ok: false; erro: string } {
  const r = argumentosDaAbertura.safeParse(bruto);
  return r.success ? { ok: true, dados: r.data } : { ok: false, erro: primeiroErro(r.error) };
}

/** Lê a proposta na hora de aplicar — vinda do banco do chat ou do cartão de `/processos`. */
export function lerAberturaParaAplicar(bruto: unknown): { ok: true; dados: AberturaParaAplicar } | { ok: false; erro: string } {
  const r = aberturaParaAplicar.safeParse(bruto);
  return r.success ? { ok: true, dados: r.data } : { ok: false, erro: primeiroErro(r.error) };
}

// ─── A conferência contra o banco ────────────────────────────────────────────

export type RoteiroDaAbertura = {
  tipo: { id: string; nome: string; ativo: boolean };
  /** A versão publicada de maior número — a mesma que a abertura usa. Nula sem roteiro publicado. */
  vigente: {
    id: string;
    versao: number;
    etapas: {
      rotulo: string;
      /** Sigla ou nome do órgão, quando a etapa é de órgão. */
      orgao: string | null;
      opcional: boolean;
      itens: { id: string; rotulo: string; obrigatorio: boolean }[];
    }[];
  } | null;
};

export type EmpresaDaAbertura = { id: string; nome: string; cnpj: string | null; cpf: string | null; situacao: string };

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

/** Os argumentos que a proposta guarda: os do modelo, conferidos, mais o roteiro e o resumo. */
export type AberturaPreparada = ArgumentosDaAbertura & { roteiroId: string; resumo: ResumoDaAbertura };

/**
 * Confere a proposta contra o que o banco devolveu, **antes** de ela virar
 * cartão. O erro volta ao modelo, que corrige ou pergunta à pessoa — melhor que
 * um cartão que a aplicação recusaria com a pessoa já clicando.
 *
 * `hoje` é a data em São Paulo, "AAAA-MM-DD".
 */
export function conferirAbertura(
  dados: ArgumentosDaAbertura,
  banco: {
    roteiro: RoteiroDaAbertura | null;
    empresa: EmpresaDaAbertura | null;
    responsaveis: readonly { id: string; name: string }[];
    emAndamento: number;
  },
  hoje: string
): { ok: true; abertura: AberturaPreparada } | { ok: false; erro: string } {
  const { roteiro, empresa } = banco;
  if (!roteiro) return { ok: false, erro: "Tipo de processo não encontrado. Use um tipoId de tipos_de_processo." };
  const tipo = roteiro.tipo.nome;
  if (!roteiro.tipo.ativo) return { ok: false, erro: `O tipo "${tipo}" está desativado no escritório. Pergunte à pessoa qual tipo usar.` };
  const vigente = roteiro.vigente;
  if (!vigente || vigente.etapas.length === 0) {
    return {
      ok: false,
      erro: `O tipo "${tipo}" não tem roteiro publicado, e sem roteiro o processo não abre. Diga à pessoa que a coordenação precisa publicar o roteiro em Processos › Roteiros.`,
    };
  }

  if (!empresa) return { ok: false, erro: "Empresa não encontrada. Use um empresaId de buscar_empresa." };
  if (!(SITUACOES_QUE_ABREM as readonly string[]).includes(empresa.situacao)) {
    const situacao = SITUACAO_DA_EMPRESA[empresa.situacao] ?? empresa.situacao.toLowerCase();
    return {
      ok: false,
      erro: `A empresa "${empresa.nome}" está ${situacao} no escritório, e a abertura só vale para empresa ativa ou prospecto. Confirme com a pessoa se é essa empresa.`,
    };
  }

  const responsavel = dados.responsavelId ? banco.responsaveis.find((r) => r.id === dados.responsavelId) : null;
  if (dados.responsavelId && !responsavel) {
    return { ok: false, erro: "Essa pessoa não pode responder por processo do Societário. Use um id de responsaveis_do_societario, ou \"\" para sem responsável." };
  }

  const itens = vigente.etapas.flatMap((e) => e.itens);
  const doRoteiro = new Set(itens.map((i) => i.id));
  const fora = dados.jaTemos.filter((i) => !doRoteiro.has(i));
  if (fora.length > 0) {
    return {
      ok: false,
      erro: `${fora.length === 1 ? "Um item" : `${fora.length} itens`} de jaTemos não ${fora.length === 1 ? "é" : "são"} do roteiro vigente de "${tipo}". Use os itemId de roteiro_do_tipo.`,
    };
  }

  if (dados.prazo && dados.prazo < hoje) {
    return {
      ok: false,
      erro: `O prazo combinado (${dataLegivel(dados.prazo)}) já passou: hoje é ${dataLegivel(hoje)}. Confirme a data com a pessoa — "dia 20" é o próximo dia 20.`,
    };
  }

  const temos = new Set(dados.jaTemos);
  return {
    ok: true,
    abertura: {
      ...dados,
      roteiroId: vigente.id,
      resumo: {
        tipo,
        versao: vigente.versao,
        etapas: vigente.etapas.length,
        empresa: empresa.nome,
        documento: empresa.cnpj ? formatCnpj(empresa.cnpj) : empresa.cpf ? formatCpf(empresa.cpf) : null,
        responsavel: responsavel?.name ?? null,
        jaTemos: itens.filter((i) => temos.has(i.id)).map((i) => i.rotulo),
        aPedir: itens.filter((i) => !temos.has(i.id)).map((i) => i.rotulo),
        emAndamento: banco.emAndamento,
      },
    },
  };
}

// ─── O cartão ────────────────────────────────────────────────────────────────

const resumoSchema = z.object({
  tipo: z.string(),
  versao: z.number(),
  etapas: z.number(),
  empresa: z.string(),
  documento: z.string().nullable(),
  responsavel: z.string().nullable(),
  jaTemos: z.array(z.string()),
  aPedir: z.array(z.string()),
  emAndamento: z.number(),
});

/** O resumo gravado na proposta, ou nulo se ela não passou pela conferência (ou veio torta). */
export function resumoDaProposta(argumentos: Record<string, unknown> | undefined): ResumoDaAbertura | null {
  const r = resumoSchema.safeParse(argumentos?.resumo);
  return r.success ? r.data : null;
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
