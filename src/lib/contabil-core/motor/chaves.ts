// As colunas de unicidade das tabelas `core_*` (09/11/2026).
//
// O Contábil Core usa índices únicos PARCIAIS do PostgreSQL ("único entre as linhas vivas"), que o
// MySQL não tem. Cada um vira uma coluna calculada aqui, com índice único: a coluna guarda a chave
// enquanto a linha vale e fica nula quando a linha sai (no MySQL, nulos não colidem num índice único).
//
// Duas regras que não podem ser quebradas:
// - toda gravação dessas tabelas calcula as colunas por estas funções (gravar por fora é erro de
//   revisão, e é isso que os testes de `chaves.test.ts` protegem);
// - chave com texto livre vira SHA-256. A collation do Connect (utf8mb4_unicode_ci) ignora acento e
//   maiúscula, então "AÇÃO" e "acao" colidiriam no MySQL e não no PostgreSQL. Com o hash, a igualdade
//   é a mesma do original: byte a byte.

import { createHash } from "node:crypto";
import { strip } from "./unicodePy";

const SEP = "\u0001";

function sha256(...partes: string[]): string {
  return createHash("sha256").update(partes.join(SEP), "utf8").digest("hex");
}

type Vida = { readonly deletedAt: Date | null };

/** `historico_normalizado` da regra: `strip().lower()`, só para unicidade (o NEO casa por outra forma). */
export function historicoNormalizado(historico: string): string {
  return strip(historico).toLowerCase();
}

/** `uq_transacao_empresa_hash_ativo`: (empresa, hash) entre as transações vivas. */
export function hashAtivo(t: Vida & { readonly hashDedup: string }): string | null {
  return t.deletedAt ? null : t.hashDedup;
}

/** `uq_plano_empresa_codigo_ativo`: (empresa, código) entre as contas vivas. */
export function codigoAtivo(c: Vida & { readonly codigo: string }): string | null {
  return c.deletedAt ? null : sha256(c.codigo);
}

/**
 * `uq_regra_empresa_agencia_historico_normalizado_ativa` e o irmão `…_global`: (empresa, agência,
 * histórico normalizado) entre as regras ativas e vivas, com a regra global (sem agência) como um
 * escopo próprio. No PostgreSQL eram dois índices porque dois NULL são distintos; aqui o "*" faz as
 * duas coisas com um só.
 */
export function regraChaveAtiva(
  r: Vida & { readonly ativa: boolean; readonly agenciaId: string | null; readonly historicoNormalizado: string },
): string | null {
  if (!r.ativa || r.deletedAt) return null;
  return sha256(r.agenciaId ?? "*", r.historicoNormalizado);
}

/** `uq_contraparte_empresa_documento_tipo_ativa`: (empresa, documento, tipo) entre as ativas e vivas. */
export function contraparteChaveAtiva(
  c: Vida & { readonly ativa: boolean; readonly documento: string; readonly tipo: string },
): string | null {
  if (!c.ativa || c.deletedAt) return null;
  return sha256(c.documento, c.tipo);
}

/** `uq_agencia_empresa_banco_agencia_numero` (único total, não parcial), comparado byte a byte. */
export function agenciaChave(a: { readonly bancoSigla: string; readonly agencia: string; readonly numero: string }): string {
  return sha256(a.bancoSigla, a.agencia, a.numero);
}

type Perna = Vida & {
  readonly transacaoId: string | null;
  readonly lancamentoId: string;
  readonly dc: "D" | "C";
  readonly ordemComposicao: number | null;
};

/** `uq_registro_transacao_lancamento_dc_ativo`: uma perna D e uma C por lançamento vivo da transação. */
export function registroChaveAtiva(p: Perna): string | null {
  if (p.transacaoId === null || p.deletedAt) return null;
  return `${p.lancamentoId}:${p.dc}`;
}

/**
 * `uq_registro_transacao_dc_padrao_ativo`: o motor automático cria no máximo um par por transação.
 * Só a composição manual (com `ordemComposicao`) pode ter vários pares vivos.
 */
export function registroChavePadraoAtiva(p: Perna): string | null {
  if (p.transacaoId === null || p.deletedAt || p.ordemComposicao !== null) return null;
  return p.dc;
}

/** `uq_neo_sem_regra_transacao`: no máximo uma decisão `sem_regra` aberta por transação. */
export function decisaoSemRegra(d: { readonly resultado: string; readonly transacaoId: string }): string | null {
  return d.resultado === "sem_regra" ? d.transacaoId : null;
}
