import "server-only";

// A conciliação Razão × extrato de uma conta bancária (Bloco B, Fase B2, 12/11/2026): porte das
// leituras de `conciliar_razao_extrato` (`src/domain/conciliacao_bancaria/service.py`). O resto é a
// função pura `relatorioDaConciliacao` (`conciliacao/servico.ts`).
//
// Só lê: nada é gravado. O Razão e o SISPAG chegam já lidos (`lerRazao`, `lerSispag`).
//
// Ordem das transações: o original ordena por data e ordem no PostgreSQL, que põe o NULL de `ordem`
// por último; o MySQL o poria primeiro, então a ordenação é feita aqui. O desempate final pelo id é
// deliberado (no original, dois lançamentos do mesmo dia sem ordem saíam na ordem que o banco quisesse).

import { getPrisma } from "@/lib/prisma";
import { reescala } from "../motor/decimal";
import type { RazaoConta } from "../conciliacao/razaoTipos";
import type { RelatorioConciliacao } from "../conciliacao/relatorio";
import { relatorioDaConciliacao, type TransacaoParaConciliar } from "../conciliacao/servico";
import type { ConsultaSispag } from "../conciliacao/sispag";
import { dataDoDia, decDoBanco, dia, empresaDoTenant, falha, NAO_ENCONTRADA, type Resultado } from "./base";

/** Ordem do extrato: data, `ordem` (sem ordem por último, como no PostgreSQL) e id. */
function ordemDoExtrato(a: TransacaoParaConciliar, b: TransacaoParaConciliar): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  if (a.ordem !== b.ordem) {
    if (a.ordem === null) return 1;
    if (b.ordem === null) return -1;
    return a.ordem - b.ordem;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Concilia o Razão enviado com o extrato já importado da conta bancária. */
export async function conciliarRazaoExtrato(
  tenantId: string,
  empresaId: string,
  agenciaId: string,
  razao: RazaoConta,
  sispag: ConsultaSispag | null,
): Promise<Resultado<RelatorioConciliacao>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();

  const agencia = await prisma.coreAgencia.findFirst({
    where: { id: agenciaId, tenantId, empresaId, deletedAt: null },
    select: { bancoSigla: true, agencia: true, numero: true, contaContabilId: true },
  });
  // Como no original (`db.get`), a conta vinculada é lida mesmo se estiver apagada.
  const conta = agencia?.contaContabilId
    ? await prisma.corePlanoConta.findFirst({
        where: { id: agencia.contaContabilId, tenantId, empresaId },
        select: { contaNumero: true, codigo: true, descricao: true },
      })
    : null;

  const { periodoInicio, periodoFim } = razao;
  const lidas =
    agencia && periodoInicio !== null && periodoFim !== null
      ? await prisma.coreTransacao.findMany({
          where: {
            tenantId, empresaId, agenciaId, deletedAt: null,
            data: { gte: dataDoDia(periodoInicio), lte: dataDoDia(periodoFim) },
          },
          select: { id: true, data: true, ordem: true, valor: true, dc: true, historico: true },
        })
      : [];
  const transacoes = lidas
    .map((t): TransacaoParaConciliar => ({
      id: t.id,
      data: dia(t.data),
      ordem: t.ordem,
      // `Decimal(15,2)` volta do Prisma sem os zeros à direita ("1200"); o do PostgreSQL vinha com a
      // escala da coluna ("1200.00"), e é ela que o relatório mostra.
      valor: reescala(decDoBanco(t.valor), -2),
      dc: t.dc,
      historico: t.historico,
    }))
    .sort(ordemDoExtrato);

  return relatorioDaConciliacao({
    empresaCnpj: empresa.cnpj,
    agencia: agencia && {
      bancoSigla: agencia.bancoSigla,
      agencia: agencia.agencia,
      numero: agencia.numero,
      temContaContabil: !!agencia.contaContabilId,
    },
    contaContabil: conta,
    razao,
    sispag,
    transacoes,
  });
}
