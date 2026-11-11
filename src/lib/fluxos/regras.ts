// Quem faz o quê no Repositório de fluxos (10/11/2026, pedido do Kauan). Puro.
//
// As mesmas regras do Repositório de manuais, o vizinho do Apoio:
// - ver o repositório de um setor: quem pode agir no setor (é o que
//   `setorDaTelaDoApoio` usa para escolher o setor da tela) — o Somente
//   leitura não vê nada, como nos manuais;
// - criar pasta e fluxo, salvar versão e anexar: quem pode agir no setor;
// - excluir pasta, fluxo e anexo: só o Administrador ou o Super Admin
//   (`podeExcluir`), e no setor que ele gerencia.

import { canActOnSector, canManageSector, podeExcluir } from "@/lib/auth/papeis";
import type { AuthContext } from "@/lib/auth/context";

export const MODULO_FLUXOS = "bpo_fluxos";

type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

export const podeVerOsFluxos = (ctx: Quem, setor: string) => canActOnSector(ctx, setor);
export const podeEditarOsFluxos = (ctx: Quem, setor: string) => canActOnSector(ctx, setor);
export const podeExcluirDosFluxos = (ctx: Quem, setor: string) => podeExcluir(ctx) && canManageSector(ctx, setor);

/** "AAAA-MM-DD" de uma coluna `@db.Date` (o Prisma devolve meia-noite UTC). */
export const dataDoBanco = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** A data do formulário ("AAAA-MM-DD") para a coluna `@db.Date`; vazia ou inválida vira nula. */
export function dataParaOBanco(valor: string | null | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor ? null : d;
}
