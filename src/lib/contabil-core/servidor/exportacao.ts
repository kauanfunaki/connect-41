import "server-only";

// O arquivo de importação de lançamentos do Domínio (Fase 2, 09/11/2026): porte de
// `ExportacaoService._exportar_lancamentos_importacao`. O arquivo é gerado na hora e não é guardado; a
// exportação fica registrada em `core_exportacoes` (quem, quando, período e quantas linhas).
//
// Valem só as partidas vivas: cancelar um lançamento não gera estorno, marca as partidas como
// apagadas — e o arquivo que sai do sistema não pode levá-las. Conta bancária inativa fica de fora,
// a menos que a opção venha ligada (exportar um mês em que a conta ainda estava aberta).

import { getPrisma } from "@/lib/prisma";
import { linhasDoDominio, type ContaParaExportar } from "../motor/exportacao";
import { linhasParaCsv, linhasParaTxt } from "../motor/dominio";
import type { Dc } from "../motor/regras";
import type { EntradaExportacao } from "../entradas";
import { decDoBanco, dia, empresaDoTenant, falha, limitesDoMes, NAO_ENCONTRADA, ok, type Resultado } from "./base";

export type ArquivoGerado = { nome: string; conteudo: string; tipo: string; linhas: number; avisos: string[] };

export async function gerarArquivoDoDominio(tenantId: string, userId: string, empresaId: string, f: EntradaExportacao): Promise<Resultado<ArquivoGerado>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const { inicio, fim } = limitesDoMes(f.mes);
  const ate = new Date(fim.getTime() + 86_399_999);

  const partidas = await prisma.coreRegistro.findMany({
    where: {
      tenantId, empresaId, deletedAt: null,
      dataLancamento: { gte: inicio, lte: ate },
      ...(f.agenciaId ? { agenciaId: f.agenciaId } : {}),
      ...(f.incluirContasInativas ? {} : { agencia: { ativa: true, deletedAt: null } }),
    },
    select: { id: true, lancamentoId: true, transacaoId: true, contaId: true, dc: true, valor: true, historico: true, historicoExtrato: true, dataLancamento: true },
    // Desempate por criação e id: dois cliques geram o mesmo arquivo (divergência deliberada, ver docs).
    orderBy: [{ dataLancamento: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  const contaIds = [...new Set(partidas.map((p) => p.contaId))];
  const transacaoIds = [...new Set(partidas.map((p) => p.transacaoId).filter((t): t is string => !!t))];
  const [contasLidas, transacoes] = await Promise.all([
    prisma.corePlanoConta.findMany({ where: { id: { in: contaIds }, empresaId }, select: { id: true, contaNumero: true, codigo: true, descricao: true } }),
    prisma.coreTransacao.findMany({ where: { id: { in: transacaoIds }, empresaId, deletedAt: null }, select: { id: true, dc: true } }),
  ]);
  const contas = new Map<string, ContaParaExportar>(contasLidas.map((c) => [c.id, c]));
  const dcs = new Map<string, Dc>(transacoes.map((t) => [t.id, t.dc as Dc]));

  const arquivo = linhasDoDominio(
    partidas.map((p) => ({ ...p, dc: p.dc as Dc, valor: decDoBanco(p.valor), dataLancamento: dia(p.dataLancamento) })),
    contas,
    dcs,
    f.usarHistoricoExtrato,
  );
  const conteudo = f.formato === "txt" ? linhasParaTxt(arquivo.linhas) : linhasParaCsv(arquivo.linhas);

  const avisos: string[] = [];
  if (arquivo.contasSemCodigoAbreviado.length) {
    avisos.push(`Contas sem código reduzido (o Domínio não as importa): ${arquivo.contasSemCodigoAbreviado.join("; ")}.`);
  }
  if (arquivo.lancamentosSemPar) avisos.push(`${arquivo.lancamentosSemPar} lançamento(s) sem débito e crédito ficaram de fora.`);

  await prisma.coreExportacao.create({
    data: { tenantId, empresaId, formato: f.formato, status: "concluido", filtroDe: inicio, filtroAte: ate, totalRegistros: arquivo.linhas.length, criadoPorId: userId, finishedAt: new Date() },
  });

  const cnpj = empresa.cnpj.replace(/\D/g, "");
  return ok({
    nome: `lancamentos-dominio-${cnpj}-${f.mes}.${f.formato}`,
    conteudo,
    tipo: f.formato === "txt" ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8",
    linhas: arquivo.linhas.length,
    avisos,
  });
}
