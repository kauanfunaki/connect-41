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
  /** A UF (14/10/2026, 41 Carreiras): vagas de empresas clientes em mais de um estado. */
  uf: string;
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
  const uf = um(p.uf).toUpperCase();
  return {
    busca: um(p.q),
    cidade: um(p.cidade),
    uf: /^[A-Z]{2}$/.test(uf) ? uf : "",
    modalidade: (MODALIDADES as string[]).includes(modalidade) ? (modalidade as VagaModalidade) : "",
    contrato: (CONTRATOS as string[]).includes(contrato) ? (contrato as VagaContrato) : "",
    area: um(p.area),
  };
}

export function temFiltro(f: FiltrosDoPortal): boolean {
  return !!(f.busca || f.cidade || f.uf || f.modalidade || f.contrato || f.area);
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
  /** UF do local da vaga (ver `localDaVaga`). */
  uf?: string | null;
  area: string | null;
  workMode: VagaModalidade | null;
  contractType: VagaContrato | null;
};

/**
 * As vagas que passam nos filtros. A busca procura cada palavra em título,
 * descrição, empresa, área, cidade e UF — todas precisam aparecer, em qualquer
 * ordem, que é o que "analista fiscal" deve significar para quem digita. A
 * cidade entrou em 14/10/2026 (41 Carreiras): "fiscal curitiba" acha a vaga.
 */
export function filtrarVagas<T extends VagaDoPortal>(vagas: T[], f: FiltrosDoPortal): T[] {
  const palavras = normalizar(f.busca).split(" ").filter(Boolean);
  const cidade = normalizar(f.cidade);
  const uf = normalizar(f.uf);
  const area = normalizar(f.area);
  return vagas.filter((v) => {
    if (cidade && normalizar(v.cidade) !== cidade) return false;
    if (uf && normalizar(v.uf) !== uf) return false;
    if (area && normalizar(v.area) !== area) return false;
    if (f.modalidade && v.workMode !== f.modalidade) return false;
    if (f.contrato && v.contractType !== f.contrato) return false;
    if (palavras.length) {
      const texto = normalizar([v.title, v.publicDescription, v.empresa, v.area, v.cidade, v.uf].filter(Boolean).join(" "));
      if (!palavras.every((p) => texto.includes(p))) return false;
    }
    return true;
  });
}

/** Os valores que existem nas vagas abertas — o filtro só oferece o que tem resultado. */
export function opcoesDosFiltros(vagas: VagaDoPortal[]): {
  cidades: string[];
  ufs: string[];
  areas: string[];
  modalidades: VagaModalidade[];
  contratos: VagaContrato[];
} {
  const unicos = (xs: (string | null | undefined)[]) => {
    const porChave = new Map<string, string>();
    for (const x of xs) if (x && x.trim() && !porChave.has(normalizar(x))) porChave.set(normalizar(x), x.trim());
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  };
  return {
    cidades: unicos(vagas.map((v) => v.cidade)),
    ufs: unicos(vagas.map((v) => v.uf?.toUpperCase())),
    areas: unicos(vagas.map((v) => v.area)),
    modalidades: MODALIDADES.filter((m) => vagas.some((v) => v.workMode === m)),
    contratos: CONTRATOS.filter((c) => vagas.some((v) => v.contractType === c)),
  };
}

// ─── 2ª leva (23/09): prazo, benefícios, local próprio, paginação ──────────

/**
 * Hoje em Brasília, como data-calendário (meia-noite UTC) — a mesma forma em
 * que o prazo é gravado. Comparar com o dia de Brasília, e não com o instante
 * UTC, é o que faz o prazo valer até as 23h59 daqui, e não até as 21h.
 */
export function hojeEmBrasilia(agora: Date): Date {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(agora)
    .split("-");
  return new Date(`${a}-${m}-${d}T00:00:00Z`);
}

/** O filtro do Prisma para "ainda aceita inscrição": sem prazo, ou prazo de hoje em diante. */
export function whereDoPrazo(agora: Date) {
  return { OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: hojeEmBrasilia(agora) } }] };
}

/**
 * As vagas que o portal de um escritório mostra: só as dele, publicadas
 * (`isPublic`), abertas e dentro do prazo. A mesma regra na lista, no 41
 * Carreiras, na página da vaga e no sitemap.
 */
export function whereDasVagasDoPortal(tenantId: string, agora: Date) {
  return { tenantId, isPublic: true, status: "ABERTA" as const, ...whereDoPrazo(agora) };
}

/**
 * "Publicada hoje", "ontem", "há 5 dias" — em dias de calendário de Brasília,
 * como o prazo. Passado de um mês, para de contar: o número só assustaria.
 */
export function publicadaHa(publicadaEm: Date, agora: Date): string {
  const dias = Math.round((hojeEmBrasilia(agora).getTime() - hojeEmBrasilia(publicadaEm).getTime()) / 86_400_000);
  if (dias <= 0) return "Publicada hoje";
  if (dias === 1) return "Publicada ontem";
  if (dias <= 30) return `Publicada há ${dias} dias`;
  return "Publicada há mais de um mês";
}

/** O que o recrutador escreveu, um benefício por linha, sem marcador de lista. */
export function beneficiosDaVaga(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•·]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** A cidade da vaga quando ela tem uma; senão, a da empresa. */
export function localDaVaga(v: {
  workCity: string | null;
  workStateCode: string | null;
  company: { city: string | null; stateCode: string | null };
}): { cidade: string | null; uf: string | null } {
  if (v.workCity?.trim()) return { cidade: v.workCity.trim(), uf: v.workStateCode?.trim() || null };
  return { cidade: v.company.city, uf: v.company.stateCode };
}

export const VAGAS_POR_PAGINA = 20;

export function paginar<T>(lista: T[], pedida: string | string[] | undefined, porPagina = VAGAS_POR_PAGINA) {
  const totalDePaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const n = Number(Array.isArray(pedida) ? pedida[0] : pedida);
  // Página fora da faixa cai na mais próxima: link velho de "página 4" depois
  // que vagas fecharam não deve dar lista vazia.
  const pagina = Number.isInteger(n) ? Math.min(Math.max(n, 1), totalDePaginas) : 1;
  return { itens: lista.slice((pagina - 1) * porPagina, pagina * porPagina), pagina, totalDePaginas };
}

/** O link de uma página da lista, mantendo os filtros. */
export function urlDaLista(slug: string, f: FiltrosDoPortal, pagina = 1): string {
  return urlDaListaEm(`/carreiras/${slug}`, f, pagina);
}

/**
 * O mesmo, a partir do caminho da lista — `/` no endereço do 41 Carreiras,
 * `/carreiras/<escritorio>` no do Connect.
 */
export function urlDaListaEm(caminho: string, f: FiltrosDoPortal, pagina = 1): string {
  const q = new URLSearchParams();
  if (f.busca) q.set("q", f.busca);
  if (f.cidade) q.set("cidade", f.cidade);
  if (f.uf) q.set("uf", f.uf);
  if (f.area) q.set("area", f.area);
  if (f.modalidade) q.set("modalidade", f.modalidade);
  if (f.contrato) q.set("contrato", f.contrato);
  if (pagina > 1) q.set("pagina", String(pagina));
  const s = q.toString();
  return `${caminho}${s ? `?${s}` : ""}`;
}
