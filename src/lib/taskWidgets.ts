// Catálogo dos blocos da tela /tarefas e leitura/escrita da configuração por
// setor (SectorTaskView.widgets).
//
// Diferente de homeWidgets, que é preferência pessoal: aqui quem decide é o
// SUPER_ADMIN, e a unidade de configuração é o SETOR. Hoje os três blocos
// servem todo mundo, mas eles não são universais — conforme cada setor ganha
// módulos próprios, "transferências" e "cards de kanban" deixam de descrever o
// trabalho de parte deles. Módulo novo que gere obrigação entra aqui como
// chave nova e nasce visível (ver DEFAULT_TASK_WIDGETS).

export type TaskWidgetKey = "transferencias" | "cards-kanban" | "reunioes";

// Onde o bloco mora no layout de duas colunas. Assim como na Home, a coluna é
// do Design System e não é configurável — o SUPER_ADMIN decide o que aparece,
// não onde.
export type TaskWidgetSlot = "main" | "side";

export type TaskWidgetDef = {
  key: TaskWidgetKey;
  label: string;
  description: string;
  slot: TaskWidgetSlot;
};

export const TASK_WIDGETS: TaskWidgetDef[] = [
  {
    key: "transferencias",
    label: "Transferências em aberto",
    description: "Instruções de transferência do setor ou designadas ao usuário.",
    slot: "main",
  },
  {
    key: "cards-kanban",
    label: "Meus cards de kanban",
    description: "Tarefas de listas/kanbans atribuídas ao usuário.",
    slot: "main",
  },
  {
    key: "reunioes",
    label: "Próximas reuniões",
    description: "As próximas reuniões em que o usuário é organizador ou participante.",
    slot: "side",
  },
];

const KNOWN_KEYS = new Set<string>(TASK_WIDGETS.map((w) => w.key));

// Padrão = tudo visível. Setor sem linha em SectorTaskView vê a tela como ela
// era antes desta configuração existir.
export const DEFAULT_TASK_WIDGETS: TaskWidgetKey[] = TASK_WIDGETS.map((w) => w.key);

// Nunca confia no conteúdo da coluna: JSON quebrado, chave que já não existe
// ou duplicada caem fora em vez de derrubar a tela.
export function parseTaskWidgets(raw: string | null | undefined): TaskWidgetKey[] {
  if (!raw) return DEFAULT_TASK_WIDGETS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_TASK_WIDGETS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_TASK_WIDGETS;

  const seen = new Set<string>();
  const keys: TaskWidgetKey[] = [];
  for (const value of parsed) {
    if (typeof value !== "string" || !KNOWN_KEYS.has(value) || seen.has(value)) continue;
    seen.add(value);
    keys.push(value as TaskWidgetKey);
  }
  return keys;
}

export function serializeTaskWidgets(keys: TaskWidgetKey[]): string {
  const seen = new Set<string>();
  const clean: TaskWidgetKey[] = [];
  for (const key of keys) {
    if (!KNOWN_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    clean.push(key);
  }
  return JSON.stringify(clean);
}

/**
 * O que um usuário vê em /tarefas, dada a configuração dos setores dele.
 *
 * União, não interseção: quem está em Fiscal (que usa transferências) e em BPO
 * (que usa listas) precisa das duas coisas na tela — a interseção esconderia
 * trabalho real de alguém.
 *
 * `sectorCodes` vazio significa visão global (ADMIN/SUPER_ADMIN/READONLY, que
 * não são "de um setor"): esses veem tudo, porque a tela deles é a soma do
 * workspace, não a de um setor específico.
 *
 * A ordem é sempre a do catálogo. Duas configurações de setor podem discordar
 * de ordem, e não existe desempate justo entre elas.
 */
export function visibleTaskWidgets(
  sectorCodes: string[],
  configBySector: Record<string, TaskWidgetKey[]>
): TaskWidgetKey[] {
  if (sectorCodes.length === 0) return DEFAULT_TASK_WIDGETS;

  const union = new Set<TaskWidgetKey>();
  for (const code of sectorCodes) {
    for (const key of configBySector[code] ?? DEFAULT_TASK_WIDGETS) union.add(key);
  }
  return TASK_WIDGETS.filter((w) => union.has(w.key)).map((w) => w.key);
}
