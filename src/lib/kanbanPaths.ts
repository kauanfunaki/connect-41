// Setores com módulo dedicado (rota própria, fora do /kanban genérico) usam
// essa base de path nos redirects/revalidate em vez de /kanban/{id} — mantém
// as server actions únicas mesmo com múltiplas telas de board no app.
// Extraído de kanban/actions.ts porque um arquivo "use server" só pode
// exportar funções assíncronas (server actions) — este helper é síncrono e
// também é consumido por Server Components (KanbanItemDetail, /tarefas).
const DEDICATED_SECTOR_ROUTES: Record<string, string> = {
  bpo: "/bpo-financeiro",
};

export function boardPath(pipeline: { id: string; sectorCode: string }): string {
  const base = DEDICATED_SECTOR_ROUTES[pipeline.sectorCode];
  return base ? `${base}/${pipeline.id}` : `/kanban/${pipeline.id}`;
}
