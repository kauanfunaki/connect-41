// Leitura dos envios ao cliente (08/10/2026): a lista da equipe, na aba
// "Envios" da central de Solicitações, e o lado do cliente no portal — os
// envios publicados das empresas do grupo dele, com a prova de leitura e o
// aceite gravados na mesma trilha do link por e-mail.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { generateRecipientToken, recordClientDocumentSignature, recordClientDocumentView } from "@/lib/clientDocuments";
import {
  emailDoDestinatario,
  linhaDaPessoa,
  recusaDoAceite,
  situacaoDoEnvio,
  situacaoParaOCliente,
  validarAceite,
  type EnvioParaOCliente,
  type SituacaoDoEnvio,
} from "./regras";

// ─── Lado da equipe ──────────────────────────────────────────────────────────

/** Teto da lista: os mais recentes; acima disso, filtrar por empresa. */
export const LIMITE_DA_LISTA = 500;

export type LinhaDoEnvio = {
  id: string;
  titulo: string;
  empresaId: string;
  empresaNome: string;
  criadoEm: Date;
  publicadoEm: Date | null;
  temAnexo: boolean;
  pedeAceite: boolean;
  destinatarios: number;
  viram: number;
  situacao: SituacaoDoEnvio;
};

/**
 * Os envios das empresas que a pessoa enxerga, o mais novo primeiro. O
 * alcance chega pronto de quem chama (`scopedCompanyWhere`, o mesmo de quando
 * a lista morava na ficha da empresa); a situação sai da prova de cada
 * destinatário.
 */
export async function listarEnviosDaEquipe(
  alcance: { tenantId: string; empresas: Prisma.CompanyWhereInput },
  filtros: { empresaId: string | null }
): Promise<{ linhas: LinhaDoEnvio[]; limitado: boolean }> {
  const lista = await getPrisma().clientDocument.findMany({
    where: {
      tenantId: alcance.tenantId,
      company: alcance.empresas,
      ...(filtros.empresaId ? { companyId: filtros.empresaId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: LIMITE_DA_LISTA + 1,
    select: {
      id: true,
      title: true,
      status: true,
      requiresSignature: true,
      fileUrl: true,
      createdAt: true,
      publishedAt: true,
      company: { select: { id: true, name: true, displayName: true } },
      recipients: { select: { sentAt: true, firstViewedAt: true, signedAt: true } },
    },
  });
  const limitado = lista.length > LIMITE_DA_LISTA;
  return {
    limitado,
    linhas: lista.slice(0, LIMITE_DA_LISTA).map((d) => ({
      id: d.id,
      titulo: d.title,
      empresaId: d.company.id,
      empresaNome: nomeExibicao(d.company),
      criadoEm: d.createdAt,
      publicadoEm: d.publishedAt,
      temAnexo: !!d.fileUrl,
      pedeAceite: d.requiresSignature,
      destinatarios: d.recipients.length,
      viram: d.recipients.filter((r) => r.firstViewedAt).length,
      situacao: situacaoDoEnvio(d),
    })),
  };
}

/**
 * Quem, entre os destinatários de um envio, tem acesso ao portal do cliente da
 * empresa — para a ficha do envio dizer "pelo portal" em vez de "e-mail não
 * saiu" na linha que o portal criou (sem `sentAt`).
 */
export async function emailsComPortal(tenantId: string, clientGroupId: string | null, emails: string[]): Promise<Set<string>> {
  if (!clientGroupId || emails.length === 0) return new Set();
  const contas = await getPrisma().portalUser.findMany({
    where: { tenantId, clientGroupId, active: true, email: { in: emails.map(emailDoDestinatario) } },
    select: { email: true },
  });
  return new Set(contas.map((c) => emailDoDestinatario(c.email)));
}

/** Quantas pessoas do cliente da empresa veem o envio no portal, depois de publicado. */
export async function pessoasNoPortal(tenantId: string, clientGroupId: string | null): Promise<number> {
  if (!clientGroupId) return 0;
  return getPrisma().portalUser.count({ where: { tenantId, clientGroupId, active: true } });
}

// ─── Lado do cliente ─────────────────────────────────────────────────────────

/**
 * As empresas que o cliente logado alcança — `alcanceDoCliente`, a régua de
 * todo o portal. Lista vazia não vê nada (`IN ()`), nunca tudo.
 */
export type EscopoDoCliente = { tenantId: string; companyIds: string[] };

/** Só o que o cliente vê: publicado, de uma empresa do grupo dele. */
function doCliente(escopo: EscopoDoCliente): Prisma.ClientDocumentWhereInput {
  return { tenantId: escopo.tenantId, companyId: { in: escopo.companyIds }, status: "PUBLISHED" };
}

export type EnvioDoCliente = EnvioParaOCliente & {
  id: string;
  titulo: string;
  empresaNome: string;
  publicadoEm: Date;
  temAnexo: boolean;
};

/** Os envios publicados das empresas do cliente, o mais novo primeiro, com o "novo" desta pessoa. */
export async function enviosDoCliente(escopo: EscopoDoCliente, email: string): Promise<EnvioDoCliente[]> {
  const lista = await getPrisma().clientDocument.findMany({
    where: doCliente(escopo),
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      requiresSignature: true,
      fileUrl: true,
      createdAt: true,
      publishedAt: true,
      company: { select: { name: true, displayName: true } },
      recipients: { select: { email: true, createdAt: true, firstViewedAt: true, signedAt: true } },
    },
  });
  return lista.map((d) => ({
    id: d.id,
    titulo: d.title,
    empresaNome: nomeExibicao(d.company),
    publicadoEm: d.publishedAt ?? d.createdAt,
    temAnexo: !!d.fileUrl,
    ...situacaoParaOCliente(d, email),
  }));
}

/**
 * Quantos envios esperam o aceite do cliente — o item do "O que precisa de
 * você" do Início. O aceite é do cliente: se alguém já aceitou, o envio sai da
 * conta para todos (a mesma régua da tela).
 */
export async function enviosAguardandoAceite(escopo: EscopoDoCliente): Promise<number> {
  return getPrisma().clientDocument.count({
    where: { ...doCliente(escopo), requiresSignature: true, recipients: { none: { signedAt: { not: null } } } },
  });
}

/**
 * A linha de destinatário desta pessoa no envio — a que já existe com o e-mail
 * dela, ou uma nova (token próprio, `sentAt` nulo: não saiu e-mail nenhum).
 * Assim a prova do portal fica na mesma trilha que a equipe lê, sem tabela nova.
 */
export async function linhaDoClienteNoEnvio(documentId: string, email: string) {
  const prisma = getPrisma();
  const linhas = await prisma.clientDocumentRecipient.findMany({ where: { clientDocumentId: documentId } });
  const minha = linhaDaPessoa(linhas, email);
  if (minha) return minha;
  return prisma.clientDocumentRecipient.create({
    data: { clientDocumentId: documentId, email: emailDoDestinatario(email), token: generateRecipientToken() },
  });
}

/** Um envio do cliente, sem registrar nada — para a ação de aceite e a rota do anexo conferirem o alcance. */
export async function envioDoCliente(escopo: EscopoDoCliente, id: string) {
  return getPrisma().clientDocument.findFirst({
    where: { ...doCliente(escopo), id },
    select: {
      id: true,
      title: true,
      bodyHtml: true,
      status: true,
      requiresSignature: true,
      fileUrl: true,
      fileName: true,
      mimeType: true,
      createdAt: true,
      publishedAt: true,
      company: { select: { name: true, displayName: true } },
      recipients: { where: { signedAt: { not: null } }, select: { id: true, signedAt: true, signerName: true }, orderBy: { signedAt: "asc" } },
    },
  });
}

export type ResultadoDoAceite = { ok: true } | { ok: false; erro: string };

/**
 * O aceite dado pelo portal: a mesma validação e a mesma gravação do link por
 * e-mail (`/d/{token}/assinar`), na linha de destinatário desta pessoa. O
 * aceite é do cliente — com um aceite já registrado, por esta pessoa ou por
 * outra da empresa, não se grava outro.
 */
export async function aceitarEnvioDoCliente(
  escopo: EscopoDoCliente,
  email: string,
  id: string,
  preenchido: { nome: unknown; consentimento: unknown },
  prova: { ipAddress: string; userAgent: string | null }
): Promise<ResultadoDoAceite> {
  const aceite = validarAceite(preenchido);
  if (!aceite.ok) return { ok: false, erro: aceite.erro };

  const envio = await envioDoCliente(escopo, id);
  if (!envio) return { ok: false, erro: "Documento não encontrado." };
  const recusa = recusaDoAceite(envio, envio.recipients.length > 0);
  if (recusa === "indisponivel") return { ok: false, erro: "Este documento não pede aceite." };
  if (recusa === "ja-aceito") return { ok: false, erro: "O aceite deste documento já foi registrado." };

  const linha = await linhaDoClienteNoEnvio(envio.id, email);
  const gravado = await recordClientDocumentSignature({
    recipientId: linha.id,
    signerName: aceite.nome,
    ipAddress: prova.ipAddress,
    userAgent: prova.userAgent,
  });
  if (!gravado) return { ok: false, erro: "O aceite deste documento já foi registrado." };
  return { ok: true };
}

/**
 * O envio aberto pelo cliente — e a prova da abertura, como a visita à página
 * do link por e-mail: a linha da pessoa (criada na primeira vez) ganha uma
 * visualização com data, IP e navegador. `null` se o envio não é do cliente.
 */
export async function abrirEnvioDoCliente(
  escopo: EscopoDoCliente,
  email: string,
  id: string,
  prova: { ipAddress: string; userAgent: string | null }
) {
  const envio = await envioDoCliente(escopo, id);
  if (!envio) return null;
  const linha = await linhaDoClienteNoEnvio(envio.id, email);
  await recordClientDocumentView({
    recipientId: linha.id,
    action: "VIEWED",
    ipAddress: prova.ipAddress,
    userAgent: prova.userAgent,
    isFirstView: !linha.firstViewedAt,
  });
  const primeiro = envio.recipients[0];
  return {
    id: envio.id,
    titulo: envio.title,
    corpoHtml: envio.bodyHtml,
    empresaNome: nomeExibicao(envio.company),
    publicadoEm: envio.publishedAt ?? envio.createdAt,
    anexo: envio.fileUrl ? { nome: envio.fileName } : null,
    pedeAceite: envio.requiresSignature,
    /** O aceite do cliente, se já houve: o desta pessoa, se ela aceitou; senão o primeiro. */
    aceite: linha.signedAt
      ? { nome: linha.signerName, em: linha.signedAt, meu: true }
      : primeiro
        ? { nome: primeiro.signerName, em: primeiro.signedAt!, meu: false }
        : null,
  };
}
