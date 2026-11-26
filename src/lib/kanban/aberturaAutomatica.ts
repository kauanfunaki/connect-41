// A abertura automática de tarefas por setor (27/11/2026, funcionalidade-872).
// Regras puras — a leitura e a gravação moram em `aberturaAutomaticaServidor.ts`.
//
// Quatro origens já criam cartão sozinhas nos Quadros. Só a do processo
// societário é configurada na tela "Abertura automática" (a lista e o
// liga/desliga, em `AberturaAutomatica`); as outras três têm configuração
// própria e aparecem ali com a contagem e o link:
//   - solicitações do cliente: por assunto (ServiceRequestSubject.cardPipelineId);
//   - obrigações recorrentes (src/lib/recurringObligations.ts);
//   - obrigações por regime (src/lib/obrigacoes/geracao.ts).
//
// Sem configuração gravada, o processo vira cartão (ligado) na lista padrão,
// criada pelo sistema no setor do módulo: o espaço "Processos" › a lista
// "Processos societários".

/** As chaves do que o sistema cria (o `systemKey` do espaço e da lista). */
export const ESPACO_DOS_PROCESSOS = "processos";
export const LISTA_DOS_PROCESSOS = "processos_societarios";

export const NOME_DO_ESPACO_DOS_PROCESSOS = "Processos";
/** O nome alternativo quando o setor já tem um espaço "Processos" criado pela equipe. */
export const NOME_ALTERNATIVO_DO_ESPACO = "Processos (automático)";
export const NOME_DA_LISTA_DOS_PROCESSOS = "Processos societários";
export const COR_DO_ESPACO_DOS_PROCESSOS = "#6E5DC6";

export type ConfiguracaoGravada = { ativo: boolean; pipelineId: string | null } | null;

export type DestinoDaAbertura =
  | { ligada: false }
  | { ligada: true; lista: { tipo: "padrao" } | { tipo: "escolhida"; pipelineId: string } };

/**
 * Onde o processo vira cartão, pela configuração do setor. Sem linha, ligada
 * na lista padrão. A lista escolhida que não existe mais (o banco anula a
 * coluna) também cai na padrão.
 */
export function destinoDaAbertura(config: ConfiguracaoGravada): DestinoDaAbertura {
  if (!config) return { ligada: true, lista: { tipo: "padrao" } };
  if (!config.ativo) return { ligada: false };
  return { ligada: true, lista: config.pipelineId ? { tipo: "escolhida", pipelineId: config.pipelineId } : { tipo: "padrao" } };
}

/** O valor do seletor de lista para "a lista padrão, criada pelo sistema". */
export const VALOR_DA_LISTA_PADRAO = "padrao";

export type FormularioDaAbertura = { ok: true; ativo: boolean; pipelineId: string | null } | { ok: false; erro: string };

/** Lê o formulário da tela: o liga/desliga e a lista ("padrao" = a do sistema). */
export function lerFormularioDaAbertura(form: { get(nome: string): unknown }): FormularioDaAbertura {
  const ativo = form.get("ativo") === "1";
  const lista = typeof form.get("lista") === "string" ? String(form.get("lista")).trim() : "";
  if (!lista || lista === VALOR_DA_LISTA_PADRAO) return { ok: true, ativo, pipelineId: null };
  if (lista.length > 191) return { ok: false, erro: "Lista inválida." };
  return { ok: true, ativo, pipelineId: lista };
}

/** O que a tela escreve sobre o destino, numa linha. */
export function resumoDoDestino(destino: DestinoDaAbertura, nomeDaListaEscolhida: string | null): string {
  if (!destino.ligada) return "Desligada: processo novo não vira cartão.";
  if (destino.lista.tipo === "padrao") return `Ligada: cada processo vira cartão em ${NOME_DO_ESPACO_DOS_PROCESSOS} › ${NOME_DA_LISTA_DOS_PROCESSOS}.`;
  return `Ligada: cada processo vira cartão em ${nomeDaListaEscolhida ?? "uma lista que não existe mais"}.`;
}

// ─── Automáticos × criados pela equipe, nos Quadros ─────────────────────────

/** Separa o que o sistema criou (systemKey preenchido) do que a equipe criou, na ordem em que vieram. */
export function separarAutomaticos<T extends { systemKey: string | null }>(itens: readonly T[]): { automaticos: T[]; daEquipe: T[] } {
  return {
    automaticos: itens.filter((i) => !!i.systemKey),
    daEquipe: itens.filter((i) => !i.systemKey),
  };
}

/** A recusa de excluir o que o sistema criou: desliga-se, não se exclui. */
export const NAO_EXCLUI_AUTOMATICO =
  "Este espaço é automático: o sistema o usa para abrir tarefas sozinho. Em vez de excluir, desligue a abertura automática do setor.";
export const NAO_EXCLUI_LISTA_AUTOMATICA =
  "Esta lista é automática: os processos societários viram cartão nela. Em vez de excluir, desligue a abertura automática do setor.";
export const NAO_EXCLUI_DESTINO =
  "Processos societários viram cartão nesta lista. Escolha outra lista em Quadro de tarefas › Abertura automática antes de excluí-la.";
