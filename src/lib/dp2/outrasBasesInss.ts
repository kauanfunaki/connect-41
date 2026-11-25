// Outras bases de INSS (25/11/2026, funcionalidade-769): "Processos ›
// Informações › Outras bases INSS" da Domínio. O colaborador com mais de um
// vínculo informa a remuneração em cada outra empresa no mês; o INSS daqui
// respeita o teto somando as bases (`calcularInssComOutrasBases`) e o S-1200
// leva o infoMV. O que se lê do formulário fica aqui.
//
// Puro, sem banco.

import { lerNumero } from "./entrada";
import { cnpjValido, cpfValido } from "./esocial/documentos";

export type OutraBaseLida = { tpInsc: 1 | 2; nrInsc: string; codCateg: string; remuneracao: number };

/** Confere a linha: CNPJ ou CPF da outra empresa, categoria lá (3 dígitos) e a remuneração do mês. */
export function lerOutraBase(documento: string, categoria: string, valor: string, cnpjDaEmpresa?: string | null): { ok: true; base: OutraBaseLida } | { ok: false; erro: string } {
  const nr = documento.replace(/\D/g, "");
  let tpInsc: 1 | 2;
  if (nr.length === 14 && cnpjValido(nr)) tpInsc = 1;
  else if (nr.length === 11 && cpfValido(nr)) tpInsc = 2;
  else return { ok: false, erro: "Informe o CNPJ (ou o CPF, se o outro empregador for pessoa física) válido da outra empresa." };
  if (tpInsc === 1 && cnpjDaEmpresa && cnpjDaEmpresa.replace(/\D/g, "") === nr) return { ok: false, erro: "Esse CNPJ é desta empresa: informe o da outra empresa onde o colaborador trabalha." };
  const codCateg = (categoria.trim() || "101").replace(/\D/g, "");
  if (!/^\d{3}$/.test(codCateg)) return { ok: false, erro: "A categoria na outra empresa tem 3 dígitos (ex.: 101)." };
  const remuneracao = lerNumero(valor);
  if (remuneracao === null || !Number.isFinite(remuneracao) || remuneracao <= 0) return { ok: false, erro: "Informe a remuneração do mês na outra empresa." };
  return { ok: true, base: { tpInsc, nrInsc: nr, codCateg, remuneracao: Math.round(remuneracao * 100) / 100 } };
}

/** O mês anterior, para copiar as outras bases que se repetem. */
export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/** CNPJ ou CPF formatado, para a lista. */
export function documentoFormatado(tpInsc: number, nr: string): string {
  const d = nr.replace(/\D/g, "");
  if (tpInsc === 2 && d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}
