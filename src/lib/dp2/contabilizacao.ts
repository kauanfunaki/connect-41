// Lançamentos contábeis da folha do DP 2 (12/11/2026, fase 2).
//
// O que a Domínio Folha mandava para a Domínio Contabilidade, aqui num
// arquivo para importar:
// - provento: débito na despesa da rubrica, crédito em salários a pagar;
// - desconto: débito em salários a pagar, crédito na conta da rubrica (INSS a
//   recolher, IRRF a recolher, adiantamentos…);
// - FGTS do mês: débito na despesa de FGTS, crédito em FGTS a recolher;
// - encargos da empresa (INSS patronal, RAT, terceiros): despesa × a recolher;
// - provisões de férias (com 1/3) e 13º, e os encargos sobre elas.
//
// As contas de cada provento e desconto vêm da rubrica (débito e crédito); a
// do líquido, dos encargos e das provisões vêm das "contas da folha" do
// escritório. Conta que falta não some: o lançamento sai com "(sem conta)" e
// a tela avisa qual configurar.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";

export type ContasDaFolha = {
  salariosAPagar: string;
  inssEmpresaDespesa: string;
  inssARecolher: string;
  fgtsDespesa: string;
  fgtsARecolher: string;
  provisaoFeriasDespesa: string;
  provisaoFerias: string;
  provisaoDecimoDespesa: string;
  provisaoDecimo: string;
};

export const CAMPOS_DAS_CONTAS: { chave: keyof ContasDaFolha; rotulo: string; ajuda: string }[] = [
  { chave: "salariosAPagar", rotulo: "Salários a pagar", ajuda: "Crédito dos proventos e débito dos descontos (o líquido)." },
  { chave: "inssEmpresaDespesa", rotulo: "Despesa de INSS da empresa", ajuda: "INSS patronal, RAT e terceiros." },
  { chave: "inssARecolher", rotulo: "INSS a recolher", ajuda: "Contrapartida do INSS da empresa." },
  { chave: "fgtsDespesa", rotulo: "Despesa de FGTS", ajuda: "O FGTS do mês." },
  { chave: "fgtsARecolher", rotulo: "FGTS a recolher", ajuda: "Contrapartida do FGTS." },
  { chave: "provisaoFeriasDespesa", rotulo: "Despesa com provisão de férias", ajuda: "Férias, 1/3 e encargos do mês." },
  { chave: "provisaoFerias", rotulo: "Provisão de férias", ajuda: "Passivo das férias." },
  { chave: "provisaoDecimoDespesa", rotulo: "Despesa com provisão de 13º", ajuda: "13º e encargos do mês." },
  { chave: "provisaoDecimo", rotulo: "Provisão de 13º", ajuda: "Passivo do 13º." },
];

export const CONTAS_VAZIAS: ContasDaFolha = Object.fromEntries(CAMPOS_DAS_CONTAS.map((c) => [c.chave, ""])) as ContasDaFolha;

export function lerContasDaFolha(bruto: unknown): ContasDaFolha {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const r = { ...CONTAS_VAZIAS };
  for (const { chave } of CAMPOS_DAS_CONTAS) if (typeof o[chave] === "string") r[chave] = (o[chave] as string).trim().slice(0, 40);
  return r;
}

export type RubricaContabil = { codigo: string; nome: string; contaDebito: string | null; contaCredito: string | null };

export type ItemContabil = { codigo: string; nome: string; tipo: string; valor: number };

export type CalculoContabil = {
  itens: ItemContabil[];
  encargos: { inssEmpresa: number; rat: number; terceiros: number };
  provisoes: { ferias: number; tercoFerias: number; decimo: number; encargosFerias: number; encargosDecimo: number };
};

export type Lancamento = { debito: string; credito: string; valor: number; historico: string };

export const SEM_CONTA = "(sem conta)";

export function contabilizar(
  calculos: readonly CalculoContabil[],
  rubricas: ReadonlyMap<string, RubricaContabil>,
  contas: ContasDaFolha,
  referencia: string
): { lancamentos: Lancamento[]; faltam: string[] } {
  const soma = new Map<string, Lancamento>();
  const faltam = new Set<string>();
  const conta = (c: string | null | undefined, nome: string) => {
    const t = (c ?? "").trim();
    if (!t) faltam.add(nome);
    return t || SEM_CONTA;
  };
  const somar = (debito: string, credito: string, valor: number, historico: string) => {
    if (!(valor > 0)) return;
    const k = `${debito}|${credito}|${historico}`;
    const atual = soma.get(k);
    if (atual) atual.valor = r2(atual.valor + valor);
    else soma.set(k, { debito, credito, valor: r2(valor), historico });
  };
  const salarios = () => conta(contas.salariosAPagar, "Salários a pagar (contas da folha)");

  for (const c of calculos) {
    for (const i of c.itens) {
      const r = rubricas.get(i.codigo);
      const nome = r?.nome ?? i.nome;
      const historico = `${nome} ${referencia}`;
      if (i.tipo === "PROVENTO") somar(conta(r?.contaDebito, `débito da rubrica ${i.codigo} · ${nome}`), r?.contaCredito?.trim() || salarios(), i.valor, historico);
      else if (i.tipo === "DESCONTO") somar(r?.contaDebito?.trim() || salarios(), conta(r?.contaCredito, `crédito da rubrica ${i.codigo} · ${nome}`), i.valor, historico);
      else if (i.tipo === "INFORMATIVA" && /fgts/i.test(nome)) {
        somar(r?.contaDebito?.trim() || conta(contas.fgtsDespesa, "Despesa de FGTS (contas da folha)"), r?.contaCredito?.trim() || conta(contas.fgtsARecolher, "FGTS a recolher (contas da folha)"), i.valor, historico);
      }
    }
    const patronal = r2(c.encargos.inssEmpresa + c.encargos.rat + c.encargos.terceiros);
    somar(conta(contas.inssEmpresaDespesa, "Despesa de INSS da empresa (contas da folha)"), conta(contas.inssARecolher, "INSS a recolher (contas da folha)"), patronal, `INSS da empresa, RAT e terceiros ${referencia}`);
    const p = c.provisoes;
    somar(conta(contas.provisaoFeriasDespesa, "Despesa com provisão de férias (contas da folha)"), conta(contas.provisaoFerias, "Provisão de férias (contas da folha)"), r2(p.ferias + p.tercoFerias + p.encargosFerias), `Provisão de férias ${referencia}`);
    somar(conta(contas.provisaoDecimoDespesa, "Despesa com provisão de 13º (contas da folha)"), conta(contas.provisaoDecimo, "Provisão de 13º (contas da folha)"), r2(p.decimo + p.encargosDecimo), `Provisão de 13º ${referencia}`);
  }
  return { lancamentos: [...soma.values()].sort((a, b) => a.historico.localeCompare(b.historico, "pt-BR")), faltam: [...faltam] };
}

/** O CSV para importar: Data;Débito;Crédito;Valor;Histórico, com vírgula decimal. */
export function csvDosLancamentos(lancamentos: readonly Lancamento[], data: string): string {
  const dataBr = data.split("-").reverse().join("/");
  const esc = (t: string) => (/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const linhas = ["Data;Débito;Crédito;Valor;Histórico", ...lancamentos.map((l) => [dataBr, l.debito, l.credito, l.valor.toFixed(2).replace(".", ","), esc(l.historico)].join(";"))];
  return "﻿" + linhas.join("\r\n") + "\r\n";
}
