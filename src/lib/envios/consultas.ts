// Leitura dos envios ao cliente (08/10/2026): a lista da equipe, na aba
// "Envios" da central de Solicitações, e o lado do cliente no portal — os
// envios publicados das empresas do grupo dele, com a prova de leitura e o
// aceite gravados na mesma trilha do link por e-mail.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { totalDePaginas } from "@/lib/financeiro/paginaDeContas";
import { usuariosAtivosDasEmpresas } from "@/lib/portal/empresasDaContaDb";
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
import { textoDoLembrete } from "./lembrete";

// ─── Lado da equipe ──────────────────────────────────────────────────────────

/** Envios por página na lista da equipe — paginada no servidor desde 27/11/2026 (melhoria-571). */
export const ENVIOS_POR_PAGINA = 50;

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
  /** A data marcada do envio agendado (22/10/2026). */
  agendadoPara: Date | null;
  /** "Lembrete enviado em …" / "Lembrete se ninguém abrir em N dias" (22/10/2026). */
  lembrete: string | null;
};

/** O alcance da equipe: as empresas que a pessoa enxerga (`scopedCompanyWhere`). */
export type AlcanceDosEnvios = { tenantId: string; empresas: Prisma.CompanyWhereInput };

function whereDosEnviosDaEquipe(alcance: AlcanceDosEnvios, filtros: { empresaId: string | null }): Prisma.ClientDocumentWhereInput {
  return {
    tenantId: alcance.tenantId,
    company: alcance.empresas,
    ...(filtros.empresaId ? { companyId: filtros.empresaId } : {}),
  };
}

const COM_ACEITE: Prisma.ClientDocumentRecipientWhereInput = { signedAt: { not: null } };
const COM_ABERTURA: Prisma.ClientDocumentRecipientWhereInput = { firstViewedAt: { not: null } };

/**
 * A `situacaoDoEnvio` (regras.ts) escrita como filtro de banco (27/11/2026,
 * melhoria-571): a situação era calculada linha a linha e a lista filtrava em
 * memória, o que prendia a tela a um teto de 500. As mesmas perguntas, na
 * mesma ordem — rascunho/agendado pelo status e pela data marcada; aceito se
 * pede aceite e alguém aceitou; senão, se alguém abriu, aguardando aceite ou
 * visto; senão, enviado. O teste confere cada combinação contra a regra.
 */
export function whereDaSituacaoDoEnvio(situacao: SituacaoDoEnvio): Prisma.ClientDocumentWhereInput {
  switch (situacao) {
    case "rascunho":
      return { status: "DRAFT", scheduledFor: null };
    case "agendado":
      return { status: "DRAFT", scheduledFor: { not: null } };
    case "aceito":
      return { status: "PUBLISHED", requiresSignature: true, recipients: { some: COM_ACEITE } };
    case "aguardando-aceite":
      return { status: "PUBLISHED", requiresSignature: true, AND: [{ recipients: { none: COM_ACEITE } }, { recipients: { some: COM_ABERTURA } }] };
    case "visto":
      return { status: "PUBLISHED", requiresSignature: false, recipients: { some: COM_ABERTURA } };
    case "enviado":
      return {
        status: "PUBLISHED",
        recipients: { none: COM_ABERTURA },
        // Aceito sem abertura registrada continua "aceito": a regra olha o aceite primeiro.
        OR: [{ requiresSignature: false }, { recipients: { none: COM_ACEITE } }],
      };
  }
}

/** Os cartões do topo: o que espera alguém (a equipe publicar, o cliente abrir ou aceitar). */
export type ContadoresDosEnvios = { rascunhos: number; agendados: number; naoVistos: number; semAceite: number };

/**
 * Os envios das empresas que a pessoa enxerga, o mais novo primeiro, uma
 * página por vez. O alcance chega pronto de quem chama (`scopedCompanyWhere`,
 * o mesmo de quando a lista morava na ficha da empresa); a situação sai da
 * prova de cada destinatário.
 *
 * Paginada no servidor desde 27/11/2026 (melhoria-571): ia até os 500 mais
 * recentes, filtrava a situação em memória e contava os cartões só sobre
 * esses 500. Agora a situação é filtro de banco (`whereDaSituacaoDoEnvio`), a
 * lista vem por `skip`/`take`, e `total` e os cartões contam a empresa
 * filtrada inteira. Os cartões ignoram a situação escolhida (são o mapa da
 * lista, como nas outras abas). Página além do fim cai na última que existe.
 */
export async function listarEnviosDaEquipe(
  alcance: AlcanceDosEnvios,
  filtros: { empresaId: string | null; situacao?: SituacaoDoEnvio | null },
  paginaPedida = 1
): Promise<{ linhas: LinhaDoEnvio[]; contadores: ContadoresDosEnvios; total: number; pagina: number; totalDePaginas: number }> {
  const prisma = getPrisma();
  const base = whereDosEnviosDaEquipe(alcance, filtros);
  const where: Prisma.ClientDocumentWhereInput = filtros.situacao ? { AND: [base, whereDaSituacaoDoEnvio(filtros.situacao)] } : base;
  const contar = (s: SituacaoDoEnvio) => prisma.clientDocument.count({ where: { AND: [base, whereDaSituacaoDoEnvio(s)] } });
  const pedida = Math.max(1, Math.floor(paginaPedida) || 1);

  const buscarPagina = (p: number) =>
    prisma.clientDocument.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * ENVIOS_POR_PAGINA,
      take: ENVIOS_POR_PAGINA,
      select: {
      id: true,
      title: true,
      status: true,
      requiresSignature: true,
      fileUrl: true,
      createdAt: true,
      publishedAt: true,
      scheduledFor: true,
      reminderDays: true,
      reminderSentAt: true,
      company: { select: { id: true, name: true, displayName: true } },
      recipients: { select: { sentAt: true, firstViewedAt: true, signedAt: true } },
    },
  });

  const [primeira, total, rascunhos, agendados, naoVistos, semAceite] = await Promise.all([
    buscarPagina(pedida),
    prisma.clientDocument.count({ where }),
    contar("rascunho"),
    contar("agendado"),
    contar("enviado"),
    contar("aguardando-aceite"),
  ]);
  const ultima = totalDePaginas(total, ENVIOS_POR_PAGINA);
  const pagina = Math.min(pedida, ultima);
  const lista = pagina === pedida ? primeira : await buscarPagina(pagina);
  return {
    contadores: { rascunhos, agendados, naoVistos, semAceite },
    total,
    pagina,
    totalDePaginas: ultima,
    linhas: lista.map((d) => ({
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
      agendadoPara: d.scheduledFor,
      lembrete: textoDoLembrete(d),
    })),
  };
}

/**
 * Quem, entre os destinatários de um envio, tem acesso ao portal da empresa —
 * para a ficha do envio dizer "pelo portal" em vez de "e-mail não saiu" na
 * linha que o portal criou (sem `sentAt`). Desde 14/10/2026, o acesso é o
 * ligado à empresa (ou à matriz dela, com as filiais), e não mais o Cliente.
 */
export async function emailsComPortal(tenantId: string, companyId: string, emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const procurados = new Set(emails.map(emailDoDestinatario));
  const contas = await usuariosAtivosDasEmpresas(tenantId, [companyId]);
  return new Set(contas.map((c) => emailDoDestinatario(c.email)).filter((e) => procurados.has(e)));
}

/** Quantas pessoas com acesso à empresa veem o envio no portal, depois de publicado. */
export async function pessoasNoPortal(tenantId: string, companyId: string): Promise<number> {
  return (await usuariosAtivosDasEmpresas(tenantId, [companyId])).length;
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
