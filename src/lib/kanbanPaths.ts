// Caminho do board de uma Lista. Existe como função, e não como template
// espalhado por ~50 callsites, porque já houve rota dedicada por setor: o BPO
// morava em /bpo-financeiro/{id} e o resto em /kanban/{id}.
//
// Essa rota dedicada foi removida em 2026-08-05 — ela só reexibia os mesmos
// Espaços de /setor/bpo, com o nome antigo "BPO Financeiro" pendurado nela.
// Todo board volta a ser /kanban/{id}. A função fica: se um setor voltar a
// precisar de rota própria, é aqui que a exceção entra, sem tocar nos callsites.
//
// Extraída de kanban/actions.ts porque um arquivo "use server" só pode exportar
// funções assíncronas (server actions) — este helper é síncrono e também é
// consumido por Server Components (KanbanItemDetail, /tarefas).
export function boardPath(pipeline: { id: string }): string {
  return `/kanban/${pipeline.id}`;
}
