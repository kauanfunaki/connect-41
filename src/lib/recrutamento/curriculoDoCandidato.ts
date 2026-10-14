// O currículo da ficha do candidato e o resumo que a IA escreve ao lê-lo
// (bloco "Currículo", escolha 3B do Kauan, 14/10/2026).
//
// Duas partes:
// - qual arquivo é "o currículo" — o mesmo que o bloco mostra e que o "Ler com
//   IA" lê;
// - o resumo guardado (`CandidateResumeSummary`). A tabela é nova: sem ela
//   (deploy antes da migration) ler devolve "nada guardado" e gravar não faz
//   nada — a ficha segue como antes, só sem guardar o resumo.

import type { PrismaClient } from "@/generated/prisma/client";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";

// ─── Qual é o currículo ─────────────────────────────────────────────────────

/** Currículo que veio com a candidatura do portal de vagas (sempre PDF). */
export type CurriculoDoPortal = {
  candidaturaId: string;
  vagaTitulo: string | null;
  em: Date;
};

/** Documento da ficha na categoria Currículo. */
export type CurriculoAnexado = {
  documentId: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  enviadoPor: string | null;
  em: Date;
};

export type CurriculoEscolhido =
  | ({ tipo: "portal"; pdf: true } & CurriculoDoPortal)
  | ({ tipo: "documento"; pdf: boolean } & CurriculoAnexado);

const PDF = "application/pdf";

/**
 * O currículo mais recente em PDF — do portal ou anexado na ficha —, que é o
 * que a IA sabe ler. Sem nenhum PDF, o anexo de Currículo mais recente em
 * outro formato (uma foto), para o bloco mostrar e dizer que a IA não lê.
 *
 * Antes (até 14/10/2026) o do portal ganhava sempre, mesmo com um PDF mais
 * novo anexado à mão na ficha; agora vale o mais novo — é o que o bloco mostra.
 */
export function escolherCurriculo(
  doPortal: readonly CurriculoDoPortal[],
  anexados: readonly CurriculoAnexado[]
): CurriculoEscolhido | null {
  const pdfs: CurriculoEscolhido[] = [
    ...doPortal.map((c) => ({ tipo: "portal" as const, pdf: true as const, ...c })),
    ...anexados.filter((d) => d.mimeType === PDF).map((d) => ({ tipo: "documento" as const, pdf: true, ...d })),
  ];
  const maisNovo = (lista: CurriculoEscolhido[]) =>
    lista.reduce<CurriculoEscolhido | null>((a, b) => (!a || b.em.getTime() > a.em.getTime() ? b : a), null);
  const pdf = maisNovo(pdfs);
  if (pdf) return pdf;
  return maisNovo(anexados.map((d) => ({ tipo: "documento" as const, pdf: false, ...d })));
}

/** "curriculo-eduardo-ramos.pdf" — o nome com que o currículo do portal é baixado. */
export function nomeDoCurriculoDoPortal(nomeDaPessoa: string): string {
  const slug = nomeDaPessoa
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `curriculo${slug ? `-${slug}` : ""}.pdf`;
}

// ─── O resumo guardado ──────────────────────────────────────────────────────

export type ResumoGuardado = {
  summary: string;
  filledFields: string[];
  readAt: Date;
  sourceDocumentId: string | null;
  sourceCandidaturaId: string | null;
  sourceFileName: string | null;
};

type ComResumos = Pick<PrismaClient, "candidateResumeSummary">;

/** O texto do resumo cabe em TEXT; o teto evita guardar uma resposta desgovernada. */
export const TETO_DO_RESUMO = 4000;

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * O resumo guardado da pessoa, no escritório. `null` sem resumo — e também sem
 * a tabela ou com o banco recusando a leitura: a ficha não pode cair por causa
 * de um resumo.
 */
export async function lerResumoDoCurriculo(db: ComResumos, tenantId: string, personId: string): Promise<ResumoGuardado | null> {
  try {
    const r = await db.candidateResumeSummary.findFirst({ where: { personId, tenantId } });
    if (!r) return null;
    return {
      summary: r.summary,
      filledFields: listaDeTextos(r.filledFields),
      readAt: r.readAt,
      sourceDocumentId: r.sourceDocumentId,
      sourceCandidaturaId: r.sourceCandidaturaId,
      sourceFileName: r.sourceFileName,
    };
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[lerResumoDoCurriculo]", err);
    return null;
  }
}

export type ResumoParaGuardar = {
  tenantId: string;
  personId: string;
  summary: string;
  filledFields: string[];
  fonte: CurriculoEscolhido;
  nomeDoArquivo: string;
};

/**
 * Guarda (ou troca) o resumo da pessoa. Devolve se guardou. Quem chama já
 * conferiu que a pessoa é do escritório. Sem a tabela, não guarda e segue.
 */
export async function guardarResumoDoCurriculo(db: ComResumos, r: ResumoParaGuardar): Promise<boolean> {
  const dados = {
    tenantId: r.tenantId,
    summary: r.summary.trim().slice(0, TETO_DO_RESUMO),
    filledFields: r.filledFields,
    sourceDocumentId: r.fonte.tipo === "documento" ? r.fonte.documentId : null,
    sourceCandidaturaId: r.fonte.tipo === "portal" ? r.fonte.candidaturaId : null,
    sourceFileName: r.nomeDoArquivo.slice(0, 180),
    readAt: new Date(),
  };
  try {
    await db.candidateResumeSummary.upsert({
      where: { personId: r.personId },
      create: { personId: r.personId, ...dados },
      update: dados,
    });
    return true;
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[guardarResumoDoCurriculo]", err);
    return false;
  }
}

/** Se o resumo guardado foi lido deste arquivo — senão, o bloco avisa que é de um currículo anterior. */
export function resumoEhDoArquivo(resumo: Pick<ResumoGuardado, "sourceDocumentId" | "sourceCandidaturaId">, arquivo: CurriculoEscolhido): boolean {
  return arquivo.tipo === "portal" ? resumo.sourceCandidaturaId === arquivo.candidaturaId : resumo.sourceDocumentId === arquivo.documentId;
}
