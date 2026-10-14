// O que as telas do 41 Carreiras mostram de uma vaga e da lista (15/10/2026),
// em funções puras: datas relativas, o selo de prazo, os fatos da vaga, os
// números da capa, as empresas contratando e os links de compartilhamento.
//
// Regra da casa: só o que existe. Fato sem valor não vira "A combinar" nem
// "—": some. Número zero ou desconhecido não aparece na capa.

import type { VagaContrato, VagaModalidade } from "@/generated/prisma/enums";
import {
  CONTRATO_LABEL,
  MODALIDADE_LABEL,
  ateAPagina,
  filtrarVagas,
  hojeEmBrasilia,
  lerFiltros,
  normalizar,
  ordenarVagas,
  type FiltrosDoPortal,
  type VagaDoPortal,
} from "./portal";

const DIA = 86_400_000;

/** Dias de calendário (Brasília) entre duas datas: 0 = mesmo dia. */
function diasEntre(de: Date, ate: Date): number {
  return Math.round((hojeEmBrasilia(ate).getTime() - hojeEmBrasilia(de).getTime()) / DIA);
}

/**
 * "hoje", "ontem", "há 5 dias" — o "1 hour ago" dos cartões. Passado de um
 * mês, para de contar (como `publicadaHa`).
 */
export function haQuantoTempo(publicadaEm: Date, agora: Date): string {
  const dias = diasEntre(publicadaEm, agora);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias <= 30) return `há ${dias} dias`;
  return "há mais de um mês";
}

/** "dd/mm" de uma data-calendário (gravada à meia-noite UTC). */
export function diaEMes(data: Date): string {
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "dd/mm/aaaa" de uma data-calendário. */
export function dataCompleta(data: Date): string {
  return `${diaEMes(data)}/${data.getUTCFullYear()}`;
}

/** Quantos dias faltam até o prazo (0 = hoje é o último dia). O prazo é data-calendário. */
export function diasAteOPrazo(prazo: Date, agora: Date): number {
  return Math.round((prazo.getTime() - hojeEmBrasilia(agora).getTime()) / DIA);
}

/** Até quantos dias antes do fim o cartão avisa do prazo. */
export const DIAS_DE_AVISO_DO_PRAZO = 7;

/**
 * O selo de prazo do cartão: só quando faltam 7 dias ou menos. No último dia,
 * diz que é o último; antes, a data. Sem prazo, ou prazo longe: null.
 */
export function seloDoPrazo(prazo: Date | null, agora: Date): { texto: string; ultimoDia: boolean } | null {
  if (!prazo) return null;
  const dias = diasAteOPrazo(prazo, agora);
  if (dias < 0 || dias > DIAS_DE_AVISO_DO_PRAZO) return null;
  if (dias === 0) return { texto: "Último dia de inscrição", ultimoDia: true };
  return { texto: `Inscrições até ${diaEMes(prazo)}`, ultimoDia: false };
}

/** "Curitiba – PR", "Curitiba", "PR" ou null. */
export function localLegivel(cidade: string | null | undefined, uf: string | null | undefined): string | null {
  return [cidade?.trim(), uf?.trim()].filter(Boolean).join(" – ") || null;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * A faixa salarial, **só** quando o recrutador escolheu mostrar e deu um
 * valor. Diferente de `faixaSalarialLegivel`, não devolve "A combinar": na
 * página nova, salário não publicado simplesmente não aparece.
 */
export function faixaPublica(v: { salaryMin: number | null; salaryMax: number | null; showSalary: boolean }): string | null {
  if (!v.showSalary) return null;
  const { salaryMin: min, salaryMax: max } = v;
  if (min !== null && max !== null) return min === max ? REAIS.format(min) : `${REAIS.format(min)} a ${REAIS.format(max)}`;
  if (min !== null) return `A partir de ${REAIS.format(min)}`;
  if (max !== null) return `Até ${REAIS.format(max)}`;
  return null;
}

export type ChaveDoFato = "contrato" | "modelo" | "local" | "salario" | "area" | "quantidade" | "prazo";
export type Fato = { chave: ChaveDoFato; rotulo: string; valor: string };

/**
 * Os fatos da vaga, para a grade com ícones: só os que têm valor. Nada de
 * jornada, nível ou "experiência" — a vaga não tem esses campos, e o portal
 * não inventa.
 */
export function fatosDaVaga(v: {
  contractType: VagaContrato | null;
  workMode: VagaModalidade | null;
  cidade: string | null;
  uf: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
  area: string | null;
  quantity: number;
  applicationDeadline: Date | null;
}): Fato[] {
  const fatos: Fato[] = [];
  if (v.contractType) fatos.push({ chave: "contrato", rotulo: "Contrato", valor: CONTRATO_LABEL[v.contractType] });
  if (v.workMode) fatos.push({ chave: "modelo", rotulo: "Modelo de trabalho", valor: MODALIDADE_LABEL[v.workMode] });
  const local = localLegivel(v.cidade, v.uf);
  if (local) fatos.push({ chave: "local", rotulo: "Local", valor: local });
  const salario = faixaPublica(v);
  if (salario) fatos.push({ chave: "salario", rotulo: "Faixa salarial", valor: salario });
  if (v.area?.trim()) fatos.push({ chave: "area", rotulo: "Área", valor: v.area.trim() });
  if (v.quantity > 1) fatos.push({ chave: "quantidade", rotulo: "Vagas", valor: `${v.quantity} vagas` });
  if (v.applicationDeadline) fatos.push({ chave: "prazo", rotulo: "Inscrições até", valor: dataCompleta(v.applicationDeadline) });
  return fatos;
}

// Palavras que não dizem quem é a empresa — ficam fora das iniciais.
const SEM_PESO = new Set(["ltda", "me", "epp", "eireli", "sa", "s/a", "s.a", "s.a.", "de", "da", "do", "das", "dos", "e", "&", "cia", "comercio", "comércio"]);

/** As iniciais da empresa para o lugar do logo: "Metalúrgica Iguaçu Ltda" → "MI". */
export function iniciaisDaEmpresa(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p && !SEM_PESO.has(p.toLowerCase()) && /[\p{L}\p{N}]/u.test(p));
  const letras = (palavras.length ? palavras : nome.trim().split(/\s+/))
    .slice(0, 2)
    .map((p) => [...p.replace(/[^\p{L}\p{N}]/gu, "")][0] ?? "")
    .join("");
  return letras.toUpperCase() || "?";
}

/** O que os números e os agrupamentos da capa leem de cada vaga. */
export type VagaResumida = {
  id: string;
  companyId: string;
  empresa: string;
  cidade: string | null;
  uf: string | null;
  area: string | null;
  workMode: VagaModalidade | null;
  contractType: VagaContrato | null;
  openedAt: Date;
  temLogo: boolean;
};

/**
 * A faixa de números da capa: vagas abertas, empresas contratando e o dia
 * (de Brasília, como data-calendário) da vaga mais recente. Sem vaga, tudo
 * some (zero não é número que se mostre).
 */
export function resumoDoPortal(vagas: VagaResumida[]): { vagas: number; empresas: number; ultimaPublicacao: Date } | null {
  if (vagas.length === 0) return null;
  const empresas = new Set(vagas.map((v) => v.companyId)).size;
  const ultimaPublicacao = hojeEmBrasilia(new Date(Math.max(...vagas.map((v) => v.openedAt.getTime()))));
  return { vagas: vagas.length, empresas, ultimaPublicacao };
}

export type EmpresaContratando = {
  companyId: string;
  nome: string;
  vagas: number;
  local: string | null;
  /** Uma vaga da empresa — o logo sai pela rota da vaga (`/api/carreiras/logo/<escritorio>/<vaga>`). */
  vagaDoLogo: string | null;
};

/** As empresas com vaga aberta, das que mais contratam às que menos (empate: pelo nome). */
export function empresasContratando(vagas: VagaResumida[]): EmpresaContratando[] {
  const porEmpresa = new Map<string, EmpresaContratando>();
  for (const v of vagas) {
    const atual = porEmpresa.get(v.companyId);
    if (atual) {
      atual.vagas += 1;
      if (!atual.vagaDoLogo && v.temLogo) atual.vagaDoLogo = v.id;
    } else {
      porEmpresa.set(v.companyId, {
        companyId: v.companyId,
        nome: v.empresa,
        vagas: 1,
        local: localLegivel(v.cidade, v.uf),
        vagaDoLogo: v.temLogo ? v.id : null,
      });
    }
  }
  return [...porEmpresa.values()].sort((a, b) => b.vagas - a.vagas || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type Contagem<T extends string = string> = { valor: T; rotulo: string; vagas: number };

/** Quantas vagas por modelo, contrato, área e cidade — só o que tem vaga. */
export function contagensDoPortal(vagas: VagaResumida[]): {
  modalidades: Contagem<VagaModalidade>[];
  contratos: Contagem<VagaContrato>[];
  areas: Contagem[];
  cidades: Contagem[];
} {
  const conta = <T extends string>(valores: (T | null | undefined)[], rotulo: (v: T) => string, ordemFixa?: T[]): Contagem<T>[] => {
    const mapa = new Map<string, Contagem<T>>();
    for (const bruto of valores) {
      const v = typeof bruto === "string" ? (bruto.trim() as T) : null;
      if (!v) continue;
      const chave = normalizar(v);
      const atual = mapa.get(chave);
      if (atual) atual.vagas += 1;
      else mapa.set(chave, { valor: v, rotulo: rotulo(v), vagas: 1 });
    }
    const lista = [...mapa.values()];
    if (ordemFixa) return ordemFixa.flatMap((o) => lista.filter((c) => c.valor === o));
    return lista.sort((a, b) => b.vagas - a.vagas || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  };
  return {
    modalidades: conta(vagas.map((v) => v.workMode), (m) => MODALIDADE_LABEL[m], Object.keys(MODALIDADE_LABEL) as VagaModalidade[]),
    contratos: conta(vagas.map((v) => v.contractType), (c) => CONTRATO_LABEL[c], Object.keys(CONTRATO_LABEL) as VagaContrato[]),
    areas: conta(vagas.map((v) => v.area), (a) => a),
    cidades: conta(vagas.map((v) => v.cidade), (c) => {
      const uf = vagas.find((v) => v.cidade && normalizar(v.cidade) === normalizar(c))?.uf;
      return uf ? `${c} – ${uf}` : c;
    }),
  };
}

/** Os links para compartilhar a vaga no LinkedIn e no WhatsApp. */
export function linksDeCompartilhamento(url: string, titulo: string, empresa: string): { linkedin: string; whatsapp: string } {
  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`Vaga: ${titulo} — ${empresa}\n${url}`)}`,
  };
}

/**
 * Os requisitos da vaga que o candidato lê: obrigatórios e desejáveis, só o
 * texto (o peso de cada um é da triagem, não do anúncio). Lê o JSON gravado
 * em `VagaRequisitos.itens` e descarta o que não tem o formato.
 */
export function requisitosPublicos(itens: unknown): { obrigatorios: string[]; desejaveis: string[] } {
  const obrigatorios: string[] = [];
  const desejaveis: string[] = [];
  const vistos = new Set<string>();
  for (const bruto of Array.isArray(itens) ? itens : []) {
    if (!bruto || typeof bruto !== "object") continue;
    const x = bruto as Record<string, unknown>;
    const texto = String(x.texto ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
    if (!texto || vistos.has(normalizar(texto))) continue;
    vistos.add(normalizar(texto));
    (x.tipo === "OBRIGATORIO" ? obrigatorios : desejaveis).push(texto);
  }
  return { obrigatorios: obrigatorios.slice(0, 20), desejaveis: desejaveis.slice(0, 20) };
}

/**
 * A lista de vagas do 41 Carreiras a partir da URL (15/10/2026): os filtros,
 * a ordem, o "mostrar mais" (cumulativo) e a vaga aberta no painel ao lado
 * (`?vaga=`; sem ela, ou com uma que não passa nos filtros, a primeira da
 * lista). Pura: a página só busca as vagas abertas e entrega aqui.
 */
export function listaDoPortal<T extends VagaDoPortal & { id: string; openedAt: Date; applicationDeadline: Date | null }>(
  todas: T[],
  busca: Record<string, string | string[] | undefined>,
) {
  const filtros = lerFiltros(busca);
  const filtradas = ordenarVagas(filtrarVagas(todas, filtros), filtros.ordem);
  const { itens, pagina, temMais } = ateAPagina(filtradas, busca.pagina);
  const pedida = (Array.isArray(busca.vaga) ? busca.vaga[0] : busca.vaga)?.trim();
  const escolhida = (pedida && filtradas.find((v) => v.id === pedida)) || filtradas[0] || null;
  return { filtros, filtradas, itens, pagina, temMais, escolhida };
}

/**
 * As opções de um filtro com quantas vagas cada uma teria — contadas sobre
 * as vagas que passam nos OUTROS filtros escolhidos (escolher "Remoto" com a
 * área "Fiscal" mostra quantas fiscais são remotas).
 */
export function opcoesComContagem<T extends VagaDoPortal>(
  todas: T[],
  filtros: FiltrosDoPortal,
  chave: "modalidade" | "contrato" | "area" | "cidade",
): { valor: string; rotulo: string; vagas: number }[] {
  const base = filtrarVagas(todas, { ...filtros, [chave]: "" });
  const valorDe = (v: T): string | null =>
    chave === "modalidade" ? v.workMode : chave === "contrato" ? v.contractType : chave === "area" ? v.area : v.cidade;
  const rotuloDe = (valor: string): string =>
    chave === "modalidade" ? MODALIDADE_LABEL[valor as VagaModalidade] : chave === "contrato" ? CONTRATO_LABEL[valor as VagaContrato] : valor;
  const mapa = new Map<string, { valor: string; rotulo: string; vagas: number }>();
  for (const v of base) {
    const valor = valorDe(v)?.trim();
    if (!valor) continue;
    const k = normalizar(valor);
    const atual = mapa.get(k);
    if (atual) atual.vagas += 1;
    else mapa.set(k, { valor, rotulo: rotuloDe(valor), vagas: 1 });
  }
  const lista = [...mapa.values()];
  if (chave === "modalidade") return (Object.keys(MODALIDADE_LABEL) as string[]).flatMap((m) => lista.filter((o) => o.valor === m));
  if (chave === "contrato") return (Object.keys(CONTRATO_LABEL) as string[]).flatMap((c) => lista.filter((o) => o.valor === c));
  return lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

const CONTENT_TYPE_DO_LOGO: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * O arquivo do logo da empresa a partir do `logoUrl` gravado
 * ("/api/company-logos/<id>.png?v=123" → "<id>.png" e o tipo), ou null para
 * o que não é um logo enviado pelo Connect — nada de caminho vindo de fora.
 */
export function arquivoDoLogo(logoUrl: string | null | undefined): { nome: string; tipo: string } | null {
  const m = /^\/api\/company-logos\/([a-zA-Z0-9-]+\.(jpg|png|webp))(?:\?[^/]*)?$/.exec((logoUrl ?? "").trim());
  return m ? { nome: m[1]!, tipo: CONTENT_TYPE_DO_LOGO[m[2]!]! } : null;
}
