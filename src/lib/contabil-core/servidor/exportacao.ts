import "server-only";

// As exportações do Contábil Core: o arquivo do Domínio (Fase 2, 09/11/2026) e, na Fase D1 (26/11/2026),
// os outros tipos do `ExportacaoService` do original (lançamentos, extrato, baixas de notas e conferência) e
// o XLSX. O arquivo é gerado na hora e não é guardado; a exportação fica registrada em `core_exportacoes`
// (quem, quando, período e quantas linhas), como o `export_jobs` do original.
//
// Aqui só se lê o banco: as linhas da empresa (tenant e empresa conferidos), já recortadas pelo período. Os
// filtros, a ordem e as colunas são os de `exportacao/arquivos.ts`, conferidos pelo gabarito.

import { getPrisma } from "@/lib/prisma";
import { linhasParaCsv, linhasParaTxt } from "../motor/dominio";
import type { ContaParaExportar } from "../motor/exportacao";
import { dec } from "../motor/decimal";
import {
  conferirPedido,
  duasCasas,
  montarExportacao,
  periodoDoMes,
  TIPOS_DE_NOTA,
  type DadosDaExportacao,
  type FormatoDeExportacao,
  type PedidoDeExportacao,
  type Periodo,
  type TipoDeExportacao,
} from "../exportacao/arquivos";
import { planilhaDasLinhas } from "../exportacao/planilha";
import type { EntradaExportacao } from "../entradas";
import { decDoBanco, empresaDoTenant, falha, NAO_ENCONTRADA, ok, type EmpresaDoCore, type Resultado } from "./base";

export type ArquivoGerado = { nome: string; conteudo: string | Uint8Array; tipo: string; linhas: number; avisos: string[]; exportacao: TipoDeExportacao };

/** O começo do nome do arquivo baixado (o original usava `<tipo>_<empresa>`; a tela, estes nomes). */
const NOME_DO_TIPO: Record<TipoDeExportacao, string> = {
  lancamentos: "lancamentos-contabeis",
  lancamentos_importacao: "lancamentos-dominio",
  extrato: "extrato",
  nfe_entrada: "baixa-nfe-entrada",
  nfe_saida: "baixa-nfe-saida",
  nfse_tomado: "baixa-nfse-tomado",
  nfse_prestado: "baixa-nfse-prestado",
  conferencia: "simples-conferencia",
};

const TIPO_DO_CONTEUDO: Record<FormatoDeExportacao, string> = {
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** O que a exportação do Domínio da Fase 2 recebe (a conferência da carga e os ensaios a chamam assim). */
export type PedidoDoDominio = { mes: string | null; agenciaId: string | null; formato: string; usarHistoricoExtrato: boolean; incluirContasInativas: boolean };

/**
 * O arquivo do Domínio em texto (TXT ou CSV), como na Fase 2. `registrar: false` gera o arquivo sem gravar o
 * histórico da exportação (a conferência da carga só lê). O XLSX do Domínio sai pela rota (`gerarExportacao`).
 */
export async function gerarArquivoDoDominio(
  tenantId: string,
  userId: string | null,
  empresaId: string,
  f: PedidoDoDominio,
  opcoes: { registrar?: boolean } = {},
): Promise<Resultado<ArquivoGerado & { conteudo: string }>> {
  if (f.formato !== "txt" && f.formato !== "csv") return falha("Formato deve ser TXT ou CSV.");
  const r = await gerarExportacao(
    tenantId,
    userId,
    empresaId,
    { ...f, tipo: "lancamentos_importacao", status: null, busca: null, dc: null, valorMin: null, valorMax: null },
    opcoes,
  );
  if (!r.ok) return r;
  const { conteudo } = r.valor;
  return typeof conteudo === "string" ? ok({ ...r.valor, conteudo }) : falha("Formato deve ser TXT ou CSV.");
}

/** `ExportacaoService.exportar`: confere o pedido, lê as linhas da empresa, monta e serializa o arquivo. */
export async function gerarExportacao(
  tenantId: string,
  userId: string | null,
  empresaId: string,
  f: Omit<EntradaExportacao, "tipo"> & { tipo: string },
  opcoes: { registrar?: boolean } = {},
): Promise<Resultado<ArquivoGerado>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const conferido = conferirPedido(f.formato, f.tipo);
  if (!conferido.ok) return falha(conferido.erro);
  const { tipo, formato } = conferido;
  if (!f.mes && tipo !== "extrato") return falha("Informe a competência.");

  const periodo: Periodo = f.mes ? periodoDoMes(f.mes) : { de: null, ate: null };
  const pedido: PedidoDeExportacao = {
    tipo,
    periodo,
    incluirContasInativas: f.incluirContasInativas,
    usarHistoricoExtrato: f.usarHistoricoExtrato,
    agenciaId: f.agenciaId,
    status: f.status,
    historico: f.busca,
    dc: f.dc,
    valorMin: f.valorMin ? dec(f.valorMin) : null,
    valorMax: f.valorMax ? dec(f.valorMax) : null,
  };
  const dados = await lerDados(tenantId, empresa, tipo, periodo);
  const m = montarExportacao(dados, pedido);
  if (!m.ok) return falha(m.erro);
  const v = m.valor;

  const conteudo =
    formato === "xlsx"
      ? await planilhaDasLinhas(v.linhas, v.colunas, v.folha)
      : formato === "txt"
        ? linhasParaTxt(v.linhas, v.colunas)
        : linhasParaCsv(v.linhas, v.colunas);

  const avisos: string[] = [];
  if (v.contasSemCodigoAbreviado.length) {
    avisos.push(`Contas sem código reduzido (o Domínio não as importa): ${v.contasSemCodigoAbreviado.join("; ")}.`);
  }
  if (v.lancamentosSemPar) avisos.push(`${v.lancamentosSemPar} lançamento(s) sem débito e crédito ficaram de fora.`);

  if (opcoes.registrar !== false) {
    await getPrisma().coreExportacao.create({
      data: {
        tenantId, empresaId, formato, status: "concluido",
        filtroDe: periodo.de ? new Date(periodo.de.ms) : null,
        filtroAte: periodo.ate ? new Date(periodo.ate.ms) : null,
        totalRegistros: v.total, criadoPorId: userId, finishedAt: new Date(),
      },
    });
  }

  const cnpj = empresa.cnpj.replace(/\D/g, "");
  return ok({
    nome: `${NOME_DO_TIPO[tipo]}-${cnpj}${f.mes ? `-${f.mes}` : ""}.${formato}`,
    conteudo,
    tipo: TIPO_DO_CONTEUDO[formato],
    linhas: v.total,
    avisos,
    exportacao: tipo,
  });
}

// ─── Leitura ──────────────────────────────────────────────────────────────

/** Um `IN` por vez de até 5.000 ids (o mês de uma empresa grande passa disso). */
async function emLotes<T>(ids: readonly string[], ler: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; i < ids.length; i += 5000) saida.push(...(await ler(ids.slice(i, i + 5000))));
  return saida;
}

const diaDoBanco = (d: Date) => d.toISOString().slice(0, 10);
const dataDoDia = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/**
 * As linhas que o tipo usa, da empresa e do período (o resto dos filtros é de `montarExportacao`). As
 * transações apagadas entram só onde o original as lia: a nota mostra a transação ligada mesmo desfeita.
 */
async function lerDados(tenantId: string, empresa: EmpresaDoCore, tipo: TipoDeExportacao, periodo: Periodo): Promise<DadosDaExportacao> {
  const prisma = getPrisma();
  const empresaId = empresa.id;
  const dados: DadosDaExportacao = {
    empresa: { id: empresa.id, cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial },
    agencias: [],
    transacoes: [],
    importacoes: new Map(),
    registros: [],
    contas: new Map(),
    notas: [],
    comprovantes: [],
  };
  const instante = { ...(periodo.de ? { gte: new Date(periodo.de.ms) } : {}), ...(periodo.ate ? { lte: new Date(periodo.ate.ms) } : {}) };
  const dias = { ...(periodo.de ? { gte: dataDoDia(periodo.de.dia) } : {}), ...(periodo.ate ? { lte: dataDoDia(periodo.ate.dia) } : {}) };
  const transacaoSelect = { id: true, agenciaId: true, data: true, valor: true, historico: true, dc: true, status: true, ordem: true, importacaoId: true, deletedAt: true, createdAt: true } as const;
  const daTransacao = (t: { id: string; agenciaId: string; data: Date; valor: { toString(): string }; historico: string; dc: string; status: string; ordem: number | null; importacaoId: string | null; deletedAt: Date | null; createdAt: Date }) => ({
    id: t.id, agenciaId: t.agenciaId, data: diaDoBanco(t.data), valor: duasCasas(decDoBanco(t.valor.toString())), historico: t.historico, dc: t.dc,
    status: t.status, ordem: t.ordem, importacaoId: t.importacaoId, apagada: t.deletedAt !== null, criadoEm: t.createdAt,
  });

  dados.agencias = (
    await prisma.coreAgencia.findMany({
      where: { tenantId, empresaId },
      select: { id: true, bancoSigla: true, agencia: true, numero: true, digito: true, ativa: true, deletedAt: true },
    })
  ).map((a) => ({ id: a.id, bancoSigla: a.bancoSigla, agencia: a.agencia, numero: a.numero, digito: a.digito, ativa: a.ativa, apagada: a.deletedAt !== null }));

  if (tipo === "lancamentos" || tipo === "lancamentos_importacao") {
    const registros = await prisma.coreRegistro.findMany({
      where: { tenantId, empresaId, deletedAt: null, dataLancamento: instante },
      select: {
        id: true, lancamentoId: true, transacaoId: true, contaId: true, agenciaId: true, historico: true, historicoExtrato: true, dc: true,
        tipoRegra: true, valor: true, dataLancamento: true, createdAt: true,
      },
    });
    dados.registros = registros.map((r) => ({
      id: r.id, lancamentoId: r.lancamentoId, transacaoId: r.transacaoId, contaId: r.contaId, agenciaId: r.agenciaId, historico: r.historico,
      historicoExtrato: r.historicoExtrato, dc: r.dc, tipoRegra: r.tipoRegra, valor: duasCasas(decDoBanco(r.valor)), dataLancamento: r.dataLancamento,
      apagado: false, criadoEm: r.createdAt,
    }));
    if (tipo === "lancamentos_importacao") {
      const contaIds = [...new Set(registros.map((r) => r.contaId))];
      const transacaoIds = [...new Set(registros.map((r) => r.transacaoId).filter((t): t is string => !!t))];
      const [contas, transacoes] = await Promise.all([
        emLotes(contaIds, (ids) => prisma.corePlanoConta.findMany({ where: { id: { in: ids }, tenantId, empresaId }, select: { id: true, contaNumero: true, codigo: true, descricao: true } })),
        emLotes(transacaoIds, (ids) => prisma.coreTransacao.findMany({ where: { id: { in: ids }, tenantId, empresaId, deletedAt: null }, select: transacaoSelect })),
      ]);
      dados.contas = new Map<string, ContaParaExportar>(contas.map((c) => [c.id, c]));
      dados.transacoes = transacoes.map(daTransacao);
    }
    return dados;
  }

  if ((TIPOS_DE_NOTA as readonly string[]).includes(tipo)) {
    const notas = await prisma.coreNotaFiscal.findMany({
      where: { tenantId, empresaId, deletedAt: null, tipo: tipo.startsWith("nfe") ? "nfe" : "nfse", dataEmissao: instante },
      select: {
        id: true, tipo: true, numero: true, serie: true, cnpjEmitente: true, nomeEmitente: true, cnpjDestinatario: true, valor: true, dataEmissao: true,
        status: true, transacaoId: true, chaveAcesso: true, createdAt: true,
      },
    });
    dados.notas = notas.map((n) => ({
      id: n.id, tipo: n.tipo, numero: n.numero, serie: n.serie, cnpjEmitente: n.cnpjEmitente, nomeEmitente: n.nomeEmitente, cnpjDestinatario: n.cnpjDestinatario,
      valor: duasCasas(decDoBanco(n.valor)), dataEmissao: n.dataEmissao, status: n.status, transacaoId: n.transacaoId, chaveAcesso: n.chaveAcesso,
      apagada: false, criadoEm: n.createdAt,
    }));
    const ids = [...new Set(notas.map((n) => n.transacaoId).filter((t): t is string => !!t))];
    // A transação ligada, mesmo desfeita (a importação desfeita deixa a nota apontando para ela).
    dados.transacoes = (await emLotes(ids, (lote) => prisma.coreTransacao.findMany({ where: { id: { in: lote }, tenantId, empresaId }, select: transacaoSelect }))).map(daTransacao);
    return dados;
  }

  // Extrato e conferência: as transações vivas do período.
  const transacoes = await prisma.coreTransacao.findMany({ where: { tenantId, empresaId, deletedAt: null, data: dias }, select: transacaoSelect });
  dados.transacoes = transacoes.map(daTransacao);
  if (tipo === "extrato") {
    const lotes = [...new Set(transacoes.map((t) => t.importacaoId).filter((i): i is string => !!i))];
    const importacoes = await emLotes(lotes, (ids) => prisma.coreImportacao.findMany({ where: { id: { in: ids }, tenantId, empresaId }, select: { id: true, createdAt: true } }));
    dados.importacoes = new Map(importacoes.map((i) => [i.id, i.createdAt]));
    return dados;
  }
  const lotes = [...new Set(transacoes.map((t) => t.importacaoId).filter((i): i is string => !!i))];
  const ids = transacoes.map((t) => t.id);
  const [importacoes, notas, comprovantes] = await Promise.all([
    emLotes(lotes, (l) => prisma.coreImportacao.findMany({ where: { id: { in: l }, tenantId, empresaId }, select: { id: true, createdAt: true } })),
    emLotes(ids, (l) =>
      prisma.coreNotaFiscal.findMany({
        where: { tenantId, empresaId, deletedAt: null, transacaoId: { in: l } },
        select: { id: true, tipo: true, numero: true, valor: true, transacaoId: true, createdAt: true, dataEmissao: true, status: true },
      }),
    ),
    emLotes(ids, (l) =>
      prisma.coreComprovante.findMany({
        where: { tenantId, empresaId, deletedAt: null, transacaoId: { in: l } },
        select: { id: true, transacaoId: true, favorecido: true, valorPago: true, createdAt: true },
      }),
    ),
  ]);
  dados.importacoes = new Map(importacoes.map((i) => [i.id, i.createdAt]));
  dados.notas = notas.map((n) => ({
    id: n.id, tipo: n.tipo, numero: n.numero, serie: null, cnpjEmitente: null, nomeEmitente: null, cnpjDestinatario: null,
    valor: duasCasas(decDoBanco(n.valor)), dataEmissao: n.dataEmissao, status: n.status, transacaoId: n.transacaoId, chaveAcesso: null, apagada: false, criadoEm: n.createdAt,
  }));
  dados.comprovantes = comprovantes.map((c) => ({
    id: c.id, transacaoId: c.transacaoId, favorecido: c.favorecido, valorPago: duasCasas(decDoBanco(c.valorPago)), apagado: false, criadoEm: c.createdAt,
  }));
  return dados;
}
