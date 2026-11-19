import "server-only";

// Notas fiscais (Bloco C, Fase C1, 18/11/2026): porte de `NotaService` (`src/domain/notas/service.py`).
// A validação, a identidade (`dedup_key`), a procedência e as recusas são as funções puras de
// `notas/servico.ts`; aqui ficam as leituras, as gravações e a chamada dos leitores.
//
// - Toda leitura e escrita confere tenant e empresa (`empresaDoTenant`) e a nota DESTA empresa: id de
//   outro escritório ou de outra empresa é "não encontrada".
// - Importar: o arquivo é lido inteiro antes de gravar (XML, cada XML do ZIP, ou PDF e imagem pela IA,
//   fora da transação do banco). Depois, uma transação grava as notas na ordem, com a duplicidade
//   decidida contra o banco e contra as notas anteriores do mesmo arquivo; se outra importação gravar a
//   mesma nota nesse meio-tempo (P2002), a gravação é refeita uma vez e a nota conta como duplicada.
//   No original o pedido inteiro era uma transação só, com o mesmo efeito.
// - Associar, desassociar e cancelar: cada um é um `updateMany` que exige o estado lido, para duas
//   pessoas não ligarem a mesma nota a transações diferentes ao mesmo tempo.
// - Auditoria: a rota registra (`logAudit`). Cada escrita devolve `auditoria` com a ação e os dados; o
//   original não auditava as notas (só o log).

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { Prisma } from "@/generated/prisma/client";
import { reescala, texto } from "../motor/decimal";
import {
  buscaDaLista,
  caminhoDoArquivo,
  conferirAssociacao,
  conferirDesassociacao,
  DEPOIS,
  NOTA_JA_CADASTRADA,
  NOTA_NAO_ENCONTRADA,
  notaParaGravar,
  prepararImportacao,
  resumoDaImportacao,
  xmlsDoZip,
  type BuscaDaLista,
  type CamposDaNota,
  type FiltrosDaLista,
  type LeituraDaNota,
  type NotaParaGravar,
  type RecusaNota,
  type ResultadoDaImportacao,
  type ResultadoNota,
  type StatusNota,
  type ViaDaNota,
} from "../notas/servico";
import type { ListaDeNotas, NotaDaTela, TransacaoParaAssociar } from "../notas/telaDasNotas";
import type { NotaLida, OrigemNota, TipoNota } from "../notas/tipos";
import { lerNotaXml } from "../notas/xml";
import { lerNotaImagem, lerNotaPdf } from "../notas/visual";
import type { ContextoDeLeitura } from "../ia/leituraPorIa";
import { listarExtrato } from "./consultas";
import { decDoBanco, dia, ehDuplicado, empresaDoTenant, NAO_ENCONTRADA, paraBanco } from "./base";

/** O que a rota passa ao `logAudit`. */
export type AuditoriaDaNota = { acao: string; dados: Record<string, unknown> };
/** O resultado de toda escrita sobre uma nota: a nota como a tela a mostra e a auditoria. */
export type EscritaDaNota = { nota: NotaDaTela; auditoria: AuditoriaDaNota };

/** As ações registradas (o original só registrava em log: `nota.criada`, `nota.associada`…). */
export const ACOES_DAS_NOTAS = {
  criada: "contabil.core.nota.criada",
  importadas: "contabil.core.notas.importadas",
  associada: "contabil.core.nota.associada",
  desassociada: "contabil.core.nota.desassociada",
  cancelada: "contabil.core.nota.cancelada",
} as const;

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const empresaNaoEncontrada = (): RecusaNota => ({ ok: false, erro: NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const notaNaoEncontrada = (): RecusaNota => ({ ok: false, erro: NOTA_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });

// ─── Leituras ───────────────────────────────────────────────────────────────

const COLUNAS = {
  id: true, tipo: true, numero: true, serie: true, cnpjEmitente: true, nomeEmitente: true, cnpjDestinatario: true, valor: true,
  dataEmissao: true, status: true, transacaoId: true, chaveAcesso: true, observacao: true, origem: true, assinaturaMotivo: true,
  // O resumo da transação vem no mesmo SELECT (o original travou isso num teste: um JOIN, não um por nota).
  // Como no original, a transação desfeita continua aparecendo (o `outerjoin` não olha `deleted_at`).
  transacao: { select: { historico: true, valor: true, dc: true, data: true, deletedAt: true, empresaId: true } },
} satisfies Prisma.CoreNotaFiscalSelect;

type LinhaDaNota = Prisma.CoreNotaFiscalGetPayload<{ select: typeof COLUNAS }>;

/** O dinheiro de `Decimal(15,2)` com as 2 casas ("800.00"), como o PostgreSQL devolvia. */
const dinheiro = (v: Prisma.Decimal) => texto(reescala(decDoBanco(v), -2));

function notaParaTela(n: LinhaDaNota, empresaId: string): NotaDaTela {
  const t = n.transacao && n.transacao.empresaId === empresaId ? n.transacao : null;
  return {
    id: n.id,
    tipo: n.tipo as TipoNota,
    numero: n.numero,
    serie: n.serie,
    cnpjEmitente: n.cnpjEmitente,
    nomeEmitente: n.nomeEmitente,
    cnpjDestinatario: n.cnpjDestinatario,
    valor: dinheiro(n.valor),
    dataEmissao: n.dataEmissao.toISOString(),
    status: n.status as StatusNota,
    transacaoId: n.transacaoId,
    transacao: t ? { historico: t.historico, valor: dinheiro(t.valor), dc: t.dc, data: dia(t.data), desfeita: t.deletedAt !== null } : null,
    chaveAcesso: n.chaveAcesso,
    observacao: n.observacao,
    origem: n.origem as OrigemNota,
    assinaturaMotivo: n.assinaturaMotivo,
  };
}

/** `_get_or_404`: a nota viva desta empresa e deste tenant. */
function lerNota(db: Db, tenantId: string, empresaId: string, notaId: string) {
  return db.coreNotaFiscal.findFirst({ where: { id: notaId, tenantId, empresaId, deletedAt: null }, select: COLUNAS });
}

/** A busca da lista no Prisma. `contains` no MySQL ignora maiúscula e acento (o `ilike` só maiúscula). */
export function ondeDaLista(tenantId: string, empresaId: string, b: BuscaDaLista): Prisma.CoreNotaFiscalWhereInput {
  const e: Prisma.CoreNotaFiscalWhereInput[] = [];
  if (b.cnpjIgual !== null) e.push({ OR: [{ cnpjEmitente: b.cnpjIgual }, { cnpjDestinatario: b.cnpjIgual }] });
  if (b.cnpjContem !== null) e.push({ OR: [{ cnpjEmitente: { contains: b.cnpjContem } }, { cnpjDestinatario: { contains: b.cnpjContem } }] });
  return {
    tenantId,
    empresaId,
    deletedAt: null,
    ...(b.tipo !== null ? { tipo: b.tipo } : {}),
    ...(b.status !== null ? { status: b.status } : {}),
    ...(b.numeroContem !== null ? { numero: { contains: b.numeroContem } } : {}),
    ...(b.chaveContem !== null ? { chaveAcesso: { contains: b.chaveContem } } : {}),
    ...(b.emitenteContem !== null ? { nomeEmitente: { contains: b.emitenteContem } } : {}),
    ...(b.dataDe || b.dataAte ? { dataEmissao: { ...(b.dataDe ? { gte: b.dataDe } : {}), ...(b.dataAte ? { lte: b.dataAte } : {}) } } : {}),
    ...(e.length ? { AND: e } : {}),
  };
}

/** `listar`: da emissão mais recente para a mais antiga (desempate pelo id), paginado. */
export async function listarNotas(
  tenantId: string,
  empresaId: string,
  filtros: FiltrosDaLista,
  pagina: number,
  porPagina: number,
): Promise<ResultadoNota<ListaDeNotas>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const where = ondeDaLista(tenantId, empresaId, buscaDaLista(filtros));
  const prisma = getPrisma();
  const [total, linhas] = await Promise.all([
    prisma.coreNotaFiscal.count({ where }),
    prisma.coreNotaFiscal.findMany({
      where,
      select: COLUNAS,
      orderBy: [{ dataEmissao: "desc" }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);
  return { ok: true, valor: { itens: linhas.map((n) => notaParaTela(n, empresaId)), total, pagina, porPagina } };
}

/** `obter` */
export async function obterNota(tenantId: string, empresaId: string, notaId: string): Promise<ResultadoNota<NotaDaTela>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const n = await lerNota(getPrisma(), tenantId, empresaId, notaId);
  return n ? { ok: true, valor: notaParaTela(n, empresaId) } : notaNaoEncontrada();
}

/**
 * As transações pendentes para associar, como o diálogo do original lia (`/extrato?status=pendente`,
 * 100 por vez, na ordem do extrato), com a busca pelo histórico.
 */
export async function transacoesParaAssociar(tenantId: string, empresaId: string, busca: string | null): Promise<ResultadoNota<TransacaoParaAssociar[]>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const { itens } = await listarExtrato(tenantId, empresaId, { status: "pendente", busca, pagina: 1 });
  return { ok: true, valor: itens.map((t) => ({ id: t.id, data: dia(t.data), historico: t.historico, dc: t.dc, valor: dinheiro(t.valor) })) };
}

// ─── Gravação ───────────────────────────────────────────────────────────────

function dadosDaNota(tenantId: string, empresaId: string, n: NotaParaGravar): Prisma.CoreNotaFiscalUncheckedCreateInput {
  return {
    tenantId,
    empresaId,
    tipo: n.tipo,
    numero: n.numero,
    serie: n.serie,
    cnpjEmitente: n.cnpjEmitente,
    nomeEmitente: n.nomeEmitente,
    cnpjDestinatario: n.cnpjDestinatario,
    valor: paraBanco(n.valor),
    dataEmissao: n.emissao.utc,
    status: "pendente",
    chaveAcesso: n.chaveAcesso,
    // O original perdia o motivo aqui (`criar` não o passava ao modelo); o Connect grava.
    assinaturaMotivo: n.assinaturaMotivo,
    dedupKey: n.dedupKey,
    observacao: n.observacao,
    origem: n.origem,
  };
}

/**
 * Grava as notas na ordem, numa transação: a que já existe na empresa (mesma identidade ou mesma chave
 * de acesso, as duas unicidades do original) ou que repete uma anterior do mesmo lote é duplicada.
 * Devolve os ids gravados e quantas eram duplicadas.
 */
async function gravarNotas(tenantId: string, empresaId: string, notas: readonly NotaParaGravar[]): Promise<{ ids: string[]; duplicadas: number }> {
  if (notas.length === 0) return { ids: [], duplicadas: 0 };
  const tentar = () =>
    getPrisma().$transaction(
      async (tx) => {
        const chaves = notas.map((n) => n.chaveAcesso).filter((c): c is string => c !== null);
        const existentes = await tx.coreNotaFiscal.findMany({
          where: { empresaId, OR: [{ dedupKey: { in: notas.map((n) => n.dedupKey) } }, ...(chaves.length ? [{ chaveAcesso: { in: chaves } }] : [])] },
          select: { dedupKey: true, chaveAcesso: true },
        });
        const dedups = new Set(existentes.map((e) => e.dedupKey));
        const chavesVistas = new Set(existentes.map((e) => e.chaveAcesso).filter(Boolean));
        const ids: string[] = [];
        let duplicadas = 0;
        for (const n of notas) {
          if (dedups.has(n.dedupKey) || (n.chaveAcesso !== null && chavesVistas.has(n.chaveAcesso))) {
            duplicadas++;
            continue;
          }
          const criada = await tx.coreNotaFiscal.create({ data: dadosDaNota(tenantId, empresaId, n), select: { id: true } });
          ids.push(criada.id);
          dedups.add(n.dedupKey);
          if (n.chaveAcesso !== null) chavesVistas.add(n.chaveAcesso);
        }
        return { ids, duplicadas };
      },
      { timeout: 60_000 },
    );
  try {
    return await tentar();
  } catch (e) {
    // Outra importação gravou a mesma nota entre a leitura e a gravação: na segunda vez ela já aparece.
    if (ehDuplicado(e)) return tentar();
    throw e;
  }
}

/** `criar` (o cadastro à mão): a validação do `NotaFiscalCreate`, a identidade e a gravação. */
export async function criarNota(tenantId: string, userId: string, empresaId: string, campos: CamposDaNota): Promise<ResultadoNota<EscritaDaNota>> {
  const preparada = notaParaGravar(campos);
  if (!preparada.ok) return { ok: false, erro: preparada.erro, codigo: "INVALIDA" };
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const { ids } = await gravarNotas(tenantId, empresaId, [preparada.valor]);
  if (ids.length === 0) return { ok: false, erro: NOTA_JA_CADASTRADA, codigo: "CONFLITO" };
  const r = await obterNota(tenantId, empresaId, ids[0]);
  if (!r.ok) return r;
  return {
    ok: true,
    valor: { nota: r.valor, auditoria: { acao: ACOES_DAS_NOTAS.criada, dados: { nome: preparada.valor.numero, tipo: preparada.valor.tipo, origem: preparada.valor.origem } } },
  };
}

// ─── Importação ─────────────────────────────────────────────────────────────

/**
 * A chave do escritório que libera mandar nota fiscal (documento financeiro) à IA: o
 * `ALLOW_FINANCIAL_DATA_TO_OPENAI` do original, DESLIGADA por padrão (decisão do Angelo, 18/11/2026).
 * Mora em `TenantContabilCoreConfig.iaDocumentosFinanceiros` (uma linha por escritório; sem linha, ou
 * sem a tabela ainda, vale desligada) e quem coordena o Contábil Core liga em Configurações.
 */
export async function iaLiberadaParaDocumentos(tenantId: string): Promise<boolean> {
  try {
    const config = await getPrisma().tenantContabilCoreConfig.findUnique({ where: { tenantId }, select: { iaDocumentosFinanceiros: true } });
    return config?.iaDocumentosFinanceiros === true;
  } catch (err) {
    if (isPrismaMissingTableError(err)) return false;
    throw err;
  }
}

/** Liga ou desliga a chave. Devolve o valor anterior (para a auditoria só registrar mudança). */
export async function definirIaParaDocumentos(tenantId: string, ligada: boolean): Promise<{ antes: boolean }> {
  const antes = await iaLiberadaParaDocumentos(tenantId);
  await getPrisma().tenantContabilCoreConfig.upsert({
    where: { tenantId },
    create: { tenantId, iaDocumentosFinanceiros: ligada },
    update: { iaDocumentosFinanceiros: ligada },
  });
  return { antes };
}

/** A recusa de um leitor (XML inválido, nota sem protocolo, IA desligada…): a frase vai para a lista de erros. */
export const leituraRecusada = (e: unknown): e is Error => e instanceof Error && e.name === "NotaInvalida";

async function ler(leitor: () => Promise<NotaLida> | NotaLida): Promise<LeituraDaNota> {
  try {
    return { ok: true, nota: await leitor() };
  } catch (e) {
    if (leituraRecusada(e)) return { ok: false, erro: e.message };
    throw e;
  }
}

/**
 * `importar_xml`, `importar_visual` e `importar_zip`, pelo caminho que a extensão do arquivo diz (como a
 * rota do original). As recusas (do leitor, do CNPJ da empresa, da validação) vão para `erros`, uma
 * linha por arquivo; a nota repetida conta em `duplicadas`. Audita só quando alguma nota entra.
 */
export async function importarArquivo(
  tenantId: string,
  userId: string,
  empresaId: string,
  arquivo: { nome: string; conteudo: Uint8Array },
): Promise<ResultadoNota<{ resultado: ResultadoDaImportacao; mensagem: string; auditoria: AuditoriaDaNota | null }>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return empresaNaoEncontrada();
  const contexto: ContextoDeLeitura = {
    tenantId,
    documentosFinanceirosLiberados: await iaLiberadaParaDocumentos(tenantId),
    contexto: { userId, entityType: "empresa", entityId: empresaId },
  };
  const caminho = caminhoDoArquivo(arquivo.nome);

  // 1. Ler tudo (fora da transação: a IA pode levar segundos).
  const lidas: { nome: string; via: ViaDaNota; leitura: LeituraDaNota }[] = [];
  const erros: string[] = [];
  if (caminho.via === "zip") {
    const zip = xmlsDoZip(arquivo.conteudo);
    if (!zip.ok) erros.push(zip.erro);
    else {
      for (const x of zip.xmls) {
        if ("erro" in x) lidas.push({ nome: x.nome, via: "xml", leitura: { ok: false, erro: x.erro } });
        else lidas.push({ nome: x.nome, via: "xml", leitura: await ler(() => lerNotaXml(x.conteudo)) });
      }
    }
  } else if (caminho.via === "xml") {
    lidas.push({ nome: arquivo.nome, via: "xml", leitura: await ler(() => lerNotaXml(arquivo.conteudo)) });
  } else {
    const leitura = caminho.pdf
      ? await ler(() => lerNotaPdf(arquivo.conteudo, contexto))
      : await ler(() => lerNotaImagem(arquivo.conteudo, caminho.tipoMime, contexto));
    lidas.push({ nome: arquivo.nome, via: "visual", leitura });
  }

  // 2. Conferir e validar cada uma; 3. gravar as que passaram, na ordem.
  const prontas: NotaParaGravar[] = [];
  for (const l of lidas) {
    const p = prepararImportacao({ nomeArquivo: l.nome, via: l.via, leitura: l.leitura, cnpjEmpresa: empresa.cnpj });
    if (p.ok) prontas.push(p.nota);
    else erros.push(p.erro);
  }
  const { ids, duplicadas } = await gravarNotas(tenantId, empresaId, prontas);
  const resultado: ResultadoDaImportacao = { importadas: ids.length, duplicadas, erros, notas: ids };
  const auditoria =
    ids.length > 0
      ? { acao: ACOES_DAS_NOTAS.importadas, dados: { nome: arquivo.nome, importadas: ids.length, duplicadas, erros: erros.length, notas: ids } }
      : null;
  return { ok: true, valor: { resultado, mensagem: resumoDaImportacao(resultado), auditoria } };
}

// ─── Associação, desassociação e cancelamento ───────────────────────────────

/**
 * Muda o estado da nota só se ele ainda for o lido (outra pessoa pode ter associado ou cancelado
 * nesse meio-tempo). `false` quando mudou: a operação é conferida de novo com o estado novo.
 */
async function mudarEstado(db: Db, tenantId: string, empresaId: string, n: LinhaDaNota, depois: { status: string; transacaoId: string | null }): Promise<boolean> {
  const r = await db.coreNotaFiscal.updateMany({
    where: { id: n.id, tenantId, empresaId, deletedAt: null, status: n.status, transacaoId: n.transacaoId },
    data: depois,
  });
  return r.count === 1;
}

/** Tenta de novo (até 3 vezes) quando o estado da nota mudou entre a leitura e a gravação. */
async function comEstadoAtual<T>(passo: () => Promise<ResultadoNota<T> | "mudou">): Promise<ResultadoNota<T>> {
  for (let i = 0; i < 3; i++) {
    const r = await passo();
    if (r !== "mudou") return r;
  }
  return { ok: false, erro: "A nota mudou enquanto você trabalhava. Atualize a tela.", codigo: "CONFLITO" };
}

async function escrita(tenantId: string, empresaId: string, notaId: string, auditoria: AuditoriaDaNota): Promise<ResultadoNota<EscritaDaNota>> {
  const r = await obterNota(tenantId, empresaId, notaId);
  return r.ok ? { ok: true, valor: { nota: r.valor, auditoria } } : r;
}

/**
 * `associar_transacao`: a nota (não cancelada, sem transação) passa a apontar para a transação desta
 * empresa e fica "associada". A transação precisa estar viva (o original aceitava a já desfeita).
 */
export async function associarNota(tenantId: string, empresaId: string, notaId: string, transacaoId: string): Promise<ResultadoNota<EscritaDaNota>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const feito = await comEstadoAtual(async (): Promise<ResultadoNota<null> | "mudou"> => {
    const n = await lerNota(prisma, tenantId, empresaId, notaId);
    if (!n) return notaNaoEncontrada();
    const t = await prisma.coreTransacao.findFirst({ where: { id: transacaoId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
    const recusa = conferirAssociacao(n, !!t);
    if (recusa) return recusa;
    return (await mudarEstado(prisma, tenantId, empresaId, n, DEPOIS.associar(t!.id))) ? { ok: true, valor: null } : "mudou";
  });
  if (!feito.ok) return feito;
  return escrita(tenantId, empresaId, notaId, { acao: ACOES_DAS_NOTAS.associada, dados: { nota_id: notaId, transacao_id: transacaoId } });
}

/** `desassociar_transacao`: só a nota associada; ela volta para "pendente", sem transação. */
export async function desassociarNota(tenantId: string, empresaId: string, notaId: string): Promise<ResultadoNota<EscritaDaNota>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const feito = await comEstadoAtual(async (): Promise<ResultadoNota<string | null> | "mudou"> => {
    const n = await lerNota(prisma, tenantId, empresaId, notaId);
    if (!n) return notaNaoEncontrada();
    const recusa = conferirDesassociacao(n);
    if (recusa) return recusa;
    return (await mudarEstado(prisma, tenantId, empresaId, n, DEPOIS.desassociar())) ? { ok: true, valor: n.transacaoId } : "mudou";
  });
  if (!feito.ok) return feito;
  return escrita(tenantId, empresaId, notaId, { acao: ACOES_DAS_NOTAS.desassociada, dados: { nota_id: notaId, transacao_id: feito.valor } });
}

/** `cancelar`: sem recusa (cancelar de novo não muda nada); a associação sai junto. */
export async function cancelarNota(tenantId: string, empresaId: string, notaId: string): Promise<ResultadoNota<EscritaDaNota>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const feito = await comEstadoAtual(async (): Promise<ResultadoNota<{ status: string; transacaoId: string | null }> | "mudou"> => {
    const n = await lerNota(prisma, tenantId, empresaId, notaId);
    if (!n) return notaNaoEncontrada();
    return (await mudarEstado(prisma, tenantId, empresaId, n, DEPOIS.cancelar())) ? { ok: true, valor: { status: n.status, transacaoId: n.transacaoId } } : "mudou";
  });
  if (!feito.ok) return feito;
  return escrita(tenantId, empresaId, notaId, {
    acao: ACOES_DAS_NOTAS.cancelada,
    dados: { nota_id: notaId, status_anterior: feito.valor.status, transacao_id: feito.valor.transacaoId },
  });
}

// Quando o lançamento de uma transação é cancelado, as notas ligadas a ela são desvinculadas em
// `cancelarLancamento` (`servidor/neo.ts`), como em `cancelar_lancamento` do original.
