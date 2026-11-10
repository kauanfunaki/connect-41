import "server-only";

// Importação do plano de contas por planilha (Fase 3b, 10/11/2026): porte de `importar_plano_contas`
// (`src/api/v1/plano_contas.py`) e de `PlanoContaService.importar_lote` do Contábil Core original.
//
// A leitura é `cadastro/planilhaDoPlano.ts` e a decisão é `cadastro/loteDoPlano.ts`; aqui ficam só o
// banco e o isolamento: tudo filtra por `tenantId` e empresa, e a empresa de outro escritório some com
// a mesma resposta de "não existe". A gravação é uma transação só: as contas novas recebem o id antes
// de gravar, então o pai já vai junto (as novas saem em ordem de profundidade, pais primeiro).
//
// Não registra auditoria: devolve os números e o que mudou para a ação da tela chamar `logAudit`.

import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { codigoAtivo } from "../motor/chaves";
import { ErroDoLote, planejarLote, type ContaDoPlano, type ErroDeLinha, type MudancaDeConta } from "../cadastro/loteDoPlano";
import { ErroPlanilhaDoPlano, lerPlanilhaDoPlano, type LinhaDoPlano } from "../cadastro/planilhaDoPlano";
import { ehDuplicado, empresaDoTenant, falha, NAO_ENCONTRADA, ok, type Resultado } from "./base";

/** O `ImportacaoPlanoResult` do original, mais o que mudou (para a auditoria da tela). */
export type ResultadoImportacaoPlano = {
  importadas: number;
  atualizadas: number;
  duplicadas: number;
  erros: ErroDeLinha[];
  mudancas: {
    criadas: { id: string; codigo: string }[];
    atualizadas: MudancaDeConta[];
  };
};

/** `conta_numero` é `Int` no banco (32 bits): fora disso a gravação da conta falharia. */
const NUMERO_MINIMO = -2_147_483_648;
const NUMERO_MAXIMO = 2_147_483_647;
const numeroForaDoLimite = (n: number | null) => n !== null && (n < NUMERO_MINIMO || n > NUMERO_MAXIMO);
const MENSAGEM_NUMERO = `Número da conta fora do limite aceito (${NUMERO_MINIMO} a ${NUMERO_MAXIMO}).`;

const LOTE_DE_GRAVACAO = 500;

/** Lê a planilha e importa o plano da empresa. */
export async function importarPlano(
  tenantId: string,
  empresaId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
): Promise<Resultado<ResultadoImportacaoPlano>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  let linhas: LinhaDoPlano[];
  try {
    linhas = lerPlanilhaDoPlano(bytes, nomeArquivo);
  } catch (e) {
    if (e instanceof ErroPlanilhaDoPlano) return falha(e.message);
    throw e;
  }
  return importarLinhas(tenantId, empresaId, linhas);
}

/** `importar_lote` sobre as linhas lidas, numa transação. */
async function importarLinhas(
  tenantId: string,
  empresaId: string,
  linhas: readonly LinhaDoPlano[],
): Promise<Resultado<ResultadoImportacaoPlano>> {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const onde = { tenantId, empresaId };
        const [faixas, existentes, maximo, comLancamento] = await Promise.all([
          tx.corePlanoFaixa.findMany({ where: { ...onde, deletedAt: null }, select: { tipo: true, codigoDe: true, codigoAte: true } }),
          tx.corePlanoConta.findMany({
            where: { ...onde, deletedAt: null },
            select: { id: true, contaNumero: true, codigo: true, descricao: true, tipo: true, tipoSa: true },
          }),
          // Como no original, o maior número conta também as contas excluídas.
          tx.corePlanoConta.aggregate({ where: onde, _max: { contaNumero: true } }),
          // O original conta todo lançamento da conta, inclusive os excluídos.
          tx.coreRegistro.groupBy({ by: ["contaId"], where: onde }),
        ]);

        const plano = planejarLote({
          linhas,
          faixas,
          existentes,
          movimentadas: new Set(comLancamento.map((r) => r.contaId)),
          proximoNumero: (maximo._max.contaNumero ?? 0) + 1,
          falhaAoCriar: (c) => (numeroForaDoLimite(c.contaNumero) ? MENSAGEM_NUMERO : null),
        });
        // No original, o número grande numa conta existente derrubava a importação inteira (erro 500).
        const invalida = plano.alteradas.find((a) => numeroForaDoLimite(a.depois.contaNumero));
        if (invalida) throw new ErroDoLote(`Conta ${invalida.codigo}: ${MENSAGEM_NUMERO}`);

        for (const a of plano.alteradas) {
          const mudou: Partial<ContaDoPlano> = {};
          if (a.depois.contaNumero !== a.antes.contaNumero) mudou.contaNumero = a.depois.contaNumero;
          if (a.depois.descricao !== a.antes.descricao) mudou.descricao = a.depois.descricao;
          if (a.depois.tipo !== a.antes.tipo) mudou.tipo = a.depois.tipo;
          if (a.depois.tipoSa !== a.antes.tipoSa) mudou.tipoSa = a.depois.tipoSa;
          await tx.corePlanoConta.updateMany({ where: { id: a.id, ...onde, deletedAt: null }, data: mudou });
        }

        const ids = new Map<string, string>(existentes.map((c) => [c.codigo, c.id]));
        for (const n of plano.novas) ids.set(n.codigo, randomUUID());
        const registros = plano.novas.map((n) => ({
          id: ids.get(n.codigo)!,
          tenantId,
          empresaId,
          contaNumero: n.contaNumero,
          codigo: n.codigo,
          descricao: n.descricao,
          tipo: n.tipo,
          tipoSa: n.tipoSa,
          paiId: n.paiCodigo === null ? null : ids.get(n.paiCodigo)!,
          codigoAtivo: codigoAtivo({ codigo: n.codigo, deletedAt: null }),
        }));
        for (let i = 0; i < registros.length; i += LOTE_DE_GRAVACAO) {
          await tx.corePlanoConta.createMany({ data: registros.slice(i, i + LOTE_DE_GRAVACAO) });
        }

        return ok<ResultadoImportacaoPlano>({
          importadas: plano.importadas,
          atualizadas: plano.atualizadas,
          duplicadas: plano.duplicadas,
          erros: plano.erros,
          mudancas: {
            criadas: registros.map((r) => ({ id: r.id, codigo: r.codigo })),
            atualizadas: plano.atualizacoes,
          },
        });
      },
      { timeout: 120_000 },
    );
  } catch (e) {
    if (e instanceof ErroDoLote) return falha(e.message);
    // A unicidade de (empresa, código) é do banco: outra gravação criou o mesmo código no meio.
    if (ehDuplicado(e)) return falha("Outra gravação mudou o plano de contas durante a importação. Importe de novo.");
    throw e;
  }
}
