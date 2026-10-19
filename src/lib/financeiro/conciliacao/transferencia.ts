// Transferência entre contas da mesma empresa, feita na conciliação (19/10,
// retorno do BPO: "incluir Transferência entre Contas no ato da conciliação,
// para entradas e saídas das contas de mesma titularidade"). Funções puras.
//
// ─── O desenho ───────────────────────────────────────────────────────────────
//
// A linha do extrato de uma conta vira **um par** de lançamentos com o mesmo
// `transferId`: a ponta desta conta (saída no débito, entrada no crédito), já
// conciliada com a linha, e a ponta da outra conta, paga no mesmo dia. Se o
// extrato da outra conta já tem a linha que espelha esta (valor oposto, até 3
// dias de distância, uma só), ela é conciliada junto; senão a ponta fica paga
// e aparece como sugestão quando o extrato for importado — baixa no mesmo dia
// e valor exato é o casamento mais forte que a regra conhece.
//
// As duas pontas vão para a categoria de transferência, que a DRE deixa fora
// do resultado (grupo `transferencia`) — é o que a Omie faz com o par
// TRAP/TRAR. Desfazer uma ponta desfaz as duas: transferência pela metade
// deixaria dinheiro saindo de uma conta sem entrar em lugar nenhum.

import { chaveDaCategoria } from "@/lib/dre/calculo";
import { diasEntre } from "../periodo";

/** O nome da categoria do plano padrão da 41 — a de saída já existe com ele. */
export const NOME_DA_CATEGORIA_DE_TRANSFERENCIA = "Transferencia entre contas - mesma titularidade";
/** A contraparte das duas pontas, a mesma das transferências que vêm do Omie. */
export const NOME_DA_CONTRAPARTE_DE_TRANSFERENCIA = "Transferência entre contas";
/** Até quantos dias a linha da outra conta pode estar da desta — TED e DOC compensam no dia seguinte. */
export const DIAS_ATE_A_OUTRA_PONTA = 3;

/** A categoria é de transferência entre contas? Pelo nome, sem acento nem caixa. */
export function ehCategoriaDeTransferencia(nome: string): boolean {
  return chaveDaCategoria(nome).includes("transferencia entre contas");
}

/**
 * A categoria de transferência a usar, entre as que valem para a empresa. A da
 * própria empresa vence a do padrão (é a particularidade do cliente), e a ativa
 * vence a inativa. `null` quando não há nenhuma — quem chama cria no padrão.
 */
export function escolherCategoriaDeTransferencia<T extends { name: string; companyId: string | null; active: boolean }>(categorias: T[]): T | null {
  const doTipo = categorias.filter((c) => ehCategoriaDeTransferencia(c.name));
  doTipo.sort((a, b) => Number(b.active) - Number(a.active) || Number(b.companyId !== null) - Number(a.companyId !== null));
  return doTipo[0] ?? null;
}

/** A outra conta serve? Da mesma empresa, ativa, e não a própria. */
export function validarOutraConta(
  origem: { id: string; companyId: string },
  outra: { id: string; companyId: string; active: boolean } | null
): { ok: true } | { ok: false; erro: string } {
  if (!outra || outra.companyId !== origem.companyId) return { ok: false, erro: "Escolha uma conta desta empresa." };
  if (outra.id === origem.id) return { ok: false, erro: "A transferência é para outra conta, não para a mesma." };
  if (!outra.active) return { ok: false, erro: "Essa conta está inativa — reative em Banco e caixa antes." };
  return { ok: true };
}

/** "Transferência para Itaú 12287-0" na saída; "Transferência de Itaú 12287-0" na entrada. */
export function descricaoDaTransferencia(kind: "PAGAR" | "RECEBER", outraConta: string): string {
  return `Transferência ${kind === "PAGAR" ? "para" : "de"} ${outraConta}`.slice(0, 255);
}

/**
 * A linha do extrato da outra conta que espelha esta: valor oposto no centavo,
 * até `DIAS_ATE_A_OUTRA_PONTA` dias de distância, pendente — e **uma só**. Com
 * duas iguais (duas transferências do mesmo valor na semana), não escolhe: a
 * ponta fica paga e a pessoa concilia a certa.
 */
export function linhaDaOutraPonta<T extends { id: string; centavos: number; dataKey: string }>(
  pendentesDaOutraConta: T[],
  estaLinha: { centavos: number; dataKey: string }
): T | null {
  const espelho = pendentesDaOutraConta.filter(
    (l) => l.centavos === -estaLinha.centavos && Math.abs(diasEntre(estaLinha.dataKey, l.dataKey)) <= DIAS_ATE_A_OUTRA_PONTA
  );
  return espelho.length === 1 ? espelho[0]! : null;
}
