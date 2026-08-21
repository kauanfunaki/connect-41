import { isFullAccess, scopedSectors, type AuthContext } from "@/lib/auth/context";

// Filtro de setor de uma consulta, já considerando o SETOR ATIVO (subworkspace).
// Sem setor ativo o resultado é idêntico ao que era antes: tenant inteiro para
// full access, setores da pessoa para os demais.
//
// `__none__` é sentinela para "não pode ver nada" — sem ele, um `in: []` do
// Prisma devolveria zero linhas por acidente em vez de por decisão, e a
// diferença some no dia em que alguém "otimizar" o array vazio.
function sectorWhere(ctx: AuthContext) {
  const codes = scopedSectors(ctx);
  if (codes === null) return { tenantId: ctx.tenantId };
  if (codes.length === 0) return { tenantId: ctx.tenantId, sectorCode: "__none__" };
  return { tenantId: ctx.tenantId, sectorCode: { in: codes } };
}

// Conversas do Chatwoot são conhecimento geral do tenant, igual Empresas/Pessoas
// (RBAC opção A — ver docs/CHATWOOT_INTEGRATION_FEASIBILITY.md §16): qualquer
// usuário autenticado do tenant pode visualizar. Mensagens privadas ficam
// restritas separadamente (isFullAccess) na leitura de mensagens, não aqui.
export function scopedChatwootConversationWhere(ctx: AuthContext) {
  return { tenantId: ctx.tenantId };
}

// Empresas e Pessoas são conhecimento geral da empresa — qualquer usuário
// autenticado do tenant pode VISUALIZAR qualquer uma, independente de setor.
// O que é restrito por papel (não por setor) é CRIAR/EDITAR/EXCLUIR, já
// controlado separadamente por canWrite() nas actions e nas telas.
export async function scopedCompanyWhere(ctx: AuthContext) {
  return { tenantId: ctx.tenantId };
}

export async function scopedPersonWhere(ctx: AuthContext) {
  return { tenantId: ctx.tenantId };
}

export function scopedPipelineWhere(ctx: AuthContext) {
  return sectorWhere(ctx);
}

// Vaga é setor-scoped como Pipeline (mesmo campo sectorCode livre, sem FK).
export function scopedVagaWhere(ctx: AuthContext) {
  return sectorWhere(ctx);
}

// Space é setor-scoped como Pipeline/Vaga (mesmo campo sectorCode livre, sem FK).
export function scopedSpaceWhere(ctx: AuthContext) {
  return sectorWhere(ctx);
}

// AssessmentLink (Testes) é setor-scoped como Vaga/Space — campo sectorCode
// próprio, não derivado de Candidatura→Vaga, porque Person não é setor-scoped
// (atravessa DP e Recrutamento) e o teste pode ser gerado direto da ficha do
// candidato, sem candidatura.
export function scopedAssessmentLinkWhere(ctx: AuthContext) {
  return sectorWhere(ctx);
}

// Handoff NÃO acompanha o setor ativo — de propósito, e isto não é descuido.
//
// Transferência é setor↔setor por natureza: se ela sumisse ao trocar o setor
// ativo, o handoff que chega de outro setor ficaria invisível e a transferência
// morreria parada, sem ninguém receber erro. Escopo de handoff continua sendo
// só UserSector ∩ RBAC.
//
// Handoff: ADMIN/SUPER_ADMIN/READONLY (gerência geral) enxergam tudo; quem
// abriu a transferência (controladoria) sempre a enxerga; e membros de
// qualquer setor envolvido (origem ou destino, via handoff_sectors) também.
export function scopedHandoffWhere(ctx: AuthContext) {
  if (isFullAccess(ctx.role)) return { tenantId: ctx.tenantId };
  if (ctx.sectors.length === 0) return { tenantId: ctx.tenantId, requestedBy: ctx.userId };
  return {
    tenantId: ctx.tenantId,
    OR: [
      { fromSector: { in: ctx.sectors } },
      { sectors: { some: { sectorCode: { in: ctx.sectors } } } },
      { requestedBy: ctx.userId },
    ],
  };
}
