// As versões de orçamento de uma empresa num ano: rascunho, aprovada, reabrir.
// Função pura; a transação que aplica o plano está na action.
//
// ─── Só uma aprovada por empresa e ano ──────────────────────────────────────
//
// É a versão que a DRE e as análises comparam com o realizado; duas aprovadas
// fariam a mesma tela mostrar um orçado ou outro conforme a ordem da consulta.
// Aprovar uma versão **devolve a anterior a rascunho** na mesma transação, em
// vez de recusar: trocar o orçamento vigente é exatamente o que a coordenação
// quer fazer quando aprova outra versão, e obrigar a reabrir antes seria um
// clique a mais que deixa, por um instante, o ano sem orçamento aprovado.
//
// A aprovada é somente leitura. Mudar um número dela é reabrir (volta a
// rascunho, e o ano fica sem aprovada até alguém aprovar de novo) — mudar em
// silêncio o orçado de um mês já comparado apagaria a variação que alguém leu.

export type StatusDoOrcamento = "RASCUNHO" | "APROVADO";

export type VersaoDoOrcamento = {
  id: string;
  status: StatusDoOrcamento;
  approvedAt: Date | null;
  updatedAt: Date;
};

export type Veredito = { pode: true } | { pode: false; motivo: string };

export const TAMANHO_MAXIMO_DO_NOME_DA_VERSAO = 80;
export const MENOR_ANO = 2000;
export const MAIOR_ANO = 2100;

export function podeEditarVersao(status: StatusDoOrcamento): Veredito {
  return status === "RASCUNHO"
    ? { pode: true }
    : { pode: false, motivo: "Versão aprovada é somente leitura — reabra para editar." };
}

export function podeReabrir(status: StatusDoOrcamento): Veredito {
  return status === "APROVADO" ? { pode: true } : { pode: false, motivo: "Só versão aprovada se reabre." };
}

/**
 * O que aprovar `alvoId` faz: o alvo tem de ser rascunho, e toda outra versão
 * aprovada do mesmo ano volta a rascunho.
 */
export function planoDeAprovacao(
  versoes: Pick<VersaoDoOrcamento, "id" | "status">[],
  alvoId: string
): { ok: true; rebaixar: string[] } | { ok: false; motivo: string } {
  const alvo = versoes.find((v) => v.id === alvoId);
  if (!alvo) return { ok: false, motivo: "Versão não encontrada." };
  if (alvo.status !== "RASCUNHO") return { ok: false, motivo: "Esta versão já está aprovada." };
  return { ok: true, rebaixar: versoes.filter((v) => v.id !== alvoId && v.status === "APROVADO").map((v) => v.id) };
}

/**
 * A versão aprovada do ano. Se o dado estiver inconsistente (duas aprovadas —
 * só por escrita fora da aplicação), vale a aprovada mais recentemente, que é
 * a última decisão de alguém.
 */
export function versaoAprovada<T extends Pick<VersaoDoOrcamento, "status" | "approvedAt">>(versoes: T[]): T | null {
  const aprovadas = versoes.filter((v) => v.status === "APROVADO");
  if (aprovadas.length === 0) return null;
  return [...aprovadas].sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0))[0]!;
}

/** A versão que a tela abre sem escolha: a aprovada, senão a mexida por último. */
export function versaoPadrao<T extends VersaoDoOrcamento>(versoes: T[]): T | null {
  return versaoAprovada(versoes) ?? [...versoes].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
}

export function validarNomeDaVersao(texto: string | null | undefined): { ok: true; nome: string } | { ok: false; erro: string } {
  const nome = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Dê um nome à versão (ex.: Original, Revisão de junho)." };
  if (nome.length > TAMANHO_MAXIMO_DO_NOME_DA_VERSAO) return { ok: false, erro: `Nome com mais de ${TAMANHO_MAXIMO_DO_NOME_DA_VERSAO} caracteres.` };
  return { ok: true, nome };
}

export function lerAno(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (!/^\d{4}$/.test(t)) return null;
  const ano = Number(t);
  return ano >= MENOR_ANO && ano <= MAIOR_ANO ? ano : null;
}
