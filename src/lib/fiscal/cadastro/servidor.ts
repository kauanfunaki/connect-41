// O cadastro fiscal da empresa (27/11/2026, funcionalidade-899) — a parte do
// banco. As regras estão em regras.ts.
//
// "Atualizar do acervo" lê os livros do motor do SPED da empresa
// (sped_fiscal_books → documentos → itens), em blocos, e cria ou atualiza os
// produtos e os participantes. Não apaga nada, e não mexe no que o motor gera:
// o cadastro é leitura do acervo mais o que a equipe completa à mão.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { documentoSchema, itemSchema, sentidoNaEmpresa } from "@/lib/fiscal/sped/local/dominio";
import {
  agregarDoAcervo,
  cClassTribEfetivo,
  planejarSincronizacao,
  type CClassTribEfetivo,
  type DocumentoDoAcervo,
  type EdicaoDoParticipante,
  type EdicaoDoProduto,
  type VinculoDoNcm,
} from "./regras";

export class ErroDoCadastroFiscal extends Error {}

const BLOCO = 500;
export const POR_PAGINA = 50;

// ─── Sincronizar ────────────────────────────────────────────────────────────

export type ResultadoDaSincronizacao = {
  documentos: number;
  produtosNovos: number;
  produtosAtualizados: number;
  participantesNovos: number;
  participantesAtualizados: number;
};

/** Lê o acervo da empresa em blocos e devolve os documentos no formato do agregador. */
async function documentosDoAcervo(tenantId: string, companyId: string, cnpj: string): Promise<DocumentoDoAcervo[]> {
  const prisma = getPrisma();
  const saida: DocumentoDoAcervo[] = [];
  let cursor: string | undefined;
  for (;;) {
    const livros = await prisma.spedFiscalBook.findMany({
      where: { tenantId, companyId },
      select: { id: true, documentId: true },
      orderBy: { id: "asc" },
      take: BLOCO,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (livros.length === 0) break;
    cursor = livros[livros.length - 1]!.id;
    const ids = livros.map((l) => l.documentId);
    const [docs, itens] = await Promise.all([
      prisma.spedFiscalDocument.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, data: true } }),
      prisma.spedFiscalItem.findMany({ where: { tenantId, documentId: { in: ids } }, select: { documentId: true, data: true }, orderBy: { position: "asc" } }),
    ]);
    const itensPorDoc = new Map<string, { codigo: string; descricao: string; ncm: string; tipoItem: string; cfop: string | null }[]>();
    for (const i of itens) {
      const lido = itemSchema.safeParse(i.data);
      if (!lido.success) continue;
      const lista = itensPorDoc.get(i.documentId) ?? [];
      lista.push({ codigo: lido.data.codigo, descricao: lido.data.descricao, ncm: lido.data.ncm, tipoItem: lido.data.tipoItem, cfop: lido.data.cfop });
      itensPorDoc.set(i.documentId, lista);
    }
    for (const d of docs) {
      const lido = documentoSchema.safeParse({ ...(d.data as object), itens: [] });
      if (!lido.success) continue;
      const doc = lido.data;
      const daNota = itensPorDoc.get(d.id) ?? [];
      saida.push({
        tipo: doc.tipo,
        sentido: sentidoNaEmpresa({ emitente: doc.emitente, itens: daNota }, cnpj) === "entrada" ? "ENTRADA" : "SAIDA",
        emitente: doc.emitente,
        nomeEmitente: doc.nomeEmitente,
        destinatario: doc.destinatario,
        nomeDestinatario: doc.nomeDestinatario,
        emitidoEm: doc.emitidoEm,
        cancelado: doc.cancelado,
        itens: daNota,
      });
    }
    if (livros.length < BLOCO) break;
  }
  return saida;
}

export async function sincronizarDoAcervo(tenantId: string, companyId: string): Promise<ResultadoDaSincronizacao> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { cnpj: true, cpf: true } });
  if (!empresa) throw new ErroDoCadastroFiscal("Empresa não encontrada.");
  const documento = (empresa.cnpj ?? empresa.cpf ?? "").replace(/\D/g, "");
  if (!documento) throw new ErroDoCadastroFiscal("A empresa não tem CNPJ no cadastro: sem ele não dá para saber quais notas são entrada e quais são saída.");

  const docs = await documentosDoAcervo(tenantId, companyId, documento);
  const acervo = agregarDoAcervo(docs, documento);
  const [produtos, participantes] = await Promise.all([
    prisma.fiscalProduto.findMany({
      where: { tenantId, companyId },
      select: { id: true, participanteDocumento: true, codigo: true, descricao: true, ncm: true, ocorrencias: true, ultimaNotaEm: true, editadoEm: true },
    }),
    prisma.fiscalParticipante.findMany({ where: { tenantId, companyId }, select: { id: true, documento: true, nome: true, papel: true, documentos: true, ultimaNotaEm: true } }),
  ]);
  const plano = planejarSincronizacao(acervo, { produtos, participantes });

  for (let i = 0; i < plano.produtosNovos.length; i += BLOCO) {
    await prisma.fiscalProduto.createMany({
      data: plano.produtosNovos.slice(i, i + BLOCO).map((p) => ({ tenantId, companyId, ...p })),
      skipDuplicates: true,
    });
  }
  for (let i = 0; i < plano.participantesNovos.length; i += BLOCO) {
    await prisma.fiscalParticipante.createMany({
      data: plano.participantesNovos.slice(i, i + BLOCO).map((p) => ({ tenantId, companyId, ...p })),
      skipDuplicates: true,
    });
  }
  for (let i = 0; i < plano.produtosMudados.length; i += 100) {
    await prisma.$transaction(plano.produtosMudados.slice(i, i + 100).map((m) => prisma.fiscalProduto.update({ where: { id: m.id }, data: m.dados })));
  }
  for (let i = 0; i < plano.participantesMudados.length; i += 100) {
    await prisma.$transaction(plano.participantesMudados.slice(i, i + 100).map((m) => prisma.fiscalParticipante.update({ where: { id: m.id }, data: m.dados })));
  }
  return {
    documentos: docs.length,
    produtosNovos: plano.produtosNovos.length,
    produtosAtualizados: plano.produtosMudados.length,
    participantesNovos: plano.participantesNovos.length,
    participantesAtualizados: plano.participantesMudados.length,
  };
}

// ─── Vínculos do NCM ────────────────────────────────────────────────────────

export type VinculoNaLista = VinculoDoNcm & { id: string; atualizadoPor: string; atualizadoEm: Date };

export async function listarVinculos(tenantId: string): Promise<VinculoNaLista[]> {
  const v = await getPrisma().fiscalVinculoNcm.findMany({
    where: { tenantId },
    select: { id: true, ncm: true, cClassTrib: true, cstIbsCbs: true, observacao: true, atualizadoPor: true, updatedAt: true },
    orderBy: { ncm: "asc" },
  });
  return v.map(({ updatedAt, ...r }) => ({ ...r, atualizadoEm: updatedAt }));
}

async function mapaDeVinculos(tenantId: string) {
  const v = await getPrisma().fiscalVinculoNcm.findMany({ where: { tenantId }, select: { ncm: true, cClassTrib: true, cstIbsCbs: true } });
  return new Map(v.map((x) => [x.ncm, { cClassTrib: x.cClassTrib, cstIbsCbs: x.cstIbsCbs }]));
}

export async function salvarVinculo(tenantId: string, v: VinculoDoNcm, quem: string): Promise<void> {
  await getPrisma().fiscalVinculoNcm.upsert({
    where: { tenantId_ncm: { tenantId, ncm: v.ncm } },
    create: { tenantId, ...v, atualizadoPor: quem.slice(0, 150) },
    update: { cClassTrib: v.cClassTrib, cstIbsCbs: v.cstIbsCbs, observacao: v.observacao, atualizadoPor: quem.slice(0, 150) },
  });
}

export async function excluirVinculo(tenantId: string, id: string): Promise<string> {
  const prisma = getPrisma();
  const v = await prisma.fiscalVinculoNcm.findFirst({ where: { id, tenantId }, select: { ncm: true } });
  if (!v) throw new ErroDoCadastroFiscal("O vínculo não existe mais. Recarregue a tela.");
  await prisma.fiscalVinculoNcm.delete({ where: { id } });
  return v.ncm;
}

/** Os NCMs dos produtos da empresa que ainda não têm vínculo, dos mais usados. */
export async function ncmsSemVinculo(tenantId: string, companyId: string): Promise<{ ncm: string; produtos: number }[]> {
  const prisma = getPrisma();
  const comVinculo = (await prisma.fiscalVinculoNcm.findMany({ where: { tenantId }, select: { ncm: true } })).map((v) => v.ncm);
  const grupos = await prisma.fiscalProduto.groupBy({
    by: ["ncm"],
    where: { tenantId, companyId, ncm: { not: "", ...(comVinculo.length > 0 ? { notIn: comVinculo } : {}) }, cClassTrib: null },
    _count: { _all: true },
    orderBy: { _count: { ncm: "desc" } },
    take: 20,
  });
  return grupos.map((g) => ({ ncm: g.ncm, produtos: g._count._all }));
}

// ─── Produtos ───────────────────────────────────────────────────────────────

export type FiltroDeProdutos = { q?: string; sentido?: "ENTRADA" | "SAIDA"; pendencia?: "sem_ncm" | "sem_classtrib" };

export type ProdutoNaLista = {
  id: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cest: string | null;
  unidade: string | null;
  grupo: string | null;
  origem: string | null;
  tipoItem: string;
  cClassTrib: string | null;
  cstIbsCbs: string | null;
  efetivo: CClassTribEfetivo;
  sentido: "ENTRADA" | "SAIDA";
  fornecedor: string | null;
  ocorrencias: number;
  ultimaNotaEm: Date | null;
  editado: boolean;
};

async function whereDosProdutos(tenantId: string, companyId: string, f: FiltroDeProdutos): Promise<Prisma.FiscalProdutoWhereInput> {
  const where: Prisma.FiscalProdutoWhereInput = { tenantId, companyId };
  const q = f.q?.trim();
  if (q) where.OR = [{ codigo: { contains: q } }, { descricao: { contains: q } }, { ncm: { startsWith: q.replace(/\D/g, "") || q } }];
  if (f.sentido) where.sentido = f.sentido;
  if (f.pendencia === "sem_ncm") where.ncm = "";
  if (f.pendencia === "sem_classtrib") {
    const comVinculo = (await getPrisma().fiscalVinculoNcm.findMany({ where: { tenantId }, select: { ncm: true } })).map((v) => v.ncm);
    where.cClassTrib = null;
    if (comVinculo.length > 0) where.ncm = { notIn: comVinculo };
  }
  return where;
}

export async function listarProdutos(tenantId: string, companyId: string, f: FiltroDeProdutos, pagina: number): Promise<{ itens: ProdutoNaLista[]; total: number }> {
  const prisma = getPrisma();
  const where = await whereDosProdutos(tenantId, companyId, f);
  const [linhas, total, vinculos] = await Promise.all([
    prisma.fiscalProduto.findMany({
      where,
      orderBy: [{ ocorrencias: "desc" }, { descricao: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.fiscalProduto.count({ where }),
    mapaDeVinculos(tenantId),
  ]);
  const docs = [...new Set(linhas.map((l) => l.participanteDocumento).filter(Boolean))];
  const nomes = docs.length
    ? new Map((await prisma.fiscalParticipante.findMany({ where: { tenantId, companyId, documento: { in: docs } }, select: { documento: true, nome: true } })).map((p) => [p.documento, p.nome]))
    : new Map<string, string>();
  return {
    total,
    itens: linhas.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      descricao: l.descricao,
      ncm: l.ncm,
      cest: l.cest,
      unidade: l.unidade,
      grupo: l.grupo,
      origem: l.origem,
      tipoItem: l.tipoItem,
      cClassTrib: l.cClassTrib,
      cstIbsCbs: l.cstIbsCbs,
      efetivo: cClassTribEfetivo(l, vinculos),
      sentido: l.sentido === "SAIDA" ? "SAIDA" : "ENTRADA",
      fornecedor: l.participanteDocumento ? (nomes.get(l.participanteDocumento) ?? l.participanteDocumento) : null,
      ocorrencias: l.ocorrencias,
      ultimaNotaEm: l.ultimaNotaEm,
      editado: l.editadoEm !== null,
    })),
  };
}

export async function contagensDoCadastro(tenantId: string, companyId: string) {
  const prisma = getPrisma();
  const [produtos, participantes, semNcm, semClassTrib] = await Promise.all([
    prisma.fiscalProduto.count({ where: { tenantId, companyId } }),
    prisma.fiscalParticipante.count({ where: { tenantId, companyId } }),
    prisma.fiscalProduto.count({ where: { tenantId, companyId, ncm: "" } }),
    whereDosProdutos(tenantId, companyId, { pendencia: "sem_classtrib" }).then((w) => prisma.fiscalProduto.count({ where: w })),
  ]);
  return { produtos, participantes, semNcm, semClassTrib };
}

/** Edita um produto; descrição ou NCM marcam o produto como editado à mão. */
export async function editarProduto(tenantId: string, companyId: string, id: string, e: EdicaoDoProduto): Promise<string> {
  const prisma = getPrisma();
  const p = await prisma.fiscalProduto.findFirst({ where: { id, tenantId, companyId }, select: { codigo: true, descricao: true, ncm: true } });
  if (!p) throw new ErroDoCadastroFiscal("O produto não existe mais. Recarregue a tela.");
  const mexeuNoQueVemDaNota = (e.descricao !== undefined && e.descricao !== p.descricao) || (e.ncm !== undefined && e.ncm !== p.ncm);
  await prisma.fiscalProduto.update({ where: { id }, data: { ...e, ...(mexeuNoQueVemDaNota ? { editadoEm: new Date() } : {}) } });
  return p.codigo;
}

export const TETO_DO_LOTE = 500;

export async function editarProdutosEmLote(tenantId: string, companyId: string, ids: string[], e: EdicaoDoProduto): Promise<number> {
  if (ids.length === 0) throw new ErroDoCadastroFiscal("Marque ao menos um produto.");
  if (ids.length > TETO_DO_LOTE) throw new ErroDoCadastroFiscal(`Até ${TETO_DO_LOTE} produtos por vez.`);
  const r = await getPrisma().fiscalProduto.updateMany({ where: { tenantId, companyId, id: { in: ids } }, data: e });
  return r.count;
}

// ─── Participantes ──────────────────────────────────────────────────────────

export type FiltroDeParticipantes = { q?: string; papel?: "FORNECEDOR" | "CLIENTE" };

export async function listarParticipantes(tenantId: string, companyId: string, f: FiltroDeParticipantes, pagina: number) {
  const prisma = getPrisma();
  const where: Prisma.FiscalParticipanteWhereInput = { tenantId, companyId };
  const q = f.q?.trim();
  if (q) where.OR = [{ nome: { contains: q } }, { documento: { startsWith: q.replace(/\D/g, "") || q } }];
  if (f.papel) where.papel = { in: [f.papel, "AMBOS"] };
  const [itens, total] = await Promise.all([
    prisma.fiscalParticipante.findMany({ where, orderBy: [{ documentos: "desc" }, { nome: "asc" }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.fiscalParticipante.count({ where }),
  ]);
  return { itens, total };
}

export async function editarParticipante(tenantId: string, companyId: string, id: string, e: EdicaoDoParticipante): Promise<string> {
  const r = await getPrisma().fiscalParticipante.updateMany({ where: { id, tenantId, companyId }, data: e });
  if (r.count === 0) throw new ErroDoCadastroFiscal("O cadastro não existe mais. Recarregue a tela.");
  return e.nome;
}
