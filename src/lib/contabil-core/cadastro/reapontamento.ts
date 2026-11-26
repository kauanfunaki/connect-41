// Reapontamento da conta bancária sintética (Bloco D, Fase D0, 26/11/2026): porte de `ReapontamentoService`
// (`src/domain/agencias/service.py:228-343` do original), sem banco. O servidor (`servidor/cadastros.ts`)
// entrega as leituras e gravações por `BancoDoReapontamento`, numa transação; o teste-gabarito
// (`reapontamento.test.ts`) entrega o banco montado com a entrada gravada do original. O laço é um só.
//
// Por que existe: quando a conta bancária (agência) não tem conta contábil, o NEO cria uma conta
// `1.1.B.<16 primeiros hex do id da agência>` SEM `contaNumero` e a vincula à agência (`contaBancaria`, em
// `servidor/neo.ts`, o `_obter_conta_bancaria` do original). A exportação do Domínio usa o `contaNumero` (o
// "abreviado") e cai no código quando ele falta: o lado bancário de todo lançamento sai como
// `1.1.B.9a8b7c6d5e4f4a3b`, que o Domínio não importa. Vincular a conta certa na agência conserta os
// lançamentos FUTUROS; o que já está gravado continua na sintética, e é isso que esta rotina move.
//
// Ela REESCREVE registros contábeis já lançados, então não roda sozinha: é uma ação explícita, devolve o que
// moveu e não desativa a sintética enquanto algo que ela não move ainda apontar para lá (desativar às cegas
// trocaria um problema visível na exportação por uma referência órfã).
//
// Divergências deliberadas (contadas no teste, ver docs/CONTABIL-CORE.md, Fase D0):
// - a agência ainda vinculada à PRÓPRIA sintética (o estado em que o NEO a deixa) é pulada: não há conta
//   para onde mover. O original "movia" as partidas para a mesma conta e desativava a sintética que a agência
//   ainda usava;
// - as referências restantes incluem, além das três do original (regras, contrapartes e gastos de cartão),
//   outra conta bancária viva vinculada à sintética, conta viva que tem a sintética como pai e componente de
//   distribuição de fatura salvo nela: o original não as contava, e o Connect recusa excluir conta assim;
// - a sintética é achada pelo código byte a byte (`codigoAtivo`, o SHA-256 do código), porque a collation
//   do MySQL não diferencia maiúscula ("1.1.b.ABC…" não é a sintética);
// - o relatório sai na ordem das contas bancárias (banco, agência, número e id); o original não ordenava.

import { codigoContaSintetica } from "../motor/neo";

/** "SICOOB 1234 98765 4", como a `descricao` da `AgenciaBancaria` do original (o dígito vazio fica de fora). */
export function descricaoDaAgencia(a: { bancoSigla: string; agencia: string; numero: string; digito: string | null }): string {
  return [a.bancoSigla, a.agencia, a.numero, a.digito].filter(Boolean).join(" ");
}

/** A conta bancária viva desta empresa com conta contábil vinculada. */
export type AgenciaVinculada = { id: string; bancoSigla: string; agencia: string; numero: string; digito: string | null; contaContabilId: string };

/** O que ainda aponta para a sintética depois da mudança, na ordem em que aparece no relatório. */
export const REFERENCIAS = ["regras", "contrapartes", "lancamentosCartao", "agencias", "contasFilhas", "distribuicoesFatura"] as const;
export type Referencia = (typeof REFERENCIAS)[number];
export type ReferenciasRestantes = Partial<Record<Referencia, number>>;

/** Como a tela diz cada referência restante. */
export const ROTULO_DA_REFERENCIA: Record<Referencia, string> = {
  regras: "regra(s) do NEO",
  contrapartes: "contraparte(s)",
  lancamentosCartao: "gasto(s) de cartão",
  agencias: "outra conta bancária",
  contasFilhas: "conta(s) filha(s) no plano",
  distribuicoesFatura: "distribuição(ões) de fatura de cartão",
};

/** Uma linha do relatório: os campos de `reapontar` do original, em camelCase. */
export type ItemDoReapontamento = {
  agencia: string;
  contaSintetica: string;
  registrosMovidos: number;
  decisoesMovidas: number;
  sinteticaDesativada: boolean;
  referenciasRestantes: ReferenciasRestantes;
};

/** Os ids de cada linha, para a auditoria (a tela não precisa deles). */
export type PassoDoReapontamento = { agenciaId: string; de: string; para: string };

/**
 * O que a rotina lê e grava. No servidor, cada método é uma consulta Prisma na mesma transação, filtrada pelo
 * tenant e pela empresa; no teste, o banco montado com a entrada.
 */
export interface BancoDoReapontamento {
  /** As contas bancárias vivas da empresa com conta contábil vinculada (também as inativas), em ordem. */
  agenciasVinculadas(): Promise<AgenciaVinculada[]>;
  /** A conta viva desta empresa com exatamente este código. */
  sinteticaViva(codigo: string): Promise<{ id: string; codigo: string } | null>;
  /** `_mover`: as partidas (todas, também as canceladas) e as decisões do NEO (conta e conta da contraparte). */
  mover(de: string, para: string): Promise<{ registros: number; decisoes: number }>;
  /** Quantas linhas de cada referência apontam para a conta (zeros incluídos). */
  contarReferencias(contaId: string): Promise<Record<Referencia, number>>;
  /** A exclusão lógica da conta, como o Connect faz (`deletedAt` e `codigoAtivo` nulo). */
  desativar(contaId: string): Promise<void>;
}

/** Só as referências com alguma linha, na ordem de `REFERENCIAS` (o dicionário `restantes` do original). */
export function restantes(contagem: Record<Referencia, number>): ReferenciasRestantes {
  const r: ReferenciasRestantes = {};
  for (const k of REFERENCIAS) if (contagem[k]) r[k] = contagem[k];
  return r;
}

/** `ReapontamentoService.reapontar`: uma linha por conta bancária que tinha a sintética viva. */
export async function reapontar(banco: BancoDoReapontamento): Promise<{ relatorio: ItemDoReapontamento[]; passos: PassoDoReapontamento[] }> {
  const relatorio: ItemDoReapontamento[] = [];
  const passos: PassoDoReapontamento[] = [];
  for (const agencia of await banco.agenciasVinculadas()) {
    const sintetica = await banco.sinteticaViva(codigoContaSintetica(agencia.id));
    if (!sintetica) continue;
    // A agência ainda vinculada à própria sintética não foi corrigida: não há conta para onde mover.
    if (sintetica.id === agencia.contaContabilId) continue;
    const movidos = await banco.mover(sintetica.id, agencia.contaContabilId);
    const pendentes = restantes(await banco.contarReferencias(sintetica.id));
    const desativar = Object.keys(pendentes).length === 0;
    if (desativar) await banco.desativar(sintetica.id);
    relatorio.push({
      agencia: descricaoDaAgencia(agencia),
      contaSintetica: sintetica.codigo,
      registrosMovidos: movidos.registros,
      decisoesMovidas: movidos.decisoes,
      sinteticaDesativada: desativar,
      referenciasRestantes: pendentes,
    });
    passos.push({ agenciaId: agencia.id, de: sintetica.id, para: agencia.contaContabilId });
  }
  return { relatorio, passos };
}
