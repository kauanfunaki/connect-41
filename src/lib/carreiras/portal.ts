// Regras do portal público de vagas (/carreiras/[slug]) que não dependem de
// banco: rótulos, faixa salarial, leitura dos filtros da URL e o filtro em si.
//
// Decisões do Kauan em 23/09: faixa salarial opcional por vaga (só aparece com
// `showSalary`); filtros por cidade, modalidade, tipo de contrato e área (o
// cargo da vaga), além da busca por texto.
//
// O filtro roda em memória, sobre as vagas abertas e públicas do escritório.
// São dezenas, não milhares — e filtrar aqui deixa a busca sem acento e sem
// caixa igual à que o candidato espera, o que o LIKE do MySQL não garante em
// todo collation.

import type { VagaContrato, VagaModalidade } from "@/generated/prisma/enums";

export const MODALIDADE_LABEL: Record<VagaModalidade, string> = {
  PRESENCIAL: "Presencial",
  HIBRIDO: "Híbrido",
  REMOTO: "Remoto",
};

export const CONTRATO_LABEL: Record<VagaContrato, string> = {
  CLT: "CLT",
  PJ: "PJ",
  ESTAGIO: "Estágio",
  TEMPORARIO: "Temporário",
  APRENDIZ: "Jovem aprendiz",
};

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "R$ 3.000 a R$ 4.500", "A partir de R$ 3.000", "Até R$ 4.500" ou "A combinar". */
export function faixaSalarialLegivel(v: { salaryMin: number | null; salaryMax: number | null; showSalary: boolean }): string {
  if (!v.showSalary) return "A combinar";
  const { salaryMin: min, salaryMax: max } = v;
  if (min !== null && max !== null) return min === max ? REAIS.format(min) : `${REAIS.format(min)} a ${REAIS.format(max)}`;
  if (min !== null) return `A partir de ${REAIS.format(min)}`;
  if (max !== null) return `Até ${REAIS.format(max)}`;
  return "A combinar";
}

/**
 * A faixa que o recrutador digitou, ou por que não dá. Aceita "3.500,00" e
 * "3500.5". Mostrar sem nenhum valor é recusado: o candidato veria "A
 * combinar" com a chave ligada, e o recrutador acharia que publicou salário.
 */
export function validarFaixa(
  minTexto: string | null,
  maxTexto: string | null,
  mostrar: boolean
): { ok: true; salaryMin: number | null; salaryMax: number | null; showSalary: boolean } | { ok: false; erro: string } {
  const ler = (t: string | null): number | null | "invalido" => {
    const s = (t ?? "").trim();
    if (!s) return null;
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : "invalido";
  };
  const min = ler(minTexto);
  const max = ler(maxTexto);
  if (min === "invalido" || max === "invalido") return { ok: false, erro: "Salário precisa ser um valor em reais, maior que zero." };
  if (min !== null && max !== null && min > max) return { ok: false, erro: "O salário mínimo da faixa está maior que o máximo." };
  if (mostrar && min === null && max === null) return { ok: false, erro: "Para mostrar o salário no portal, preencha pelo menos um valor da faixa." };
  return { ok: true, salaryMin: min, salaryMax: max, showSalary: mostrar };
}

export type FiltrosDoPortal = {
  busca: string;
  cidade: string;
  modalidade: VagaModalidade | "";
  contrato: VagaContrato | "";
  area: string;
};

const MODALIDADES = Object.keys(MODALIDADE_LABEL) as VagaModalidade[];
const CONTRATOS = Object.keys(CONTRATO_LABEL) as VagaContrato[];

/** Os filtros da URL, com o que não é reconhecido descartado. */
export function lerFiltros(p: Record<string, string | string[] | undefined>): FiltrosDoPortal {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 80);
  const modalidade = um(p.modalidade).toUpperCase();
  const contrato = um(p.contrato).toUpperCase();
  return {
    busca: um(p.q),
    cidade: um(p.cidade),
    modalidade: (MODALIDADES as string[]).includes(modalidade) ? (modalidade as VagaModalidade) : "",
    contrato: (CONTRATOS as string[]).includes(contrato) ? (contrato as VagaContrato) : "",
    area: um(p.area),
  };
}

export function temFiltro(f: FiltrosDoPortal): boolean {
  return !!(f.busca || f.cidade || f.modalidade || f.contrato || f.area);
}

/** Sem acento, sem caixa, espaço colapsado. */
export function normalizar(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type VagaDoPortal = {
  title: string;
  publicDescription: string | null;
  empresa: string;
  cidade: string | null;
  area: string | null;
  workMode: VagaModalidade | null;
  contractType: VagaContrato | null;
};

/**
 * As vagas que passam nos filtros. A busca procura cada palavra em título,
 * descrição, empresa e área — todas precisam aparecer, em qualquer ordem, que é
 * o que "analista fiscal" deve significar para quem digita.
 */
export function filtrarVagas<T extends VagaDoPortal>(vagas: T[], f: FiltrosDoPortal): T[] {
  const palavras = normalizar(f.busca).split(" ").filter(Boolean);
  const cidade = normalizar(f.cidade);
  const area = normalizar(f.area);
  return vagas.filter((v) => {
    if (cidade && normalizar(v.cidade) !== cidade) return false;
    if (area && normalizar(v.area) !== area) return false;
    if (f.modalidade && v.workMode !== f.modalidade) return false;
    if (f.contrato && v.contractType !== f.contrato) return false;
    if (palavras.length) {
      const texto = normalizar([v.title, v.publicDescription, v.empresa, v.area].filter(Boolean).join(" "));
      if (!palavras.every((p) => texto.includes(p))) return false;
    }
    return true;
  });
}

/** Os valores que existem nas vagas abertas — o filtro só oferece o que tem resultado. */
export function opcoesDosFiltros(vagas: VagaDoPortal[]): {
  cidades: string[];
  areas: string[];
  modalidades: VagaModalidade[];
  contratos: VagaContrato[];
} {
  const unicos = (xs: (string | null)[]) => {
    const porChave = new Map<string, string>();
    for (const x of xs) if (x && x.trim() && !porChave.has(normalizar(x))) porChave.set(normalizar(x), x.trim());
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  };
  return {
    cidades: unicos(vagas.map((v) => v.cidade)),
    areas: unicos(vagas.map((v) => v.area)),
    modalidades: MODALIDADES.filter((m) => vagas.some((v) => v.workMode === m)),
    contratos: CONTRATOS.filter((c) => vagas.some((v) => v.contractType === c)),
  };
}
