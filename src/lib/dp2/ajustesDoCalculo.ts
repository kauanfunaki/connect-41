// Ajuste manual do cálculo (25/11/2026, funcionalidade-768): "Utilitários ›
// Alteração de Cálculos" da Domínio — Cálculos, Provisão de Férias e Provisão
// de 13º Salário. O DP corrige um valor que o motor calculou (uma linha do
// holerite, o INSS, o IRRF, o FGTS ou uma provisão do mês), sempre com motivo.
//
// O ajuste fica guardado à parte (dp2_ajustes_de_calculo) e é aplicado por cima
// do resultado do motor toda vez que a competência é calculada: recalcular
// mantém o ajuste. Se a linha ajustada some do cálculo (o lançamento foi
// retirado, por exemplo), o ajuste não se aplica e vira um alerta.
//
// Puro, sem banco.

import { lerNumero } from "./entrada";
import type { CalculoDaPessoa, ItemDoHolerite, Provisoes } from "./mensal";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Os campos de provisão que se ajustam, com o nome da tela. */
export const PROVISOES_AJUSTAVEIS = {
  PROV_FERIAS: { campo: "ferias", nome: "Provisão de férias" },
  PROV_TERCO: { campo: "tercoFerias", nome: "Provisão do 1/3 de férias" },
  PROV_ENC_FERIAS: { campo: "encargosFerias", nome: "Encargos da provisão de férias" },
  PROV_DECIMO: { campo: "decimo", nome: "Provisão de 13º salário" },
  PROV_ENC_DECIMO: { campo: "encargosDecimo", nome: "Encargos da provisão de 13º" },
} as const satisfies Record<string, { campo: keyof Omit<Provisoes, "base" | "total" | "memoria">; nome: string }>;
type ChaveDeProvisao = keyof typeof PROVISOES_AJUSTAVEIS;

/** `ITEM:<código da rubrica>`, `FGTS` ou uma das provisões. */
export type CampoAjustavel = `ITEM:${string}` | "FGTS" | ChaveDeProvisao;

export type AjusteDoCalculo = { campo: string; valor: number; motivo: string };

/** O que ficou registrado no cálculo: de quanto para quanto, e por quê. */
export type AjusteAplicado = { campo: string; nome: string; de: number; para: number; motivo: string };

const ehProvisao = (c: string): c is ChaveDeProvisao => c in PROVISOES_AJUSTAVEIS;
const PAPEIS_DO_INSS = new Set(["INSS", "INSS_DECIMO"]);
const PAPEIS_DO_IRRF = new Set(["IRRF", "IRRF_DECIMO"]);

export const MAXIMO_DO_MOTIVO = 500;

/** Confere o que veio do formulário. O campo é conferido contra o cálculo na hora de aplicar. */
export function lerAjuste(campo: string, valorDigitado: string, motivo: string): { ok: true; ajuste: AjusteDoCalculo } | { ok: false; erro: string } {
  const c = campo.trim();
  if (!c || !(c === "FGTS" || ehProvisao(c) || (c.startsWith("ITEM:") && c.length > 5))) return { ok: false, erro: "Escolha o valor a ajustar." };
  const valor = lerNumero(valorDigitado);
  if (valor === null || !Number.isFinite(valor) || valor < 0) return { ok: false, erro: "Informe o novo valor (zero ou mais)." };
  const m = motivo.trim();
  if (m.length < 5) return { ok: false, erro: "Informe o motivo do ajuste." };
  return { ok: true, ajuste: { campo: c, valor: r2(valor), motivo: m.slice(0, MAXIMO_DO_MOTIVO) } };
}

/** As opções do formulário: as linhas do holerite, o FGTS e as provisões, com o valor de agora. */
export function camposAjustaveis(c: { itens: readonly ItemDoHolerite[]; fgts: number; provisoes: Provisoes }): { campo: CampoAjustavel; nome: string; valor: number }[] {
  const vistos = new Set<string>();
  const opcoes: { campo: CampoAjustavel; nome: string; valor: number }[] = [];
  for (const i of c.itens) {
    if (i.tipo === "INFORMATIVA" || vistos.has(i.codigo)) continue;
    vistos.add(i.codigo);
    opcoes.push({ campo: `ITEM:${i.codigo}`, nome: `${i.codigo} · ${i.nome}`, valor: somaDoCodigo(c.itens, i.codigo) });
  }
  opcoes.push({ campo: "FGTS", nome: "FGTS do mês", valor: c.fgts });
  for (const [k, p] of Object.entries(PROVISOES_AJUSTAVEIS) as [ChaveDeProvisao, (typeof PROVISOES_AJUSTAVEIS)[ChaveDeProvisao]][]) {
    opcoes.push({ campo: k, nome: p.nome, valor: c.provisoes[p.campo] });
  }
  return opcoes;
}

function somaDoCodigo(itens: readonly ItemDoHolerite[], codigo: string): number {
  return r2(itens.filter((i) => i.codigo === codigo && i.tipo !== "INFORMATIVA").reduce((s, i) => s + i.valor, 0));
}

const DUAS_CASAS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (n: number) => DUAS_CASAS.format(n);

/** O nome de um campo para a tela e a auditoria, mesmo quando a linha não existe mais. */
export function nomeDoCampo(campo: string, itens: readonly ItemDoHolerite[] = []): string {
  if (campo === "FGTS") return "FGTS do mês";
  if (ehProvisao(campo)) return PROVISOES_AJUSTAVEIS[campo].nome;
  const codigo = campo.slice(5);
  const item = itens.find((i) => i.codigo === codigo);
  return item ? `${item.codigo} · ${item.nome}` : `Rubrica ${codigo}`;
}

/**
 * Aplica os ajustes sobre o resultado do motor e refaz proventos, descontos,
 * líquido e os totais de encargos e provisões. A linha do holerite ajustada
 * passa a ter o valor do ajuste (as linhas do mesmo código viram uma só) e a
 * memória diz de quanto foi e por quê. Linha de INSS ou IRRF ajustada muda
 * também o INSS ou o IRRF da pessoa. Bases não mudam: o ajuste é do valor.
 */
export function aplicarAjustes(c: CalculoDaPessoa, ajustes: readonly AjusteDoCalculo[]): { calculo: CalculoDaPessoa; aplicados: AjusteAplicado[] } {
  if (ajustes.length === 0) return { calculo: c, aplicados: [] };
  let itens = [...c.itens];
  let { fgts } = c;
  const inss = { ...c.inss };
  const irrf = { ...c.irrf };
  const encargos = { ...c.encargos, memoria: [...c.encargos.memoria] };
  const provisoes = { ...c.provisoes, memoria: [...c.provisoes.memoria] };
  const alertas = [...c.alertas];
  const aplicados: AjusteAplicado[] = [];

  for (const a of ajustes) {
    const nota = (de: number) => `Ajuste manual: ${brl(de)} → ${brl(a.valor)} (${a.motivo})`;
    if (a.campo === "FGTS") {
      aplicados.push({ campo: a.campo, nome: "FGTS do mês", de: fgts, para: a.valor, motivo: a.motivo });
      encargos.memoria.push(`FGTS — ${nota(fgts)}`);
      encargos.total = r2(encargos.total - encargos.fgts + a.valor);
      encargos.fgts = a.valor;
      fgts = a.valor;
      continue;
    }
    if (ehProvisao(a.campo)) {
      const { campo, nome } = PROVISOES_AJUSTAVEIS[a.campo];
      const de = provisoes[campo];
      aplicados.push({ campo: a.campo, nome, de, para: a.valor, motivo: a.motivo });
      provisoes.memoria.push(`${nome} — ${nota(de)}`);
      provisoes[campo] = a.valor;
      continue;
    }
    const codigo = a.campo.slice(5);
    const indice = itens.findIndex((i) => i.codigo === codigo && i.tipo !== "INFORMATIVA");
    if (indice < 0) {
      alertas.push(`O ajuste manual de ${nomeDoCampo(a.campo)} não entrou: a rubrica não está mais no cálculo. Retire o ajuste ou lance a rubrica.`);
      continue;
    }
    const base = itens[indice];
    const de = somaDoCodigo(itens, codigo);
    const nome = `${base.codigo} · ${base.nome}`;
    aplicados.push({ campo: a.campo, nome, de, para: a.valor, motivo: a.motivo });
    const ajustada: ItemDoHolerite = { ...base, valor: a.valor, memoria: `${base.memoria}${base.memoria ? "; " : ""}${nota(de)}` };
    itens = itens.flatMap((i, k) => (k === indice ? [ajustada] : i.codigo === codigo && i.tipo !== "INFORMATIVA" ? [] : [i]));
    if (base.papel && PAPEIS_DO_INSS.has(base.papel)) {
      inss.valor = a.valor;
      inss.memoria = [...inss.memoria, nota(de)];
    }
    if (base.papel && PAPEIS_DO_IRRF.has(base.papel)) {
      irrf.valor = a.valor;
      irrf.memoria = [...irrf.memoria, nota(de)];
    }
  }

  let proventos = 0;
  let descontos = 0;
  for (const i of itens) {
    if (i.tipo === "PROVENTO") proventos += i.valor;
    else if (i.tipo === "DESCONTO") descontos += i.valor;
  }
  proventos = r2(proventos);
  descontos = r2(descontos);
  const liquido = r2(proventos - descontos);
  provisoes.total = r2(provisoes.ferias + provisoes.tercoFerias + provisoes.decimo + provisoes.encargosFerias + provisoes.encargosDecimo);
  if (liquido < 0 && c.liquido >= 0) alertas.push("Líquido negativo depois do ajuste manual: os descontos passaram dos proventos.");

  return { calculo: { ...c, itens, proventos, descontos, liquido, inss, irrf, fgts, encargos, provisoes, alertas }, aplicados };
}
