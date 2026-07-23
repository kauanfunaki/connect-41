// "Recentes" no picker de vincular tarefa — últimos itens vinculados pelo
// usuário, guardados no navegador (mesmo padrão de connect41:cadastros:lastTab
// em cadastrosNav.ts). Sem schema novo; não é compartilhado entre dispositivos.
const STORAGE_KEY = "connect41:kanban:recentLinks";
const MAX_RECENT = 8;

export function getRecentLinkedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentLinkedId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getRecentLinkedIds().filter((existing) => existing !== id);
    const next = [id, ...current].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage indisponível (modo privado etc.) — não é crítico, ignora.
  }
}
