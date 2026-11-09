import "server-only";

// Leituras das telas do Contábil Core (Fase 2, 09/11/2026): extrato e registros (o razão gerado).
// Ordem do extrato como a do original (`extrato/ordenacao.py`): dia, lote (o arquivo que chegou
// primeiro), posição da linha no arquivo e id — a tela e o arquivo exportado saem na mesma ordem.

import { getPrisma } from "@/lib/prisma";
import { empresaDoTenant, limitesDoMes } from "./base";

export const POR_PAGINA = 100;

export type FiltroDoExtrato = { agenciaId?: string | null; mes?: string | null; status?: string | null; dc?: string | null; busca?: string | null; pagina?: number };

export async function listarExtrato(tenantId: string, empresaId: string, f: FiltroDoExtrato) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return { itens: [], total: 0 };
  const periodo = f.mes ? limitesDoMes(f.mes) : null;
  const where = {
    tenantId, empresaId, deletedAt: null,
    ...(f.agenciaId ? { agenciaId: f.agenciaId } : {}),
    ...(periodo ? { data: { gte: periodo.inicio, lte: periodo.fim } } : {}),
    ...(f.status && ["pendente", "processada", "erro"].includes(f.status) ? { status: f.status } : {}),
    ...(f.dc === "D" || f.dc === "C" ? { dc: f.dc } : {}),
    ...(f.busca?.trim() ? { historico: { contains: f.busca.trim() } } : {}),
  };
  const prisma = getPrisma();
  const pagina = Math.max(1, Math.floor(f.pagina ?? 1));
  const [total, itens] = await Promise.all([
    prisma.coreTransacao.count({ where }),
    prisma.coreTransacao.findMany({
      where,
      select: {
        id: true, data: true, historico: true, dc: true, valor: true, saldoApos: true, status: true, autoRecusadoEm: true,
        agencia: { select: { bancoSigla: true, agencia: true, numero: true, digito: true } },
        importacao: { select: { createdAt: true } },
      },
      // Transação sem lote vem primeiro no dia (o `nullsfirst` do original): no MySQL o nulo já vem antes em ordem crescente.
      orderBy: [{ data: "asc" }, { importacao: { createdAt: "asc" } }, { ordem: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);
  return { itens, total };
}

export async function listarRegistros(tenantId: string, empresaId: string, f: { mes?: string | null; agenciaId?: string | null; pagina?: number }) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return { itens: [], total: 0 };
  const periodo = f.mes ? limitesDoMes(f.mes) : null;
  const where = {
    tenantId, empresaId, deletedAt: null,
    ...(f.agenciaId ? { agenciaId: f.agenciaId } : {}),
    ...(periodo ? { dataLancamento: { gte: periodo.inicio, lte: new Date(periodo.fim.getTime() + 86_399_999) } } : {}),
  };
  const prisma = getPrisma();
  const pagina = Math.max(1, Math.floor(f.pagina ?? 1));
  const [total, itens] = await Promise.all([
    prisma.coreRegistro.count({ where }),
    prisma.coreRegistro.findMany({
      where,
      select: {
        id: true, lancamentoId: true, transacaoId: true, dataLancamento: true, dc: true, valor: true, historico: true, historicoExtrato: true, tipoRegra: true,
        conta: { select: { codigo: true, descricao: true, contaNumero: true } },
      },
      orderBy: [{ dataLancamento: "asc" }, { lancamentoId: "asc" }, { dc: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);
  return { itens, total };
}
