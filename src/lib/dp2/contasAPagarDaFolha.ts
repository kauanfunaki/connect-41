// As contas da folha no Contas a pagar do Connect (25/11/2026, funcionalidade-770).
//
// Ao fechar a competência mensal, o DP lança no Contas a pagar (/pagar) da
// empresa o que a folha gera de pagamento:
// - os líquidos dos colaboradores (uma conta, vence no 5º dia útil do mês
//   seguinte, CLT art. 459 § 1º);
// - o DARF da DCTFWeb: INSS a recolher + IRRF a recolher (dia 20 do mês
//   seguinte, antecipado para o dia útil anterior);
// - a guia do FGTS Digital (dia 20 do mês seguinte, também antecipado);
// - o DARF do PIS sobre a folha, quando há (dia 25, antecipado).
//
// Cada conta leva uma chave no número do documento ("DP2 2027-06 LIQUIDOS"):
// lançar de novo atualiza a que segue em aberto e não cria outra.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { feriadosNacionais } from "./calendario";

export type TipoDaContaDaFolha = "LIQUIDOS" | "DARF" | "FGTS" | "PIS";

export type ContaDaFolha = {
  tipo: TipoDaContaDaFolha;
  /** Vai no número do documento da conta: é por ela que não se duplica. */
  chave: string;
  descricao: string;
  valor: number;
  /** "AAAA-MM-DD". */
  vencimento: string;
  credor: { nome: string; documento: string | null };
  /** Como achar a categoria no plano de contas da empresa, pelo nome. */
  categoria: RegExp;
};

export const CREDOR_DOS_LIQUIDOS = { nome: "Colaboradores — líquidos da folha", documento: null } as const;
export const RECEITA_FEDERAL = { nome: "Receita Federal do Brasil", documento: "00394460005887" } as const;
export const CAIXA_FGTS = { nome: "Caixa Econômica Federal — FGTS", documento: "00360305000104" } as const;

const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** O n-ésimo dia útil do mês (segunda a sábado, fora os feriados nacionais), como conta o salário. */
export function diaUtilDoMes(ano: number, mes: number, n: number): string {
  const feriados = new Set(feriadosNacionais(ano));
  let contados = 0;
  for (let dia = 1; dia <= 31; dia++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1) break;
    const data = iso(ano, mes, dia);
    if (d.getUTCDay() === 0 || feriados.has(data)) continue;
    if (++contados === n) return data;
  }
  return iso(ano, mes, 28);
}

/** O dia do mês, antecipado para o dia útil bancário anterior (segunda a sexta, fora os feriados). */
export function antecipadoAoDiaUtil(ano: number, mes: number, dia: number): string {
  const feriados = new Set(feriadosNacionais(ano));
  for (let d = dia; d >= 1; d--) {
    const data = new Date(Date.UTC(ano, mes - 1, d));
    const s = iso(ano, mes, d);
    if (data.getUTCDay() !== 0 && data.getUTCDay() !== 6 && !feriados.has(s)) return s;
  }
  return iso(ano, mes, dia);
}

/** As contas a pagar da competência mensal `ano`/`mes`; as de valor zero ficam de fora. */
export function contasDaFolha(e: { ano: number; mes: number; liquido: number; inssARecolher: number; irrfARecolher: number; pisARecolher: number; fgts: number }): ContaDaFolha[] {
  const [anoSeg, mesSeg] = e.mes === 12 ? [e.ano + 1, 1] : [e.ano, e.mes + 1];
  const ref = `${String(e.mes).padStart(2, "0")}/${e.ano}`;
  const prefixo = `DP2 ${e.ano}-${String(e.mes).padStart(2, "0")}`;
  const darf = r2(e.inssARecolher + e.irrfARecolher);
  const contas: ContaDaFolha[] = [
    { tipo: "LIQUIDOS", chave: `${prefixo} LIQUIDOS`, descricao: `Folha ${ref} — líquidos dos colaboradores`, valor: r2(e.liquido), vencimento: diaUtilDoMes(anoSeg, mesSeg, 5), credor: CREDOR_DOS_LIQUIDOS, categoria: /sal[aá]rio|folha|ordenado|remunera/i },
    { tipo: "DARF", chave: `${prefixo} DARF`, descricao: `Folha ${ref} — DARF da DCTFWeb (INSS ${e.inssARecolher.toFixed(2).replace(".", ",")} + IRRF ${e.irrfARecolher.toFixed(2).replace(".", ",")})`, valor: darf, vencimento: antecipadoAoDiaUtil(anoSeg, mesSeg, 20), credor: RECEITA_FEDERAL, categoria: /inss|previd|encargos? sociais|encargos? (sobre|da) folha|dctf/i },
    { tipo: "FGTS", chave: `${prefixo} FGTS`, descricao: `Folha ${ref} — FGTS Digital (GFD)`, valor: r2(e.fgts), vencimento: antecipadoAoDiaUtil(anoSeg, mesSeg, 20), credor: CAIXA_FGTS, categoria: /fgts/i },
    { tipo: "PIS", chave: `${prefixo} PIS`, descricao: `Folha ${ref} — DARF do PIS sobre a folha (8301)`, valor: r2(e.pisARecolher), vencimento: antecipadoAoDiaUtil(anoSeg, mesSeg, 25), credor: RECEITA_FEDERAL, categoria: /pis/i },
  ];
  return contas.filter((c) => c.valor > 0);
}

/** A categoria da conta no plano da empresa: a da empresa antes da do escritório; nenhuma = a conta fica para classificar. */
export function categoriaDaConta(conta: Pick<ContaDaFolha, "categoria">, categorias: readonly { id: string; name: string; companyId: string | null }[]): string | null {
  const casam = categorias.filter((c) => conta.categoria.test(c.name));
  return (casam.find((c) => c.companyId !== null) ?? casam[0])?.id ?? null;
}
