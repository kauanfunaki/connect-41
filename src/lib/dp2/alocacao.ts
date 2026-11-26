// Trabalho temporário e cessão de mão de obra (26/11/2026, funcionalidade-772,
// entrega 1).
//
// A empresa que cede mão de obra (ou a de trabalho temporário) registra em
// qual tomador cada colaborador trabalha e de quando a quando. Na
// competência, a folha sai separada por tomador, para conferir a retenção de
// 11% do INSS que cada tomador faz na nota de serviço (Lei 8.212/1991, art.
// 31) e lançar as retenções da apuração.
//
// Puro, sem banco.

import { cnpjValido, digitos } from "./esocial/documentos";

export type TipoDeAlocacao = "CESSAO" | "TEMPORARIO";
export const NOME_DA_ALOCACAO: Record<TipoDeAlocacao, string> = { CESSAO: "Cessão de mão de obra", TEMPORARIO: "Trabalho temporário" };

export type Alocacao = { tipo: TipoDeAlocacao; tomadorCnpj: string; tomadorNome: string; inicio: string; fim: string | null };

/** A alíquota da retenção do INSS na nota de cessão de mão de obra (Lei 8.212/1991, art. 31). */
export const RETENCAO_CESSAO = 11;

export function lerAlocacao(e: { tipo: string; tomadorCnpj: string; tomadorNome: string; inicio: string; fim: string }): { ok: true; alocacao: Alocacao } | { ok: false; erro: string } {
  const tipo = e.tipo === "TEMPORARIO" ? "TEMPORARIO" : e.tipo === "CESSAO" ? "CESSAO" : null;
  if (!tipo) return { ok: false, erro: "Escolha cessão de mão de obra ou trabalho temporário." };
  if (!cnpjValido(e.tomadorCnpj)) return { ok: false, erro: "Informe o CNPJ do tomador (14 dígitos, válido)." };
  const tomadorNome = e.tomadorNome.trim().slice(0, 160);
  if (!tomadorNome) return { ok: false, erro: "Informe o nome do tomador." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.inicio)) return { ok: false, erro: "Informe o início da alocação." };
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(e.fim) ? e.fim : null;
  if (fim && fim < e.inicio) return { ok: false, erro: "O fim da alocação é antes do início." };
  return { ok: true, alocacao: { tipo, tomadorCnpj: digitos(e.tomadorCnpj), tomadorNome, inicio: e.inicio, fim } };
}

/**
 * O tomador de cada pessoa na competência "AAAA-MM": a alocação que pega
 * algum dia do mês (a mais recente, quando há mais de uma).
 */
export function tomadorNoMes<T extends Alocacao & { personId: string }>(alocacoes: readonly T[], competencia: string): Map<string, T> {
  const [ano, mes] = competencia.split("-").map(Number);
  const inicioDoMes = `${competencia}-01`;
  const fimDoMes = `${competencia}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
  const por = new Map<string, T>();
  for (const a of [...alocacoes].sort((x, y) => x.inicio.localeCompare(y.inicio))) {
    if (a.inicio > fimDoMes || (a.fim && a.fim < inicioDoMes)) continue;
    por.set(a.personId, a);
  }
  return por;
}

/** "Nome · 00.000.000/0000-00": como o tomador aparece no resumo da folha. */
export function rotuloDoTomador(a: Pick<Alocacao, "tomadorNome" | "tomadorCnpj">): string {
  const c = a.tomadorCnpj;
  return `${a.tomadorNome} · ${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
