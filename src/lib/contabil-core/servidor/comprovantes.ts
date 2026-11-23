import "server-only";

// Comprovantes de pagamento (Bloco C, Fase C2, 19/11/2026): porte de `ComprovanteService`
// (`src/domain/comprovantes/service.py`) e da rota `extrair_dados_pdf`. A validação, a duplicidade e as
// recusas são as funções puras de `comprovantes/servico.ts`; aqui ficam as leituras, as gravações, o
// arquivo em disco e a chamada do leitor.
//
// - Toda leitura e escrita confere tenant e empresa (`empresaDoTenant`) e o comprovante DESTA empresa:
//   id de outro escritório ou de outra empresa é "não encontrado".
// - Criar: numa transação que trava a linha da empresa (`FOR UPDATE`), para dois envios do mesmo arquivo
//   ao mesmo tempo não passarem os dois pela conferência (no original, sem índice único, passavam); depois
//   a conta bancária, a transação, o arquivo repetido e o possível duplicado; a linha; e o arquivo em
//   disco, apagado se a transação não vingar.
// - Associar, desassociar e excluir: cada um é um `updateMany` que exige o estado lido, para duas pessoas
//   não ligarem o mesmo comprovante a transações diferentes ao mesmo tempo.
// - Auditoria: a rota registra (`logAudit`). Cada escrita devolve `auditoria` com a ação e os dados; o
//   original só registrava em log (`comprovante.criado`, `comprovante.associado`…).

import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { reescala, texto, type Dec } from "../motor/decimal";
import {
  AGENCIA_NAO_ENCONTRADA,
  COMPROVANTE_NAO_ENCONTRADO,
  conferirAssociacao,
  conferirDesassociacao,
  conferirDuplicidade,
  diaDoPagamento,
  erroJaImportado,
  filtroDeStatus,
  porArquivo,
  SEM_ARQUIVO,
  tipoDoArquivo,
  TRANSACAO_NAO_ENCONTRADA,
  validarComprovante,
  brl,
  type CamposDoComprovante,
  type ComprovanteGravado,
  type RecusaComprovante,
  type ResultadoComprovante,
} from "../comprovantes/servico";
import { FORMATO_NAO_SUPORTADO, formatoDoComprovante, LeituraRecusada, lerComprovanteImagem, lerComprovantePdf, type ComprovanteLido } from "../comprovantes/leitor";
import type { ComprovanteDaTela, ListaDeComprovantes } from "../comprovantes/telaDosComprovantes";
import type { ContextoDeLeitura } from "../ia/leituraPorIa";
import { decDoBanco, dia, empresaDoTenant, NAO_ENCONTRADA, paraBanco } from "./base";
import { iaLiberadaParaDocumentos } from "./notas";
import { apagarArquivo, chaveDoArquivo, gravarArquivo, lerArquivo } from "./originaisComprovantes";

/** O que a rota passa ao `logAudit`. */
export type AuditoriaDoComprovante = { acao: string; dados: Record<string, unknown> };
/** O resultado de toda escrita: o comprovante como a tela o mostra (ou `null`, na exclusão) e a auditoria. */
export type EscritaDoComprovante = { comprovante: ComprovanteDaTela | null; auditoria: AuditoriaDoComprovante };

/** As ações registradas (o original só registrava em log: `comprovante.criado`, `comprovante.associado`…). */
export const ACOES_DOS_COMPROVANTES = {
  criado: "contabil.core.comprovante.criado",
  associado: "contabil.core.comprovante.associado",
  desassociado: "contabil.core.comprovante.desassociado",
  excluido: "contabil.core.comprovante.excluido",
} as const;

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const empresaNaoEncontrada = (): RecusaComprovante => ({ ok: false, erro: NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const comprovanteNaoEncontrado = (): RecusaComprovante => ({ ok: false, erro: COMPROVANTE_NAO_ENCONTRADO, codigo: "NAO_ENCONTRADA" });

// ─── Leituras ───────────────────────────────────────────────────────────────

const COLUNAS = {
  id: true, agenciaId: true, transacaoId: true, favorecido: true, cpfCnpj: true, dataPagamento: true, dataVencimento: true,
  valorDocumento: true, valorPago: true, juros: true, multa: true, desconto: true, observacao: true, arquivoNome: true, storageKey: true,
  // O resumo da transação no mesmo SELECT (o original travou isso num teste: um JOIN, não um por linha). Como lá,
  // a transação desfeita continua aparecendo.
  transacao: { select: { historico: true, valor: true, dc: true, data: true, deletedAt: true, empresaId: true } },
} satisfies Prisma.CoreComprovanteSelect;

type LinhaDoComprovante = Prisma.CoreComprovanteGetPayload<{ select: typeof COLUNAS }>;

/** O dinheiro de `Decimal(15,2)` com as 2 casas ("800.00"), como o PostgreSQL devolvia. */
const dinheiro = (v: Prisma.Decimal) => texto(reescala(decDoBanco(v), -2));

function paraTela(c: LinhaDoComprovante, empresaId: string): ComprovanteDaTela {
  const t = c.transacao && c.transacao.empresaId === empresaId ? c.transacao : null;
  return {
    id: c.id,
    agenciaId: c.agenciaId,
    transacaoId: c.transacaoId,
    transacao: t ? { historico: t.historico, valor: dinheiro(t.valor), dc: t.dc, data: dia(t.data), desfeita: t.deletedAt !== null } : null,
    favorecido: c.favorecido,
    cpfCnpj: c.cpfCnpj,
    dataPagamento: c.dataPagamento ? c.dataPagamento.toISOString() : null,
    dataVencimento: c.dataVencimento ? c.dataVencimento.toISOString() : null,
    valorDocumento: c.valorDocumento ? dinheiro(c.valorDocumento) : null,
    valorPago: dinheiro(c.valorPago),
    juros: dinheiro(c.juros),
    multa: dinheiro(c.multa),
    desconto: dinheiro(c.desconto),
    observacao: c.observacao,
    arquivoNome: c.arquivoNome,
    temArquivo: c.storageKey !== null,
  };
}

/** `_get_or_404`: o comprovante vivo desta empresa e deste tenant. */
function lerComprovante(db: Db, tenantId: string, empresaId: string, id: string) {
  return db.coreComprovante.findFirst({ where: { id, tenantId, empresaId, deletedAt: null }, select: COLUNAS });
}

/** `listar`: do pagamento mais recente para o mais antigo, sem data primeiro (como o PostgreSQL), paginado. */
export async function listarComprovantes(
  tenantId: string,
  empresaId: string,
  filtros: { agenciaId?: string | null; transacaoId?: string | null; status?: string | null },
  pagina: number,
  porPagina: number,
): Promise<ResultadoComprovante<ListaDeComprovantes>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const status = filtroDeStatus(filtros.status);
  const where: Prisma.CoreComprovanteWhereInput = {
    tenantId,
    empresaId,
    deletedAt: null,
    ...(filtros.agenciaId ? { agenciaId: filtros.agenciaId } : {}),
    ...(filtros.transacaoId ? { transacaoId: filtros.transacaoId } : {}),
    ...(status === "associado" ? { transacaoId: filtros.transacaoId ? filtros.transacaoId : { not: null } } : {}),
    ...(status === "nao_associado" ? { transacaoId: null } : {}),
  };
  // `transacaoId` e "não associado" juntos não acham nada, como no original.
  if (status === "nao_associado" && filtros.transacaoId) return { ok: true, valor: { itens: [], total: 0, pagina, porPagina } };
  const prisma = getPrisma();
  const [total, linhas] = await Promise.all([
    prisma.coreComprovante.count({ where }),
    prisma.coreComprovante.findMany({
      where,
      select: COLUNAS,
      orderBy: [{ dataPagamento: { sort: "desc", nulls: "first" } }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);
  return { ok: true, valor: { itens: linhas.map((c) => paraTela(c, empresaId)), total, pagina, porPagina } };
}

/** `obter` */
export async function obterComprovante(tenantId: string, empresaId: string, id: string): Promise<ResultadoComprovante<ComprovanteDaTela>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const c = await lerComprovante(getPrisma(), tenantId, empresaId, id);
  return c ? { ok: true, valor: paraTela(c, empresaId) } : comprovanteNaoEncontrado();
}

/** Os comprovantes vivos que podem repetir o novo: o mesmo arquivo, ou o mesmo valor no mesmo dia. */
async function existentes(
  db: Db,
  tenantId: string,
  empresaId: string,
  busca: { sha256: string | null; pagamento?: { valorPago: Dec; dataPagamento: Date | null } },
): Promise<ComprovanteGravado[]> {
  const ou: Prisma.CoreComprovanteWhereInput[] = [];
  if (busca.sha256) ou.push({ arquivoSha256: busca.sha256 });
  if (busca.pagamento?.dataPagamento) {
    const { inicio, fim } = diaDoPagamento(busca.pagamento.dataPagamento);
    ou.push({ valorPago: paraBanco(busca.pagamento.valorPago), dataPagamento: { gte: inicio, lt: fim } });
  }
  if (!ou.length) return [];
  const linhas = await db.coreComprovante.findMany({
    where: { tenantId, empresaId, deletedAt: null, OR: ou },
    select: { id: true, favorecido: true, cpfCnpj: true, valorPago: true, dataPagamento: true, arquivoNome: true, arquivoSha256: true, transacaoId: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return linhas.map((c) => ({ ...c, valorPago: decDoBanco(c.valorPago), criadoEm: c.createdAt }));
}

// ─── Criar ──────────────────────────────────────────────────────────────────

export const sha256DosBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** O arquivo enviado junto do cadastro (a página do PDF ou a imagem do comprovante). */
export type ArquivoDoComprovante = { nome: string; tipo: string; conteudo: Uint8Array };

/** "R$ 1.500,00 para ACME" — o nome da linha na auditoria. */
function nomeDaAuditoria(valorPago: Dec, favorecido: string | null): string {
  return `${brl(valorPago)}${favorecido ? ` para ${favorecido}` : ""}`;
}

/**
 * `criar`. O arquivo (opcional) precisa ser PDF, PNG ou JPEG (o original guardava qualquer base64); o
 * nome guardado é o informado ou, sem ele, o do arquivo.
 */
export async function criarComprovante(
  tenantId: string,
  empresaId: string,
  campos: CamposDoComprovante,
  arquivo: ArquivoDoComprovante | null,
): Promise<ResultadoComprovante<EscritaDoComprovante>> {
  const v = validarComprovante(campos);
  if (!v.ok) return { ok: false, erro: v.erro, codigo: "INVALIDA" };
  const d = v.valor;
  const formato = arquivo ? formatoDoComprovante(arquivo.nome, arquivo.tipo, arquivo.conteudo) : null;
  if (arquivo && !formato) return { ok: false, erro: FORMATO_NAO_SUPORTADO, codigo: "INVALIDA" };
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const sha256 = arquivo ? sha256DosBytes(arquivo.conteudo) : null;
  const arquivoNome = d.arquivoNome ?? (arquivo ? arquivo.nome.slice(0, 255) || null : null);
  let gravado: string | null = null;
  try {
    const r = await getPrisma().$transaction(
      async (tx): Promise<ResultadoComprovante<string>> => {
        // Um cadastro por vez na empresa: a conferência de duplicidade e a gravação não se intercalam.
        await tx.$queryRaw`SELECT id FROM core_empresas WHERE id = ${empresaId} FOR UPDATE`;
        if (d.agenciaId) {
          const a = await tx.coreAgencia.findFirst({ where: { id: d.agenciaId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
          if (!a) return { ok: false, erro: AGENCIA_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" };
        }
        if (d.transacaoId) {
          // A transação desfeita não vale (o original não olhava o `deleted_at`).
          const t = await tx.coreTransacao.findFirst({ where: { id: d.transacaoId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
          if (!t) return { ok: false, erro: TRANSACAO_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" };
        }
        const recusa = conferirDuplicidade(d, sha256, await existentes(tx, tenantId, empresaId, { sha256, pagamento: d }));
        if (recusa) return recusa;
        const criado = await tx.coreComprovante.create({
          data: {
            tenantId,
            empresaId,
            agenciaId: d.agenciaId,
            transacaoId: d.transacaoId,
            favorecido: d.favorecido,
            cpfCnpj: d.cpfCnpj,
            dataPagamento: d.dataPagamento,
            dataVencimento: d.dataVencimento,
            valorDocumento: d.valorDocumento ? paraBanco(d.valorDocumento) : null,
            valorPago: paraBanco(d.valorPago),
            juros: paraBanco(d.juros),
            multa: paraBanco(d.multa),
            desconto: paraBanco(d.desconto),
            observacao: d.observacao,
            arquivoNome,
            arquivoSha256: sha256,
            // O tipo pelo conteúdo (o original deduzia do nome no download, e o "blob" sem extensão saía como octet-stream).
            arquivoTipo: formato ? (formato.pdf ? "application/pdf" : formato.tipoMime) : null,
            arquivoTamanho: arquivo ? arquivo.conteudo.length : null,
          },
          select: { id: true },
        });
        if (arquivo) {
          const chave = chaveDoArquivo(tenantId, criado.id, arquivo.nome);
          await tx.coreComprovante.update({ where: { id: criado.id }, data: { storageKey: chave } });
          gravado = chave;
          await gravarArquivo(tenantId, chave, arquivo.conteudo);
        }
        return { ok: true, valor: criado.id };
      },
      { timeout: 30_000 },
    );
    if (!r.ok) return r;
    const c = await obterComprovante(tenantId, empresaId, r.valor);
    if (!c.ok) return c;
    return {
      ok: true,
      valor: {
        comprovante: c.valor,
        auditoria: {
          acao: ACOES_DOS_COMPROVANTES.criado,
          dados: {
            nome: nomeDaAuditoria(d.valorPago, d.favorecido),
            comprovante_id: r.valor,
            valor_pago: c.valor.valorPago,
            arquivo_nome: c.valor.arquivoNome,
            ...(d.permitirDuplicado ? { permitir_duplicado: true } : {}),
          },
        },
      },
    };
  } catch (e) {
    if (gravado) await apagarArquivo(tenantId, gravado);
    throw e;
  }
}

// ─── Ler o arquivo para pré-preencher (`extrair_dados_pdf`) ─────────────────

/** O limite da leitura inteira: o tempo do orçamento (60 s) mais 5, como a rota do original. */
const TEMPO_DA_LEITURA_MS = 65_000;

class TempoEsgotado extends Error {}

/**
 * `extrair_dados_pdf`: não grava nada. O arquivo que já está num comprovante vivo da empresa é recusado
 * ANTES de ler (ler gastaria IA à toa); depois o formato (nome, tipo de mídia e assinatura do arquivo) e a
 * leitura, com a recusa do leitor como frase (e `DOCUMENTO_NAO_E_COMPROVANTE` para a nota fiscal).
 */
export async function extrairDoArquivo(
  tenantId: string,
  userId: string,
  empresaId: string,
  arquivo: ArquivoDoComprovante,
): Promise<ResultadoComprovante<ComprovanteLido>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const sha256 = sha256DosBytes(arquivo.conteudo);
  const existente = porArquivo(await existentes(getPrisma(), tenantId, empresaId, { sha256 }), sha256);
  if (existente) return erroJaImportado(existente);
  const formato = formatoDoComprovante(arquivo.nome, arquivo.tipo, arquivo.conteudo);
  if (!formato) return { ok: false, erro: FORMATO_NAO_SUPORTADO, codigo: "INVALIDA" };
  const quem: ContextoDeLeitura = {
    tenantId,
    documentosFinanceirosLiberados: await iaLiberadaParaDocumentos(tenantId),
    contexto: { userId, entityType: "empresa", entityId: empresaId },
  };
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    const leitura = formato.pdf ? lerComprovantePdf(arquivo.conteudo, quem) : lerComprovanteImagem(arquivo.conteudo, formato.tipoMime, quem);
    const limite = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(() => rejeitar(new TempoEsgotado()), TEMPO_DA_LEITURA_MS);
    });
    return { ok: true, valor: await Promise.race([leitura, limite]) };
  } catch (e) {
    if (e instanceof TempoEsgotado) return { ok: false, erro: "Processamento do arquivo excedeu o tempo limite.", codigo: "INVALIDA" };
    if (e instanceof LeituraRecusada) return { ok: false, erro: e.message, codigo: e.codigo ?? "INVALIDA" };
    throw e;
  } finally {
    clearTimeout(relogio);
  }
}

// ─── Associar, desassociar e excluir ────────────────────────────────────────

async function escrita(tenantId: string, empresaId: string, id: string, auditoria: AuditoriaDoComprovante): Promise<ResultadoComprovante<EscritaDoComprovante>> {
  const r = await obterComprovante(tenantId, empresaId, id);
  return r.ok ? { ok: true, valor: { comprovante: r.valor, auditoria } } : r;
}

/** Tenta de novo (até 3 vezes) quando o comprovante mudou entre a leitura e a gravação. */
async function comEstadoAtual<T>(passo: () => Promise<ResultadoComprovante<T> | "mudou">): Promise<ResultadoComprovante<T>> {
  for (let i = 0; i < 3; i++) {
    const r = await passo();
    if (r !== "mudou") return r;
  }
  return { ok: false, erro: "O comprovante mudou enquanto você trabalhava. Atualize a tela.", codigo: "CONFLITO" };
}

/** `associar_transacao`: o comprovante sem transação passa a apontar para a transação viva desta empresa. */
export async function associarComprovante(tenantId: string, empresaId: string, id: string, transacaoId: string): Promise<ResultadoComprovante<EscritaDoComprovante>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const feito = await comEstadoAtual(async (): Promise<ResultadoComprovante<null> | "mudou"> => {
    const c = await lerComprovante(prisma, tenantId, empresaId, id);
    if (!c) return comprovanteNaoEncontrado();
    // A transação desfeita não vale (o original não olhava o `deleted_at`).
    const t = await prisma.coreTransacao.findFirst({ where: { id: transacaoId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
    const recusa = conferirAssociacao(c, !!t);
    if (recusa) return recusa;
    const r = await prisma.coreComprovante.updateMany({ where: { id, tenantId, empresaId, deletedAt: null, transacaoId: null }, data: { transacaoId: t!.id } });
    return r.count === 1 ? { ok: true, valor: null } : "mudou";
  });
  if (!feito.ok) return feito;
  return escrita(tenantId, empresaId, id, { acao: ACOES_DOS_COMPROVANTES.associado, dados: { comprovante_id: id, transacao_id: transacaoId } });
}

/** `desassociar_transacao`: só o comprovante associado. */
export async function desassociarComprovante(tenantId: string, empresaId: string, id: string): Promise<ResultadoComprovante<EscritaDoComprovante>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const feito = await comEstadoAtual(async (): Promise<ResultadoComprovante<string> | "mudou"> => {
    const c = await lerComprovante(prisma, tenantId, empresaId, id);
    if (!c) return comprovanteNaoEncontrado();
    const recusa = conferirDesassociacao(c);
    if (recusa) return recusa;
    const r = await prisma.coreComprovante.updateMany({ where: { id, tenantId, empresaId, deletedAt: null, transacaoId: c.transacaoId }, data: { transacaoId: null } });
    return r.count === 1 ? { ok: true, valor: c.transacaoId! } : "mudou";
  });
  if (!feito.ok) return feito;
  return escrita(tenantId, empresaId, id, { acao: ACOES_DOS_COMPROVANTES.desassociado, dados: { comprovante_id: id, transacao_id: feito.valor } });
}

/** `deletar`: exclusão lógica. O arquivo fica no disco, como o base64 ficava na linha excluída. */
export async function excluirComprovante(tenantId: string, empresaId: string, id: string): Promise<ResultadoComprovante<EscritaDoComprovante>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const c = await lerComprovante(prisma, tenantId, empresaId, id);
  if (!c) return comprovanteNaoEncontrado();
  const r = await prisma.coreComprovante.updateMany({ where: { id, tenantId, empresaId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (r.count !== 1) return comprovanteNaoEncontrado();
  return {
    ok: true,
    valor: {
      comprovante: null,
      auditoria: {
        acao: ACOES_DOS_COMPROVANTES.excluido,
        dados: { comprovante_id: id, valor_pago: dinheiro(c.valorPago), favorecido: c.favorecido, transacao_id: c.transacaoId, arquivo_nome: c.arquivoNome },
      },
    },
  };
}

/** `obter_arquivo`: o arquivo do comprovante vivo, com o tipo de mídia pelo nome (como o original). */
export async function arquivoDoComprovante(tenantId: string, empresaId: string, id: string): Promise<ResultadoComprovante<{ nome: string; tipo: string; bytes: Buffer }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const c = await getPrisma().coreComprovante.findFirst({ where: { id, tenantId, empresaId, deletedAt: null }, select: { arquivoNome: true, arquivoTipo: true, storageKey: true } });
  if (!c) return comprovanteNaoEncontrado();
  if (!c.storageKey) return { ok: false, erro: SEM_ARQUIVO, codigo: "NAO_ENCONTRADA" };
  const bytes = await lerArquivo(tenantId, c.storageKey);
  if (!bytes) return { ok: false, erro: "O arquivo deste comprovante não foi encontrado no servidor.", codigo: "NAO_ENCONTRADA" };
  return { ok: true, valor: { nome: c.arquivoNome ?? "", tipo: c.arquivoTipo ?? tipoDoArquivo(c.arquivoNome), bytes } };
}
