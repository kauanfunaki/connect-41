// Os modelos da Tabela dinâmica do BPO (25/11/2026, funcionalidade-816 —
// decisão do Kauan, alternativa C: "meu ou do setor, escolhido ao salvar").
//
// Um modelo é a tabela montada, salva com um nome: a base, as linhas, a
// coluna, a medida e, se a pessoa quiser, os filtros. O período tem duas
// formas — "os últimos 6 meses, sempre", que anda com o calendário, ou o
// de/até fixo de quando foi salvo. Quem salva escolhe se o modelo é só dele
// ou de todo o setor.
//
// O que se guarda são os parâmetros do endereço da tela (`paramsDaConfiguracao`)
// e aplicar um modelo é trocar o endereço pelos dele. Os parâmetros lidos do
// banco passam pela mesma leitura do endereço (`lerConfiguracao`): o JSON não
// é confiável, e um campo que deixou de existir cai no padrão, como num link
// antigo.
//
// Regra pura, sem Prisma: o menu (componente cliente) usa as mesmas funções.

import { z } from "zod";
import { formatarCompetencia } from "@/lib/format";
import { lerConfiguracao, paramsDaConfiguracao, type Configuracao } from "./tabelaDinamica";

export const TAMANHO_DO_NOME_DO_MODELO = 80;
/** Quantos modelos pessoais cada pessoa pode ter, e quantos o setor. */
export const LIMITE_DE_MODELOS_PESSOAIS = 30;
export const LIMITE_DE_MODELOS_DO_SETOR = 60;
/** O período relativo: os últimos N meses até o mês de hoje — o padrão da tela. */
export const MESES_DO_PERIODO_RELATIVO = 6;

export type PeriodoDoModelo = "relativo" | "fixo";
export type QuemVe = "eu" | "setor";

/** A montagem da tabela vai sempre; os filtros, se a pessoa marcar; o período, se for fixo. */
const CHAVES_DA_MONTAGEM = ["base", "linhas", "coluna", "medida"] as const;
const CHAVES_DOS_FILTROS = ["tipo", "periodoPor", "situacao"] as const;
const CHAVES_DO_PERIODO = ["de", "ate", "periodo"] as const;
const CHAVES_DO_MODELO: ReadonlySet<string> = new Set([...CHAVES_DA_MONTAGEM, ...CHAVES_DOS_FILTROS, ...CHAVES_DO_PERIODO]);
/** Nenhum parâmetro da tela chega perto disto: o que passar é lixo. */
const TAMANHO_DO_VALOR = 200;

/** O que a tela recebe de cada modelo. */
export type ModeloDaTabela = {
  id: string;
  nome: string;
  /** Código do setor; `null` = pessoal. */
  setor: string | null;
  periodo: PeriodoDoModelo;
  comFiltros: boolean;
  parametros: Record<string, string>;
  /** Quem criou — aparece nos do setor. */
  criadoPorNome: string | null;
  podeRenomear: boolean;
  podeExcluir: boolean;
};

/** Os modelos que a tela mostra, e o que a pessoa pode fazer com eles. */
export type ModelosDaTela = {
  meus: ModeloDaTabela[];
  doSetor: ModeloDaTabela[];
  /** O setor da tela (o dono do módulo), onde caem os modelos de "Todo o setor". */
  setor: { codigo: string; rotulo: string };
  /** Pode salvar para todo o setor (agir no setor). */
  podeCompartilhar: boolean;
};

/**
 * Só os parâmetros que um modelo pode ter, e só texto curto. Do banco vem um
 * JSON qualquer: objeto que não é objeto vira `{}`, e a leitura do endereço
 * põe os padrões no lugar.
 */
export function lerParametrosDoModelo(json: unknown): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (CHAVES_DO_MODELO.has(k) && typeof v === "string" && v.length <= TAMANHO_DO_VALOR) out[k] = v;
  }
  return out;
}

/** Os parâmetros que o modelo guarda, a partir da tabela que está na tela. */
export function parametrosDoModelo(c: Configuracao, opcoes: { periodo: PeriodoDoModelo; comFiltros: boolean }): Record<string, string> {
  const guardar = new Set<string>([
    ...CHAVES_DA_MONTAGEM,
    ...(opcoes.comFiltros ? CHAVES_DOS_FILTROS : []),
    ...(opcoes.periodo === "fixo" ? CHAVES_DO_PERIODO : []),
  ]);
  const out: Record<string, string> = {};
  for (const [k, v] of paramsDaConfiguracao(c)) if (guardar.has(k)) out[k] = v;
  return out;
}

/**
 * A tabela que o modelo monta. O período relativo fica de fora dos
 * parâmetros, e a leitura do endereço põe os últimos 6 meses de hoje. Sem os
 * filtros guardados, ficam os que estão na tela. Ida e volta pelo endereço no
 * fim: o filtro que só as contas têm não sobra numa tabela de baixas.
 */
export function configuracaoDoModelo(
  m: Pick<ModeloDaTabela, "parametros" | "periodo" | "comFiltros">,
  atual: Configuracao,
  hoje: string,
): Configuracao {
  const seguros = lerParametrosDoModelo(m.parametros);
  const daTela = Object.fromEntries(paramsDaConfiguracao(atual));
  const p: Record<string, string | undefined> = {};
  for (const k of CHAVES_DA_MONTAGEM) p[k] = seguros[k];
  for (const k of CHAVES_DOS_FILTROS) p[k] = m.comFiltros ? seguros[k] : daTela[k];
  if (m.periodo === "fixo") for (const k of CHAVES_DO_PERIODO) p[k] = seguros[k];
  const lida = lerConfiguracao(p, hoje);
  return lerConfiguracao(Object.fromEntries(paramsDaConfiguracao(lida)), hoje);
}

/**
 * O modelo que está aplicado: o que, aplicado agora, daria a mesma tabela da
 * tela — o botão mostra o nome dele, como nos Filtros salvos do Controle
 * interno. Os pessoais vêm antes dos do setor.
 */
export function modeloAplicado<T extends Pick<ModeloDaTabela, "parametros" | "periodo" | "comFiltros">>(
  modelos: readonly T[],
  atual: Configuracao,
  hoje: string,
): T | undefined {
  const chave = paramsDaConfiguracao(atual).toString();
  return modelos.find((m) => paramsDaConfiguracao(configuracaoDoModelo(m, atual, hoje)).toString() === chave);
}

/** O período que o diálogo de salvar marca: o relativo quando a tela está no padrão. */
export function periodoSugerido(c: Configuracao, hoje: string): PeriodoDoModelo {
  const padrao = lerConfiguracao({}, hoje).filtros;
  return c.filtros.de === padrao.de && c.filtros.ate === padrao.ate ? "relativo" : "fixo";
}

/** "Jun/26 a Nov/26", "Desde Jun/26", "Todo o histórico". */
export function textoDoPeriodo(f: Pick<Configuracao["filtros"], "de" | "ate">): string {
  if (!f.de && !f.ate) return "Todo o histórico";
  if (!f.ate) return `Desde ${formatarCompetencia(f.de!)}`;
  if (!f.de) return `Até ${formatarCompetencia(f.ate)}`;
  return f.de === f.ate ? formatarCompetencia(f.de) : `${formatarCompetencia(f.de)} a ${formatarCompetencia(f.ate)}`;
}

/** A linha de apoio do modelo no menu: o período e, se for o caso, que os filtros são os da tela. */
export function resumoDoModelo(m: Pick<ModeloDaTabela, "parametros" | "periodo" | "comFiltros">, hoje: string): string {
  const periodo =
    m.periodo === "relativo"
      ? `Últimos ${MESES_DO_PERIODO_RELATIVO} meses`
      : textoDoPeriodo(lerConfiguracao(lerParametrosDoModelo(m.parametros), hoje).filtros);
  return m.comFiltros ? periodo : `${periodo} · filtros da tela`;
}

// ─── Quem mexe ───────────────────────────────────────────────────────────────

/** Renomear: só quem criou, no pessoal e no do setor. */
export function podeRenomearModelo(userId: string, m: { criadoPorId: string }): boolean {
  return m.criadoPorId === userId;
}

/**
 * Excluir: quem criou; no do setor, também a coordenação do setor (gerir no
 * módulo — o administrador entra aí). O pessoal de outra pessoa nem aparece.
 */
export function podeExcluirModelo(quem: { userId: string; gereOSetor: boolean }, m: { criadoPorId: string; setor: string | null }): boolean {
  return m.criadoPorId === quem.userId || (m.setor !== null && quem.gereOSetor);
}

// ─── Validação ───────────────────────────────────────────────────────────────

/**
 * Mesmo nome para o banco: a coluna é utf8mb4_unicode_ci, que não distingue
 * maiúscula nem acento. A conferência é a mesma, para a mensagem ser clara.
 */
export const mesmoNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

export const nomeDoModeloSchema = z
  .string({ error: "Dê um nome ao modelo." })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Dê um nome ao modelo.")
      .max(TAMANHO_DO_NOME_DO_MODELO, `O nome deve ter até ${TAMANHO_DO_NOME_DO_MODELO} caracteres.`),
  );

export const novoModeloSchema = z.object({
  nome: nomeDoModeloSchema,
  quemVe: z.enum(["eu", "setor"], { error: "Escolha quem vê o modelo." }),
  periodo: z.enum(["relativo", "fixo"], { error: "Escolha o período do modelo." }),
  comFiltros: z.boolean({ error: "Diga se os filtros vão junto." }),
  /** O endereço da tela, sem o "?" — passa pela leitura do endereço no servidor. */
  query: z.string({ error: "Tabela inválida." }).max(2000, "Tabela inválida."),
});

/** O que impede salvar com esse nome no grupo (os pessoais da pessoa, ou os do setor). null = pode. */
export function motivoParaNaoSalvar(existentes: readonly { id: string; nome: string }[], nome: string, quemVe: QuemVe, ignorar?: string): string | null {
  const outros = existentes.filter((m) => m.id !== ignorar);
  const limite = quemVe === "setor" ? LIMITE_DE_MODELOS_DO_SETOR : LIMITE_DE_MODELOS_PESSOAIS;
  if (!ignorar && outros.length >= limite) {
    return quemVe === "setor"
      ? `O setor já tem ${limite} modelos. Exclua um para salvar outro.`
      : `Você já tem ${limite} modelos. Exclua um para salvar outro.`;
  }
  const repetido = outros.find((m) => mesmoNome(m.nome, nome));
  if (repetido) return quemVe === "setor" ? `O setor já tem um modelo chamado “${repetido.nome}”.` : `Você já tem um modelo chamado “${repetido.nome}”.`;
  return null;
}
