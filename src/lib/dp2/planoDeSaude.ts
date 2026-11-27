// Plano de saúde e odontológico do colaborador (27/11/2026, funcionalidade-762).
//
// A empresa cadastra os planos (operadora com CNPJ e registro na ANS, a parte
// do empregado pelo titular e por dependente). A adesão liga o colaborador a
// um plano, com os dependentes incluídos e o período. Na folha do mês, a parte
// do empregado sai como desconto (sem efeito no INSS, no FGTS e no IRRF do
// mês: a despesa médica só deduz no ajuste anual). A coparticipação do mês é
// lançada pelo DP na rubrica própria.
//
// No eSocial, o S-1210 leva no infoIRComplem o que o titular e cada dependente
// pagaram ao plano (planSaude) e a previdência complementar deduzida no IRRF
// (infoIRCR/previdCompl). É o que substituiu a DIRF.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { lerNumero } from "./entrada";
import { cnpjValido } from "./esocial/documentos";
import { reais } from "./formato";

export const TIPOS_DE_PLANO: Record<string, string> = { SAUDE: "Plano de saúde", ODONTO: "Plano odontológico" };

export type Plano = { nome: string; tipo: "SAUDE" | "ODONTO"; cnpjOperadora: string; registroAns: string; valorTitular: number; valorDependente: number };

const digitos = (v: string) => v.replace(/\D/g, "");
const ehData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function lerPlano(e: { nome: string; tipo: string; cnpjOperadora: string; registroAns: string; valorTitular: string; valorDependente: string }): { ok: true; plano: Plano } | { ok: false; erro: string } {
  const nome = e.nome.trim().slice(0, 120);
  if (nome.length < 3) return { ok: false, erro: "Dê um nome ao plano (operadora e produto)." };
  if (e.tipo !== "SAUDE" && e.tipo !== "ODONTO") return { ok: false, erro: "Escolha plano de saúde ou odontológico." };
  const cnpjOperadora = digitos(e.cnpjOperadora);
  if (!cnpjValido(cnpjOperadora)) return { ok: false, erro: "Informe o CNPJ da operadora (vai no S-1210)." };
  const registroAns = digitos(e.registroAns);
  if (registroAns && registroAns.length !== 6) return { ok: false, erro: "O registro da operadora na ANS tem 6 algarismos." };
  const valorTitular = e.valorTitular.trim() ? lerNumero(e.valorTitular) : 0;
  const valorDependente = e.valorDependente.trim() ? lerNumero(e.valorDependente) : 0;
  if (valorTitular === null || valorTitular < 0 || valorDependente === null || valorDependente < 0) return { ok: false, erro: "Os valores do titular e do dependente não podem ser negativos." };
  if (valorTitular === 0 && valorDependente === 0) return { ok: false, erro: "Informe a parte do empregado (titular ou dependente): é o que desconta na folha." };
  return { ok: true, plano: { nome, tipo: e.tipo, cnpjOperadora, registroAns, valorTitular: r2(valorTitular), valorDependente: r2(valorDependente) } };
}

export function lerPeriodoDaAdesao(e: { inicio: string; fim: string }): { ok: true; inicio: string; fim: string | null } | { ok: false; erro: string } {
  if (!ehData(e.inicio)) return { ok: false, erro: "Informe desde quando o colaborador está no plano." };
  const fim = ehData(e.fim) ? e.fim : null;
  if (fim && fim < e.inicio) return { ok: false, erro: "O fim da adesão é antes do início." };
  return { ok: true, inicio: e.inicio, fim };
}

/** A adesão vale no mês: começou até o fim do mês e não terminou antes do começo dele. Desconta o mês inteiro. */
export function adesaoNoMes(a: { inicio: string; fim: string | null }, ano: number, mes: number): boolean {
  const inicioDoMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimDoMes = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return a.inicio <= fimDoMes && (!a.fim || a.fim >= inicioDoMes);
}

export type PlanoNoMes = { tipo: "SAUDE" | "ODONTO"; nome: string; valorTitular: number; valorDependente: number; dependentes: number };

/** A parte do empregado no mês: titular + dependentes × valor por dependente. */
export function descontoDoPlano(p: PlanoNoMes): { valor: number; memoria: string } {
  const deps = r2(p.dependentes * p.valorDependente);
  const valor = r2(p.valorTitular + deps);
  const partes = [`titular ${reais(p.valorTitular)}`];
  if (p.dependentes > 0) partes.push(`${p.dependentes} dependente(s) × ${reais(p.valorDependente)} = ${reais(deps)}`);
  return { valor, memoria: `${p.nome}: ${partes.join(" + ")} (parte do empregado; sem efeito no INSS, FGTS e IRRF do mês)` };
}

// ─── S-1210: infoIRComplem ──────────────────────────────────────────────────

export type PlanoParaS1210 = { cnpjOperadora: string; registroAns: string | null; titular: number; dependentes: { cpf: string | null; nome: string; valor: number }[] };

/**
 * O que vai no planSaude do S-1210, por operadora: o titular paga a parte dele
 * e a coparticipação do mês (somada ao primeiro plano de saúde); cada
 * dependente com CPF, a parte dele. Dependente sem CPF fica de fora e vira pendência.
 */
export function planosParaS1210(
  adesoes: readonly { plano: Pick<Plano, "tipo" | "cnpjOperadora" | "registroAns" | "valorTitular" | "valorDependente">; dependentes: readonly { cpf: string | null; nome: string }[] }[],
  coparticipacao: number
): { planos: PlanoParaS1210[]; semCpf: string[] } {
  const planos: PlanoParaS1210[] = [];
  const semCpf: string[] = [];
  let copart = r2(Math.max(0, coparticipacao));
  for (const a of adesoes) {
    let titular = a.plano.valorTitular;
    if (copart > 0 && a.plano.tipo === "SAUDE") {
      titular = r2(titular + copart);
      copart = 0;
    }
    const deps = a.dependentes.map((d) => ({ cpf: d.cpf ? digitos(d.cpf) : null, nome: d.nome, valor: a.plano.valorDependente }));
    for (const d of deps) if (!d.cpf) semCpf.push(d.nome);
    planos.push({ cnpjOperadora: a.plano.cnpjOperadora, registroAns: a.plano.registroAns || null, titular, dependentes: deps.filter((d) => d.cpf) });
  }
  // Coparticipação sem plano de saúde no mês: vai no primeiro plano (odontológico).
  if (copart > 0 && planos.length) planos[0].titular = r2(planos[0].titular + copart);
  return { planos, semCpf };
}
