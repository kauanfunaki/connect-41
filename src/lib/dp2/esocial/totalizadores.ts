// Totalizadores do eSocial (26/11/2026, funcionalidade-755): o que o eSocial
// calcula a partir dos periódicos e devolve — S-5001 (INSS do trabalhador),
// S-5002 (IRRF do trabalhador), S-5003 (FGTS do trabalhador), S-5011 (INSS da
// empresa) e S-5013 (FGTS da empresa). Lidos dos XML de retorno (soltos ou em
// .zip, do "eSocial Download" do portal ou da consulta do lote) e comparados
// com o cálculo do DP 2. Campos conforme o leiaute S-1.3 (NT 08/2026).
//
// Puro, sem banco.

import { XMLParser } from "fast-xml-parser";
import { abrirArquivos, type ArquivoDoEsocial } from "./importacao";

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const r2 = (n: number) => Math.round(n * 100) / 100;

type No = Record<string, unknown>;
const objeto = (v: unknown): v is No => typeof v === "object" && v !== null && !Array.isArray(v);

/** Todos os nós com esse nome, em qualquer profundidade. */
function todos(no: unknown, nome: string, saida: unknown[] = []): unknown[] {
  if (Array.isArray(no)) {
    for (const x of no) todos(x, nome, saida);
    return saida;
  }
  if (!objeto(no)) return saida;
  for (const [k, v] of Object.entries(no)) {
    if (k === nome) {
      if (Array.isArray(v)) saida.push(...v);
      else saida.push(v);
    } else todos(v, nome, saida);
  }
  return saida;
}

const texto = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || null;
  if (objeto(v) && v["#text"] !== undefined) return String(v["#text"]).trim() || null;
  return null;
};
const primeiro = (no: unknown, nome: string) => texto(todos(no, nome)[0]);
/** Soma os valores de um campo em qualquer profundidade (decimal com ponto, como no eSocial). */
const soma = (no: unknown, nome: string) => r2(todos(no, nome).reduce<number>((s, v) => s + (Number(texto(v)) || 0), 0));
const digitos = (s: string | null) => (s ?? "").replace(/\D/g, "");

export type TipoDeTotalizador = "S-5001" | "S-5002" | "S-5003" | "S-5011" | "S-5013";

/** O nome do evento no XML de cada totalizador. */
export const TAG_DO_TOTALIZADOR: Record<TipoDeTotalizador, string> = {
  "S-5001": "evtBasesTrab",
  "S-5002": "evtIrrfBenef",
  "S-5003": "evtBasesFGTS",
  "S-5011": "evtCS",
  "S-5013": "evtFGTS",
};

export type TotalizadorLido = {
  tipo: TipoDeTotalizador;
  /** "AAAA-MM" (mensal) ou "AAAA" (13º). */
  perApur: string;
  /** Raiz do CNPJ (ou o CPF) do empregador. */
  empregador: string;
  /** CPF do trabalhador; nulo nos da empresa (S-5011, S-5013). */
  cpf: string | null;
  /** O recibo do evento que deu origem (S-1200, S-1210 ou S-1299). */
  reciboBase: string | null;
  valores: Record<string, number>;
  arquivo: string;
};

function lerUm(tipo: TipoDeTotalizador, no: unknown, arquivo: string): TotalizadorLido | null {
  const perApur = primeiro(no, "perApur");
  if (!perApur) return null;
  const base = { tipo, perApur, empregador: digitos(primeiro(todos(no, "ideEmpregador")[0], "nrInsc")).slice(0, 14), reciboBase: primeiro(no, "nrRecArqBase"), arquivo };
  switch (tipo) {
    case "S-5001":
      // infoCpCalc: vrCpSeg = INSS que o eSocial calculou; vrDescSeg = o que o empregador descontou.
      return { ...base, cpf: digitos(primeiro(no, "cpfTrab")) || null, valores: { inssCalculado: soma(todos(no, "infoCpCalc"), "vrCpSeg"), inssDescontado: soma(todos(no, "infoCpCalc"), "vrDescSeg") } };
    case "S-5002": {
      // O consolidado (totInfoIR) quando vem; senão a soma por demonstrativo. vlrCRMen + vlrCR13Men = IRRF retido.
      const consolidado = todos(no, "consolidApurMen");
      const fonte = consolidado.length ? consolidado : todos(no, "totApurMen");
      return {
        ...base,
        cpf: digitos(primeiro(no, "cpfBenef")) || null,
        valores: { irrf: r2(soma(fonte, "vlrCRMen") + soma(fonte, "vlrCR13Men")), rendimentosTributaveis: r2(soma(fonte, "vlrRendTrib") + soma(fonte, "vlrRendTrib13")) },
      };
    }
    case "S-5003":
      // basePerApur: remFGTS = base; dpsFGTS = depósito.
      return { ...base, cpf: digitos(primeiro(no, "cpfTrab")) || null, valores: { baseFgts: soma(todos(no, "basePerApur"), "remFGTS"), fgts: soma(todos(no, "basePerApur"), "dpsFGTS") } };
    case "S-5011": {
      const contribuicoes: Record<string, number> = {};
      for (const c of todos(no, "infoCRContrib")) {
        const cr = primeiro(c, "tpCR");
        if (cr) contribuicoes[`cr${cr}`] = r2((contribuicoes[`cr${cr}`] ?? 0) + (Number(primeiro(c, "vrCR")) || 0));
      }
      return {
        ...base,
        cpf: null,
        reciboBase: primeiro(todos(no, "infoCS")[0], "nrRecArqBase") ?? base.reciboBase,
        valores: {
          inssDescontado: soma(todos(no, "infoCPSeg"), "vrDescCP"),
          inssCalculado: soma(todos(no, "infoCPSeg"), "vrCpSeg"),
          salarioFamilia: soma(todos(no, "basesCp"), "vrSalFam"),
          totalDasContribuicoes: r2(Object.values(contribuicoes).reduce((s, v) => s + v, 0)),
          ...contribuicoes,
        },
      };
    }
    case "S-5013":
      return { ...base, cpf: null, valores: { baseFgts: soma(todos(no, "basePerApur"), "baseFGTS"), fgts: soma(todos(no, "basePerApur"), "vrFGTS") } };
  }
}

/** Lê os totalizadores dos arquivos (XML soltos, .zip ou retorno de lote com vários eventos). */
export function lerTotalizadores(arquivos: ArquivoDoEsocial[]): { lidos: TotalizadorLido[]; problemas: string[] } {
  const problemas: string[] = [];
  const lidos: TotalizadorLido[] = [];
  let xmls: { nome: string; xml: string }[] = [];
  try {
    xmls = abrirArquivos(arquivos);
  } catch {
    return { lidos, problemas: ["Não consegui abrir o arquivo. Mande os .xml de retorno do eSocial ou o .zip baixado do portal."] };
  }
  if (xmls.length === 0) problemas.push("Nenhum XML encontrado nos arquivos enviados.");
  for (const { nome, xml } of xmls) {
    let arvore: unknown;
    try {
      arvore = parser.parse(xml);
    } catch {
      problemas.push(`${nome}: não é um XML válido.`);
      continue;
    }
    const antes = lidos.length;
    for (const [tipo, tag] of Object.entries(TAG_DO_TOTALIZADOR) as [TipoDeTotalizador, string][]) {
      for (const no of todos(arvore, tag)) {
        const t = lerUm(tipo, no, nome);
        if (t) lidos.push(t);
      }
    }
    if (lidos.length === antes) problemas.push(`${nome}: nenhum totalizador (S-5001, S-5002, S-5003, S-5011 ou S-5013) no arquivo.`);
  }
  return { lidos, problemas };
}

// ─── Comparação com o cálculo ───────────────────────────────────────────────

export type PessoaDoCalculo = { personId: string; nome: string; cpf: string | null; inss: number; irrf: number; baseFgts: number; fgts: number };

export type Diferenca = { calculo: number; esocial: number | null; diferenca: number | null };
const comparar = (calculo: number, esocial: number | null | undefined): Diferenca => ({
  calculo: r2(calculo),
  esocial: esocial === undefined || esocial === null ? null : r2(esocial),
  diferenca: esocial === undefined || esocial === null ? null : r2(calculo - esocial),
});

export type LinhaDaConferencia = { personId: string | null; nome: string; cpf: string | null; inss: Diferenca; irrf: Diferenca; fgts: Diferenca; diverge: boolean };

/** Diferença acima de 1 centavo conta como divergência. */
export const TOLERANCIA = 0.01;
const diverge = (...d: Diferenca[]) => d.some((x) => x.diferenca !== null && Math.abs(x.diferenca) > TOLERANCIA);

/**
 * Compara o cálculo de cada pessoa com o que o eSocial devolveu: o INSS
 * descontado (S-5001), o IRRF (S-5002) e o depósito do FGTS (S-5003); e o
 * total da folha com o S-5011 (INSS dos segurados) e o S-5013 (FGTS).
 * Totalizador de CPF que não está no cálculo aparece como linha à parte.
 */
export function conferirTotalizadores(
  calculos: readonly PessoaDoCalculo[],
  lidos: readonly Pick<TotalizadorLido, "tipo" | "cpf" | "valores">[]
): { linhas: LinhaDaConferencia[]; total: { inss: Diferenca; fgts: Diferenca; irrf: Diferenca }; divergentes: number; semTotalizador: number } {
  const doCpf = (tipo: TipoDeTotalizador, cpf: string | null) => (cpf ? lidos.filter((l) => l.tipo === tipo && l.cpf === cpf) : []);
  const somar = (ls: readonly { valores: Record<string, number> }[], campo: string) => (ls.length ? r2(ls.reduce((s, l) => s + (l.valores[campo] ?? 0), 0)) : null);
  const linhas: LinhaDaConferencia[] = calculos.map((c) => {
    const cpf = digitos(c.cpf) || null;
    const inss = comparar(c.inss, somar(doCpf("S-5001", cpf), "inssDescontado"));
    const irrf = comparar(c.irrf, somar(doCpf("S-5002", cpf), "irrf"));
    const fgts = comparar(c.fgts, somar(doCpf("S-5003", cpf), "fgts"));
    return { personId: c.personId, nome: c.nome, cpf, inss, irrf, fgts, diverge: diverge(inss, irrf, fgts) };
  });
  const conhecidos = new Set(linhas.map((l) => l.cpf).filter(Boolean));
  const sobrando = [...new Set(lidos.filter((l) => l.cpf && !conhecidos.has(l.cpf)).map((l) => l.cpf as string))];
  for (const cpf of sobrando) {
    const inss = comparar(0, somar(doCpf("S-5001", cpf), "inssDescontado"));
    const irrf = comparar(0, somar(doCpf("S-5002", cpf), "irrf"));
    const fgts = comparar(0, somar(doCpf("S-5003", cpf), "fgts"));
    linhas.push({ personId: null, nome: "Fora do cálculo do DP 2", cpf, inss, irrf, fgts, diverge: true });
  }
  const empresa = (tipo: TipoDeTotalizador, campo: string) => somar(lidos.filter((l) => l.tipo === tipo && !l.cpf), campo);
  const totalDe = (campo: "inss" | "fgts" | "irrf") => r2(calculos.reduce((s, c) => s + c[campo], 0));
  return {
    linhas,
    total: {
      inss: comparar(totalDe("inss"), empresa("S-5011", "inssDescontado")),
      fgts: comparar(totalDe("fgts"), empresa("S-5013", "fgts")),
      irrf: comparar(totalDe("irrf"), somar(lidos.filter((l) => l.tipo === "S-5002"), "irrf")),
    },
    divergentes: linhas.filter((l) => l.diverge).length,
    semTotalizador: linhas.filter((l) => l.personId && l.inss.esocial === null && l.irrf.esocial === null && l.fgts.esocial === null).length,
  };
}
