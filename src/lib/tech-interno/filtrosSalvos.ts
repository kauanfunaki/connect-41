import { z } from "zod";
import { ROTA_TECH_INTERNO } from "./regras";

/**
 * Os filtros salvos da lista do Controle interno (18/11/2026,
 * funcionalidade-783). Cada filtro salvo é só de quem salvou: ninguém vê nem
 * mexe no de outra pessoa (decisão do Kauan).
 *
 * O que se guarda é a combinação de filtros da lista — os parâmetros da URL
 * que o `lerFiltros` lê —, normalizada: sempre na mesma ordem, sem valor
 * vazio, sem página e sem a visão (lista/Kanban) nem o mês. Aplicar um filtro
 * salvo troca só os filtros e mantém a visão em que a pessoa está. Por ser
 * normalizada, a query salva se compara direto com a da URL atual para dizer
 * qual salvo está aplicado.
 *
 * Regra pura, sem Prisma: o painel (componente cliente) usa as mesmas funções.
 */

/** Os parâmetros que formam um filtro salvo, na ordem em que são gravados. */
export const CHAVES_DO_FILTRO_SALVO = ["situacao", "tipo", "prioridade", "sistema", "responsavel", "atrasados", "q"] as const;
/** Quantos filtros salvos cada pessoa pode ter. */
export const LIMITE_DE_FILTROS_SALVOS = 20;
export const TAMANHO_DO_NOME_DO_FILTRO = 80;
export const TAMANHO_DA_QUERY_DO_FILTRO = 2000;

export type FiltroSalvo = { id: string; nome: string; query: string };
type Origem = string | URLSearchParams | Record<string, string | string[] | undefined>;

function lerOrigem(origem: Origem): (chave: string) => string | undefined {
  if (typeof origem === "string" || origem instanceof URLSearchParams) {
    const q = typeof origem === "string" ? new URLSearchParams(origem.startsWith("?") ? origem.slice(1) : origem) : origem;
    return chave => q.get(chave) ?? undefined;
  }
  // Como a página: parâmetro repetido (lista) não vale como filtro.
  return chave => typeof origem[chave] === "string" ? origem[chave] as string : undefined;
}

/**
 * A combinação de filtros normalizada: só os parâmetros do filtro, na ordem de
 * `CHAVES_DO_FILTRO_SALVO`, sem espaços nas pontas e sem os vazios. Página,
 * visão, mês e qualquer outro parâmetro ficam de fora. "" quando não há filtro.
 */
export function normalizarQueryDoFiltro(origem: Origem): string {
  const ler = lerOrigem(origem), q = new URLSearchParams();
  for (const chave of CHAVES_DO_FILTRO_SALVO) {
    const valor = ler(chave)?.trim();
    if (valor) q.set(chave, valor);
  }
  return q.toString();
}

/** O endereço da lista com o filtro salvo: troca os filtros e mantém a visão e o mês de agora. */
export function enderecoDoFiltroSalvo(query: string, atual: Origem = ""): string {
  const ler = lerOrigem(atual), q = new URLSearchParams();
  for (const chave of ["visao", "mes"]) { const valor = ler(chave); if (valor) q.set(chave, valor); }
  for (const [chave, valor] of new URLSearchParams(normalizarQueryDoFiltro(query))) q.set(chave, valor);
  const s = q.toString();
  return s ? `${ROTA_TECH_INTERNO}?${s}` : ROTA_TECH_INTERNO;
}

/** O filtro salvo que bate exatamente com os filtros da URL atual, se houver. */
export function filtroAplicado<T extends { query: string }>(salvos: readonly T[], atual: Origem): T | undefined {
  const query = normalizarQueryDoFiltro(atual);
  return query ? salvos.find(s => s.query === query) : undefined;
}

/**
 * Mesmo nome para o banco: a coluna é utf8mb4_unicode_ci, que não distingue
 * maiúscula nem acento ("Meus bugs" = "meus búgs"). A conferência aqui é a
 * mesma, para a mensagem sair antes da violação de unicidade.
 */
export const mesmoNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

export const nomeDoFiltroSchema = z.string({ error: "Dê um nome ao filtro." })
  .transform(v => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Dê um nome ao filtro.").max(TAMANHO_DO_NOME_DO_FILTRO, `O nome deve ter até ${TAMANHO_DO_NOME_DO_FILTRO} caracteres.`));

export const filtroSalvoSchema = z.object({
  nome: nomeDoFiltroSchema,
  query: z.string({ error: "Filtros inválidos." })
    .max(TAMANHO_DA_QUERY_DO_FILTRO, "Os filtros escolhidos são longos demais para salvar.")
    .transform(v => normalizarQueryDoFiltro(v))
    .refine(v => v.length > 0, "Escolha ao menos um filtro antes de salvar.")
    .refine(v => v.length <= TAMANHO_DA_QUERY_DO_FILTRO, "Os filtros escolhidos são longos demais para salvar."),
});

/**
 * O que impede salvar, olhando os filtros que a pessoa já tem: o limite, um
 * nome repetido ou a mesma combinação já salva com outro nome. null = pode.
 */
export function motivoParaNaoSalvar(existentes: readonly FiltroSalvo[], novo: { nome: string; query: string }): string | null {
  if (existentes.length >= LIMITE_DE_FILTROS_SALVOS) return `Você já tem ${LIMITE_DE_FILTROS_SALVOS} filtros salvos. Exclua um para salvar outro.`;
  const mesmoNomeJa = existentes.find(s => mesmoNome(s.nome, novo.nome));
  if (mesmoNomeJa) return `Já existe um filtro salvo com o nome “${mesmoNomeJa.nome}”.`;
  const mesmaQuery = existentes.find(s => s.query === novo.query);
  if (mesmaQuery) return `Esses filtros já estão salvos como “${mesmaQuery.nome}”.`;
  return null;
}
