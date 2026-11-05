// A lista de /certidoes (opção A de 05/11/2026: busca, uma linha por empresa,
// painel ao lado) — as regras puras, sem banco: a busca, os atalhos e o estado
// de cada certidão na linha. O servidor (./lista.ts) e a tela usam as mesmas;
// por isso este arquivo não importa nada que fale com o Prisma.

import { somarDias } from "@/lib/datas/calendario";
import { ehRegular, TIPOS_DE_CERTIDAO, type SituacaoDaCertidao, type TipoDeCertidao } from "./regras";

/** Empresas por página. */
export const POR_PAGINA = 50;
/** O atalho "Vencendo": a certidão que vence até daqui a tantos dias (as já vencidas entram). */
export const DIAS_PARA_VENCER = 15;

export const RECORTES = ["todas", "positivas", "faltando", "vencendo"] as const;
export type Recorte = (typeof RECORTES)[number];

export const ROTULO_DO_RECORTE: Record<Recorte, string> = {
  todas: "Todas",
  positivas: "Positivas a ver",
  faltando: "Sem certidão",
  vencendo: `Vencendo em ${DIAS_PARA_VENCER} dias`,
};

/** A chave da URL; o que não for um atalho conhecido vale "todas". O painel do Societário já linka `?recorte=positivas`. */
export const lerRecorte = (v: string | undefined | null): Recorte => ((RECORTES as readonly string[]).includes(v ?? "") ? (v as Recorte) : "todas");

/** O nome curto do selo na linha (o painel usa o nome inteiro, `ROTULO_DA_CERTIDAO`). */
export const NOME_CURTO: Record<TipoDeCertidao, string> = {
  FEDERAL: "Federal",
  FGTS: "FGTS",
  TRABALHISTA: "Trabalhista",
  ESTADUAL_PR: "Estadual",
  CURITIBA: "Municipal",
};

// ─── A busca ─────────────────────────────────────────────────────────────────

/** Sem acento, sem maiúscula e sem espaço sobrando. */
export const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * A empresa casa com a busca pelo nome (razão social ou nome de exibição) ou
 * pelo CNPJ, com ou sem pontuação. CNPJ só a partir de três dígitos: "41" num
 * nome não pode trazer toda empresa com 4 e 1 no CNPJ.
 */
export function casaComABusca(busca: string, empresa: { name: string; displayName: string | null; cnpj: string | null }): boolean {
  const termo = normalizar(busca);
  if (!termo) return true;
  if (normalizar(empresa.name).includes(termo) || normalizar(empresa.displayName ?? "").includes(termo)) return true;
  const digitos = busca.replace(/\D/g, "");
  return digitos.length >= 3 && (empresa.cnpj ?? "").replace(/\D/g, "").includes(digitos);
}

// ─── O estado de cada certidão ───────────────────────────────────────────────

/** O mínimo para decidir o estado: a certidão que vale (a última que saiu), ou nada. */
export type CertidaoQueVale = { situacao: SituacaoDaCertidao; validaAte: string | null; vista: boolean } | null;

/**
 * O estado no selo da linha:
 * - `sem`: nunca saiu (ainda não consultada, ou só tentativas que falharam);
 * - `positiva`: a última que saiu é positiva — `aVer` enquanto ninguém do setor marcou;
 * - `vencida` / `vencendo`: regular, mas a validade passou ou passa em até 15 dias;
 * - `regular`: negativa ou positiva com efeito de negativa, com folga.
 */
export type EstadoDaCertidao =
  | { tipo: "sem" }
  | { tipo: "positiva"; aVer: boolean; validaAte: string | null }
  | { tipo: "vencida"; validaAte: string }
  | { tipo: "vencendo"; validaAte: string }
  | { tipo: "regular"; validaAte: string | null };

export function estadoDaCertidao(c: CertidaoQueVale, hoje: string): EstadoDaCertidao {
  if (!c || c.situacao === "NAO_SAIU") return { tipo: "sem" };
  if (!ehRegular(c.situacao)) return { tipo: "positiva", aVer: !c.vista, validaAte: c.validaAte };
  if (c.validaAte && c.validaAte < hoje) return { tipo: "vencida", validaAte: c.validaAte };
  if (c.validaAte && c.validaAte <= somarDias(hoje, DIAS_PARA_VENCER)) return { tipo: "vencendo", validaAte: c.validaAte };
  return { tipo: "regular", validaAte: c.validaAte };
}

/** Em que atalhos a empresa entra, pelas certidões que ela precisa. */
export function recortesDaEmpresa(certidoes: CertidaoQueVale[], hoje: string): Set<Recorte> {
  const r = new Set<Recorte>(["todas"]);
  for (const c of certidoes) {
    const e = estadoDaCertidao(c, hoje);
    if (e.tipo === "sem") r.add("faltando");
    if (e.tipo === "positiva" && e.aVer) r.add("positivas");
    // Vencida também entra: é a primeira a renovar. Positiva com validade conta igual.
    const validade = e.tipo === "sem" ? null : e.validaAte;
    if (validade && validade <= somarDias(hoje, DIAS_PARA_VENCER)) r.add("vencendo");
  }
  return r;
}

/**
 * A coluna "Próximo vencimento": o que pede ação primeiro. A certidão que falta
 * vem antes de qualquer data; depois, a validade mais próxima (a vencida é a
 * mais antiga, então vem primeiro sozinha).
 */
export type ProximoVencimento =
  | { tipo: "sem"; certidao: TipoDeCertidao }
  | { tipo: "data"; certidao: TipoDeCertidao; validaAte: string; vencida: boolean; vencendo: boolean }
  | null;

export function proximoVencimento(certidoes: Partial<Record<TipoDeCertidao, CertidaoQueVale>>, hoje: string): ProximoVencimento {
  const tipos = TIPOS_DE_CERTIDAO.filter((t) => t in certidoes);
  const falta = tipos.find((t) => estadoDaCertidao(certidoes[t] ?? null, hoje).tipo === "sem");
  if (falta) return { tipo: "sem", certidao: falta };
  let melhor: { certidao: TipoDeCertidao; validaAte: string } | null = null;
  for (const t of tipos) {
    const v = certidoes[t]?.validaAte;
    if (v && (!melhor || v < melhor.validaAte)) melhor = { certidao: t, validaAte: v };
  }
  if (!melhor) return null;
  return { tipo: "data", ...melhor, vencida: melhor.validaAte < hoje, vencendo: melhor.validaAte <= somarDias(hoje, DIAS_PARA_VENCER) };
}

/** "Emitir as três", "Emitir as cinco" — o botão do painel diz quantas vão sair. */
export function rotuloDeEmitirTodas(n: number): string {
  const extenso = ["", "a", "as duas", "as três", "as quatro", "as cinco"][n];
  return n <= 1 ? "Emitir" : `Emitir ${extenso ?? `as ${n}`}`;
}
