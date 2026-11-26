// Histórico salarial e reajuste coletivo (26/11/2026, funcionalidade-760,
// entrega 1).
//
// Toda mudança do salário do contrato fica no histórico (data, de quanto para
// quanto e o motivo). O reajuste coletivo aplica a convenção a todos os
// empregados da empresa de uma vez: um percentual sobre o salário e, se houver,
// o piso (quem fica abaixo do piso sobe para ele).
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { lerNumero } from "./entrada";

export type Reajuste = { percentual: number; piso: number | null; data: string; motivo: string };

export function lerReajuste(e: { percentual: string; piso: string; data: string; motivo: string }): { ok: true; reajuste: Reajuste } | { ok: false; erro: string } {
  const percentual = lerNumero(e.percentual) ?? 0;
  const piso = lerNumero(e.piso);
  if (percentual < 0 || percentual > 100) return { ok: false, erro: "O percentual vai de 0 a 100." };
  if (piso !== null && piso <= 0) return { ok: false, erro: "O piso tem de ser maior que zero." };
  if (percentual === 0 && piso === null) return { ok: false, erro: "Informe o percentual, o piso ou os dois." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) return { ok: false, erro: "Informe a data em que o reajuste vale." };
  const motivo = e.motivo.trim().slice(0, 120) || "Reajuste coletivo";
  return { ok: true, reajuste: { percentual, piso, data: e.data, motivo } };
}

/**
 * O salário depois do reajuste. No horista, o piso é mensal: compara o valor
 * da hora × horas mensais e devolve a hora.
 */
export function salarioReajustado(atual: { salarioBase: number; tipoSalario: string; horasMensais: number }, r: Pick<Reajuste, "percentual" | "piso">): number {
  const comPercentual = r2(atual.salarioBase * (1 + r.percentual / 100));
  if (r.piso === null) return comPercentual;
  if (atual.tipoSalario === "HORISTA") {
    const horas = atual.horasMensais > 0 ? atual.horasMensais : 220;
    return r2(Math.max(comPercentual, r.piso / horas));
  }
  return r2(Math.max(comPercentual, r.piso));
}

export type PrevisaoDoReajuste = { personId: string; nome: string; antes: number; depois: number; pelo: "PERCENTUAL" | "PISO" | "SEM_MUDANCA" };

/** Quem muda e de quanto para quanto, para conferir antes de aplicar. */
export function preverReajuste(
  contratos: readonly { personId: string; nome: string; salarioBase: number; tipoSalario: string; horasMensais: number }[],
  r: Pick<Reajuste, "percentual" | "piso">
): PrevisaoDoReajuste[] {
  return contratos.map((c) => {
    const depois = salarioReajustado(c, r);
    const soPercentual = r2(c.salarioBase * (1 + r.percentual / 100));
    const pelo = depois === c.salarioBase ? "SEM_MUDANCA" : depois > soPercentual ? "PISO" : "PERCENTUAL";
    return { personId: c.personId, nome: c.nome, antes: c.salarioBase, depois, pelo };
  });
}
