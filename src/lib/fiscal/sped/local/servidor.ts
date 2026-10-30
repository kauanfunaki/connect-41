import "server-only";
import { randomUUID } from "node:crypto";
import { serializarPacote } from "./pacote";
import { pacoteGeracaoSchema } from "./contrato";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { podeNoModulo } from "@/lib/auth/modulo";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { getTenantModuleStates } from "@/lib/modules";
import { canViewSector } from "@/lib/auth/context";
import { competenciaPadrao } from "@/lib/fiscal/motor/estabelecimentos";
import { apurarPeriodos, conferirApoios, produtosDaBase } from "./calculo";
import { ajusteSchema, apoioSchema, classificacaoSchema, documentoSchema, itemSchema, parametrosSchema, perfilSchema, periodoSchema, mesesDoPeriodo, chaveCredito, ratearCredito, type ApoioEscriturado, type Classificacao, type ContextoLocal, type DecisaoFiscal, type DocumentoEscriturado, type DocumentoFiscal, type Obrigacao } from "./dominio";
import type { EtapaDoSped } from "../etapas";

export const MODULOS_DA_ABA = { classificacao: ["fiscal_classificacao"], apuracao: ["fiscal_icms_ipi", "fiscal_contribuicoes"], fechamento: ["fiscal_fechamento"], gerar: ["fiscal_operacao"] } as const;
export const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export class ErroFiscal extends Error { constructor(message: string, readonly status = 422) { super(message); } }
export async function autorizar(ctx: AuthContext, companyId: string, aba: EtapaDoSped, agir = false) {
  if (!ctx.tenantId || !ctx.userId) throw new ErroFiscal("Não autenticado.", 401);
  const permitido = (await Promise.all(MODULOS_DA_ABA[aba].map(m => podeNoModulo(ctx, m, agir ? "agir" : "ver")))).some(Boolean);
  if (!permitido) throw new ErroFiscal("Área indisponível para seu perfil.", 404);
  const empresa = await getPrisma().company.findFirst({ where: { ...await scopedCompanyWhere(ctx), id: companyId }, select: { id: true, cnpj: true, name: true, displayName: true } });
  if (!empresa || !/^\d{14}$/.test(empresa.cnpj?.replace(/\D/g, "") ?? "")) throw new ErroFiscal("Empresa não encontrada ou sem CNPJ válido.", 404);
  return { ...empresa, cnpj: empresa.cnpj!.replace(/\D/g, ""), nome: empresa.displayName || empresa.name };
}
export async function prepararTelaLocal(params: Record<string, string | string[] | undefined>, aba: EtapaDoSped) {
  const ctx = await getAuthContext();
  const [empresasDb, estados] = await Promise.all([
    getPrisma().company.findMany({ where: { ...await scopedCompanyWhere(ctx), status: { in: ["ACTIVE", "PROSPECT"] }, cnpj: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, displayName: true, cnpj: true, logoUrl: true, parentCompanyId: true } }),
    getTenantModuleStates(ctx.tenantId),
  ]);
  const modulos = estados.filter(m => m.enabled && canViewSector(ctx, m.sectorCodes)).map(m => m.code);
  const abas = (Object.keys(MODULOS_DA_ABA) as EtapaDoSped[]).filter(a => MODULOS_DA_ABA[a].some(m => modulos.includes(m)));
  if (!abas.includes(aba)) throw new ErroFiscal("Área indisponível.", 404);
  const empresas = empresasDb.filter(e => /^\d{14}$/.test(e.cnpj?.replace(/\D/g, "") ?? "")).map(e => ({ ...e, nome: e.displayName || e.name, cnpj: e.cnpj!.replace(/\D/g, "") }));
  const selecao = await escolherEmpresaDaTela(ctx, typeof params.empresa === "string" ? params.empresa : null, empresas, { comFoco: true });
  const periodo = periodoSchema.safeParse(params.competencia);
  const competencia = periodo.success ? aba === "gerar" && periodo.data.length === 4 ? `${periodo.data}-01` : periodo.data : competenciaPadrao();
  const empresa = selecao.empresa;
  const contribuicoes = params.obrigacao === "contribuicoes" || params.obrigacao !== "icms_ipi" && !modulos.includes("fiscal_icms_ipi");
  const consolidado = aba === "fechamento" && params.escopo === "raiz"
    || aba === "apuracao" && contribuicoes && params.escopo === "raiz"
    || aba === "gerar" && contribuicoes;
  const grupo = empresa ? empresas.filter(e => consolidado ? e.cnpj.slice(0, 8) === empresa.cnpj.slice(0, 8) : e.id === empresa.id) : [];
  const root = empresa ? await getPrisma().spedFiscalRoot.findUnique({ where: { tenantId_raiz: { tenantId: ctx.tenantId, raiz: empresa.cnpj.slice(0, 8) } } }) : null;
  const contexto: ContextoLocal | null = empresa ? { tenantId: ctx.tenantId, companyId: empresa.id, cnpj: empresa.cnpj, raiz: empresa.cnpj.slice(0, 8), competencia, consolidado, revisao: root?.revision ?? 0 } : null;
  const pode = (await Promise.all(MODULOS_DA_ABA[aba].map(m => podeNoModulo(ctx, m, "agir")))).some(Boolean);
  return { ctx, empresa, empresas: selecao.noSeletor, escolha: selecao.escolha, foco: selecao.foco, grupo, contexto, competencia, abas, aba, modulos, pode };
}
export type TelaLocal = Awaited<ReturnType<typeof prepararTelaLocal>>;
export async function carregarBase(tela: TelaLocal) {
  const c = tela.contexto!;
  const ids = tela.grupo.map(e => e.id), meses = mesesDoPeriodo(c.competencia);
  const base = await getPrisma().$transaction(async tx => {
    const [root, vinculos, decisoesDb, apoiosDb, perfis, periodos, importacoes, revisoes, documentosDoAcervo] = await Promise.all([
      tx.spedFiscalRoot.findUnique({ where: { tenantId_raiz: { tenantId: c.tenantId, raiz: c.raiz } } }),
      tx.spedFiscalBook.findMany({ where: { tenantId: c.tenantId, companyId: { in: ids }, competence: { in: meses } } }),
      tx.spedFiscalDecision.findMany({ where: { tenantId: c.tenantId, raiz: c.raiz }, orderBy: { updatedAt: "desc" } }),
      tx.spedFiscalSupport.findMany({ where: { tenantId: c.tenantId, companyId: { in: ids }, competence: { in: meses } } }),
      tx.spedFiscalProfile.findMany({ where: { tenantId: c.tenantId, companyId: { in: ids } } }),
      tx.spedFiscalPeriod.findMany({ where: { tenantId: c.tenantId, companyId: { in: ids }, competence: { in: meses } } }),
      tx.spedFiscalImport.findMany({ where: { tenantId: c.tenantId, companyId: c.companyId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, state: true, cursor: true, total: true, results: true } }),
      tx.spedFiscalRevision.findMany({ where: { tenantId: c.tenantId, companyId: c.companyId, competence: { in: meses } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, revision: true, sha256: true, obligation: true, competence: true, remoteExecutionId: true, remotePackageId: true, createdAt: true } }),
      tx.fiscalDocument.findMany({ where: { tenantId: c.tenantId, companyId: { in: ids }, competence: { in: meses }, removedAtOrigin: false }, select: { id: true, companyId: true, dedupKey: true, type: true, number: true, competence: true, issuerName: true, issuerDocument: true, recipientDocument: true, amount: true, situation: true } }),
    ]);
    const docsDb = await tx.spedFiscalDocument.findMany({ where: { tenantId: c.tenantId, id: { in: [...new Set(vinculos.map(v => v.documentId))] } } });
    const itensDb = await tx.spedFiscalItem.findMany({ where: { tenantId: c.tenantId, documentId: { in: docsDb.map(d => d.id) } }, orderBy: { position: "asc" } });
    const porDoc = new Map(docsDb.map(d => [d.id, d]));
    const itensPorDoc = new Map<string, ReturnType<typeof itemSchema.parse>[]>();
    for (const i of itensDb) itensPorDoc.set(i.documentId, [...(itensPorDoc.get(i.documentId) ?? []), itemSchema.parse(i.data)]);
    const documentos: DocumentoEscriturado[] = vinculos.flatMap(v => {
      const db = porDoc.get(v.documentId), empresa = tela.grupo.find(e => e.id === v.companyId);
      if (!db || !empresa) return [];
      const d = documentoSchema.parse({ ...db.data as object, itens: itensPorDoc.get(db.id) ?? [] });
      return [{ ...d, id: db.id, companyId: v.companyId, cnpjEmpresa: empresa.cnpj, sentido: v.direction as "entrada" | "saida", nomeArquivo: db.sourceName }];
    });
    const decisoes: DecisaoFiscal[] = decisoesDb.map(d => ({ chave: d.key, tipo: d.type, dados: d.data as Record<string, unknown>, autor: d.updatedBy, em: d.updatedAt.toISOString() }));
    const apoios: ApoioEscriturado[] = apoiosDb.map(a => ({ ...apoioSchema.parse(a.data), id: a.id, companyId: a.companyId, autor: a.updatedBy, em: a.updatedAt.toISOString() }));
    const ajustes = decisoes.filter(d => d.tipo === "ajuste").map(d => ajusteSchema.parse(d.dados)).filter(a => ids.includes(a.companyId) && meses.includes(a.competencia));
    const parametros = parametrosSchema.parse(periodos.find(p => p.companyId === c.companyId && p.competence === meses[0])?.data ?? {});
    const produtos = produtosDaBase(documentos, decisoes);
    const porPeriodo = periodos.map(p => ({ companyId: p.companyId, competencia: p.competence, dados: parametrosSchema.parse(p.data) }));
    const matrizId = tela.grupo.find(e => e.cnpj.slice(8, 12) === "0001")?.id ?? c.companyId;
    const icms = apurarPeriodos(documentos, decisoes, ajustes, porPeriodo, "icms_ipi", apoios, c.competencia, ids, matrizId, c.consolidado);
    const contribuicoes = apurarPeriodos(documentos, decisoes, ajustes, porPeriodo, "contribuicoes", apoios, c.competencia, ids, matrizId, c.consolidado);
    const identidades = new Set(documentos.map(d => d.identidade));
    const acervo = documentosDoAcervo.filter(d => !identidades.has(d.dedupKey)).map(d => ({ ...d, amount: d.amount?.toFixed(2) ?? null }));
    const pendentesAcervo = acervo.filter(d => d.situation !== "CANCELADA").length;
    if (pendentesAcervo) {
      const aviso = `${pendentesAcervo} documento(s) do acervo do Connect ainda sem itens na escrituração. Importe os XMLs ou os registros disponíveis do TXT para completar a apuração.`;
      icms.pendencias.push(aviso); contribuicoes.pendencias.push(aviso);
    }
    return { revisao: root?.revision ?? 0, documentos, acervo, decisoes, apoios, ajustes, parametros, perfis: perfis.map(p => ({ companyId: p.companyId, ...perfilSchema.parse(p.data) })), periodos: periodos.map(p => ({ companyId: p.companyId, competencia: p.competence, ...parametrosSchema.parse(p.data) })), produtos, icms, contribuicoes, fechamento: conferirApoios(apoios), importacoes, revisoes: revisoes.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
  // INSERT IGNORE é atômico no MySQL: prefetch, refresh e outra aba podem
  // registrar a mesma revisão juntos, preservando a primeira cópia imutável.
  await getPrisma().spedFiscalCalculation.createMany({ data: [{ tenantId: c.tenantId, companyId: c.companyId, period: c.competencia, scope: c.consolidado ? "raiz" : "empresa", revision: base.revisao, data: json({ icms: base.icms, contribuicoes: base.contribuicoes }) }], skipDuplicates: true });
  return base;
}
export type BaseLocal = Awaited<ReturnType<typeof carregarBase>>;

/** Todas as mutações de uma raiz usam a mesma linha de revisão como lock transacional. */
export async function escreverNaRaiz<T>(ctx: AuthContext, raiz: string, revisao: number | null, f: (tx: Prisma.TransactionClient) => Promise<T>) {
  return getPrisma().$transaction(async tx => {
    await tx.spedFiscalRoot.upsert({ where: { tenantId_raiz: { tenantId: ctx.tenantId, raiz } }, create: { tenantId: ctx.tenantId, raiz }, update: { revision: { increment: 0 } } });
    const r = await tx.spedFiscalRoot.updateMany({ where: { tenantId: ctx.tenantId, raiz, ...(revisao === null ? {} : { revision: revisao }) }, data: { revision: { increment: 1 } } });
    if (!r.count) throw new ErroFiscal("Os dados foram alterados em outra aba. Atualize a tela antes de salvar.", 409);
    return f(tx);
  }, { timeout: 30000 });
}
export async function registrarDecisao(tx: Prisma.TransactionClient, ctx: AuthContext, raiz: string, tipo: string, chave: string, dados: unknown) {
  const id = randomUUID();
  const nome = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
  const autor = nome?.name || ctx.userId;
  const existente = await tx.spedFiscalDecision.findUnique({ where: { tenantId_raiz_type_key: { tenantId: ctx.tenantId, raiz, type: tipo, key: chave } } });
  await tx.spedFiscalDecision.upsert({ where: { tenantId_raiz_type_key: { tenantId: ctx.tenantId, raiz, type: tipo, key: chave } }, create: { id, tenantId: ctx.tenantId, raiz, type: tipo, key: chave, data: json(dados), updatedBy: autor }, update: { data: json(dados), updatedBy: autor } });
  await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, actorName: autor, action: `fiscal.sped.local.${tipo}`, entityType: "SpedFiscalDecision", entityId: existente?.id ?? id, metadata: json({ chave, antes: existente?.data ?? null, depois: dados }) } });
}
export async function salvarClassificacao(ctx: AuthContext, c: ContextoLocal, chaves: string[], entrada: unknown, credito: string | null, documentos: DocumentoEscriturado[], restaurarCredito = false) {
  const dados = classificacaoSchema.partial().parse(entrada);
  if (!Object.keys(dados).length && credito === null && !restaurarCredito) throw new ErroFiscal("Escolha ao menos um campo para alterar.");
  const produtos = produtosDaBase(documentos, []);
  if (!chaves.length || chaves.length > 1000 || chaves.some(k => !produtos.some(p => p.chave === k))) throw new ErroFiscal("Selecione produtos desta empresa e período.");
  return escreverNaRaiz(ctx, c.raiz, c.revisao, async tx => {
    for (const chave of chaves) {
      const p = produtos.find(p => p.chave === chave)!;
      if (Object.keys(dados).length) {
        const anterior = await tx.spedFiscalDecision.findUnique({ where: { tenantId_raiz_type_key: { tenantId: ctx.tenantId, raiz: c.raiz, type: "classificacao", key: chave } } });
        const atual: Classificacao = classificacaoSchema.parse(anterior?.data ?? { tipoItem: p.tipoItem, definicao: null, creditoPisCofins: "", observacao: "" });
        await registrarDecisao(tx, ctx, c.raiz, "classificacao", chave, { ...atual, ...dados });
      }
      if (credito !== null) {
        const rateio = ratearCredito(credito, p.meses);
        for (const [mes, valor] of Object.entries(rateio)) await registrarDecisao(tx, ctx, c.raiz, "credito_icms", chaveCredito(c.cnpj, mes, chave), { valor });
      }
      if (restaurarCredito) for (const mes of Object.keys(p.meses)) {
        const key = chaveCredito(c.cnpj, mes, chave);
        const anterior = await tx.spedFiscalDecision.findUnique({ where: { tenantId_raiz_type_key: { tenantId: ctx.tenantId, raiz: c.raiz, type: "credito_icms", key } } });
        if (anterior) { await registrarDecisao(tx, ctx, c.raiz, "credito_icms_removido", key, anterior.data); await tx.spedFiscalDecision.delete({ where: { id: anterior.id, tenantId: ctx.tenantId } }); }
      }
    }
  });
}
export async function gravarDocumento(tx: Prisma.TransactionClient, ctx: AuthContext, entrada: DocumentoFiscal, sha256: string, nome: string, caminho: string, empresaEscolhida: string) {
  const empresas = await tx.company.findMany({ where: { tenantId: ctx.tenantId, cnpj: { in: [entrada.emitente, entrada.destinatario] } }, select: { id: true, cnpj: true } });
  if (!empresas.some(e => e.id === empresaEscolhida)) throw new ErroFiscal("Documento não pertence à empresa selecionada.");
  const anterior = await tx.spedFiscalDocument.findUnique({ where: { tenantId_identity: { tenantId: ctx.tenantId, identity: entrada.identidade } } });
  const igual = anterior?.sha256 === sha256;
  const dadosAnteriores = anterior ? documentoSchema.parse({ ...anterior.data as object, itens: [] }) : null;
  if (anterior && !igual && dadosAnteriores?.fonte === entrada.fonte) throw new ErroFiscal("Já existe outra versão deste documento. O original foi preservado; confira o conflito.", 409);
  const enriquecer = !igual && (!anterior || entrada.fonte === "xml");
  let documentoId = anterior?.id;
  if (enriquecer) {
    const { itens, ...cabecalhoOriginal } = entrada;
    const cabecalho = { ...cabecalhoOriginal, referencias: { ...(dadosAnteriores?.referencias ?? {}), ...entrada.referencias } };
    if (anterior) await tx.spedFiscalDocument.update({ where: { id: anterior.id, tenantId: ctx.tenantId }, data: { data: json(cabecalho), sha256, sourceName: nome, sourcePath: caminho } });
    else documentoId = (await tx.spedFiscalDocument.create({ data: { tenantId: ctx.tenantId, identity: entrada.identidade, sha256, data: json(cabecalho), sourceName: nome, sourcePath: caminho } })).id;
    await tx.spedFiscalItem.deleteMany({ where: { tenantId: ctx.tenantId, documentId: documentoId } });
    await tx.spedFiscalItem.createMany({ data: itens.map(i => ({ tenantId: ctx.tenantId, documentId: documentoId!, position: i.ordem, data: json(i) })) });
  }
  for (const empresa of empresas) {
    // O lançamento financeiro existente não é alterado. Cada estabelecimento tem sua escrituração.
    await tx.spedFiscalBook.upsert({ where: { tenantId_companyId_documentId: { tenantId: ctx.tenantId, companyId: empresa.id, documentId: documentoId! } }, create: { tenantId: ctx.tenantId, companyId: empresa.id, documentId: documentoId!, competence: entrada.competencia, direction: empresa.cnpj === entrada.emitente ? "saida" : "entrada" }, update: {} });
  }
  await tx.fiscalDocument.upsert({ where: { tenantId_dedupKey: { tenantId: ctx.tenantId, dedupKey: entrada.identidade } }, create: { tenantId: ctx.tenantId, companyId: empresaEscolhida, type: entrada.tipo, accessKey: /^\d{44}$/.test(entrada.identidade) ? entrada.identidade : null, dedupKey: entrada.identidade, number: entrada.numero, series: entrada.serie || null, issuerName: entrada.nomeEmitente || "Não informado no TXT", issuerDocument: entrada.emitente, recipientName: entrada.nomeDestinatario || null, recipientDocument: entrada.destinatario || null, amount: entrada.valor, issuedAt: new Date(`${entrada.emitidoEm.slice(0, 10)}T00:00:00Z`), competence: entrada.competencia, origin: "UPLOAD", situation: entrada.cancelado ? "CANCELADA" : "AUTORIZADA", completude: entrada.completo ? "COMPLETO" : "PARCIAL", uploadedById: ctx.userId, renderizavel: false, cfops: [...new Set(entrada.itens.map(i => i.cfop).filter(Boolean))].join(",") || null }, update: {} });
  return igual ? "duplicado" : anterior ? "complementado" : "importado";
}
export function montarPacote(tela: TelaLocal, base: BaseLocal, obrigacao: Obrigacao, tipo: "0" | "1") {
  const c = tela.contexto!;
  if (c.competencia.length !== 7) throw new ErroFiscal("Escolha uma competência mensal para gerar.");
  if (base.perfis.length !== tela.grupo.length) throw new ErroFiscal("Configure o perfil fiscal de todos os estabelecimentos da geração.");
  if (base.perfis.some(p => !p.obrigacoes.includes(obrigacao))) throw new ErroFiscal("Obrigação não habilitada no perfil fiscal.");
  const apuracao = obrigacao === "icms_ipi" ? base.icms : base.contribuicoes;
  if (apuracao.pendencias.length) throw new ErroFiscal(`Confira a apuração antes de gerar: ${apuracao.pendencias[0]}`);
  const pacote = pacoteGeracaoSchema.parse({ versao: 1, finalidade: "geracao_connect_v1", tenant_id: c.tenantId, raiz: c.raiz, competencia: c.competencia, obrigacao, tipo_sped: tipo, revisao: base.revisao, estabelecimentos: tela.grupo.map(e => ({ id_connect: e.id, cnpj: e.cnpj, nome: e.nome, perfil: base.perfis.find(p => p.companyId === e.id) })), documentos: base.documentos, apoios: base.apoios, decisoes: base.decisoes, parametros: base.periodos, apuracao });
  return { pacote, ...serializarPacote(pacote) };
}
