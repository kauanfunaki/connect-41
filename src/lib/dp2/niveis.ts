// Níveis salariais (26/11/2026, funcionalidade-760).
//
// Como na Domínio (Arquivo › Níveis): cada nível tem faixas de classe e
// referência, com o tempo de casa mínimo (em meses) e o valor. O contrato
// escolhe o nível; ao aplicar os níveis numa data, o salário de cada um passa
// para a faixa do tempo de casa naquela data (a mais alta alcançada), e a
// mudança vai para o histórico salarial e para o S-2206.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { lerNumero } from "./entrada";

export type FaixaDoNivel = { classe: string; referencia: string; meses: number; valor: number };

/**
 * Lê as faixas digitadas, uma por linha: "classe; referência; meses; valor"
 * (ex.: "A; 1; 0; 2.500,00"). Ordena pelo tempo de casa.
 */
export function lerNivel(e: { nome: string; faixas: string }): { ok: true; nivel: { nome: string; faixas: FaixaDoNivel[] } } | { ok: false; erro: string } {
  const nome = e.nome.trim().slice(0, 80);
  if (!nome) return { ok: false, erro: "Dê um nome ao nível (ex.: Operacional)." };
  const faixas: FaixaDoNivel[] = [];
  const linhas = e.faixas.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) return { ok: false, erro: "Informe ao menos uma faixa: classe; referência; meses; valor." };
  for (const [i, linha] of linhas.entries()) {
    const partes = linha.split(";").map((p) => p.trim());
    if (partes.length !== 4) return { ok: false, erro: `Linha ${i + 1}: use "classe; referência; meses; valor".` };
    const [classe, referencia, mesesTxt, valorTxt] = partes;
    const meses = Number(mesesTxt);
    const valor = lerNumero(valorTxt);
    if (!classe || !referencia) return { ok: false, erro: `Linha ${i + 1}: informe a classe e a referência.` };
    if (!Number.isInteger(meses) || meses < 0 || meses > 600) return { ok: false, erro: `Linha ${i + 1}: o tempo de casa é em meses inteiros (0 a 600).` };
    if (valor === null || valor <= 0) return { ok: false, erro: `Linha ${i + 1}: informe o valor da faixa.` };
    faixas.push({ classe: classe.slice(0, 10), referencia: referencia.slice(0, 10), meses, valor: r2(valor) });
  }
  faixas.sort((a, b) => a.meses - b.meses);
  if (new Set(faixas.map((f) => f.meses)).size !== faixas.length) return { ok: false, erro: "Duas faixas com o mesmo tempo de casa: cada faixa começa num tempo diferente." };
  return { ok: true, nivel: { nome, faixas } };
}

export function lerFaixas(bruto: unknown): FaixaDoNivel[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((f): f is FaixaDoNivel => !!f && typeof f === "object" && typeof (f as FaixaDoNivel).valor === "number" && typeof (f as FaixaDoNivel).meses === "number")
    .sort((a, b) => a.meses - b.meses);
}

/** Os meses completos de casa na data. */
export function mesesDeCasa(admissao: string, data: string): number {
  const [aa, am, ad] = admissao.split("-").map(Number);
  const [da, dm, dd] = data.split("-").map(Number);
  let meses = (da - aa) * 12 + (dm - am);
  if (dd < ad) meses--;
  return Math.max(0, meses);
}

/** A faixa do tempo de casa: a de maior tempo mínimo já alcançado. */
export function faixaDoTempo(faixas: readonly FaixaDoNivel[], meses: number): FaixaDoNivel | null {
  let atual: FaixaDoNivel | null = null;
  for (const f of [...faixas].sort((a, b) => a.meses - b.meses)) if (f.meses <= meses) atual = f;
  return atual;
}

/** O salário do contrato pela faixa: mensal no mensalista; a hora (valor ÷ horas do mês) no horista. */
export function salarioDaFaixa(f: FaixaDoNivel, contrato: { tipoSalario: string; horasMensais: number }): number {
  if (contrato.tipoSalario === "HORISTA") return r2(f.valor / (contrato.horasMensais > 0 ? contrato.horasMensais : 220));
  return f.valor;
}

export const rotuloDaFaixa = (f: FaixaDoNivel) => `${f.classe}${f.referencia}`;
