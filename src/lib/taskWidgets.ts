// Catálogo dos blocos da tela /tarefas (Meu dia) e leitura/escrita da
// configuração gravada (SectorTaskView.widgets e UserTaskView.widgets).
//
// Diferente de homeWidgets, que é preferência pessoal: aqui a unidade de
// configuração é o SETOR, e a pessoa pode ter a sua por cima (ver
// src/lib/meuDia/configuracao.ts). Os blocos não são universais — conforme
// cada setor ganha módulos próprios, "transferências" e "atividades dos
// Quadros" deixam de descrever o trabalho de parte deles. Módulo novo que gere
// obrigação entra aqui como chave nova.
//
// 10/11/2026 (pedido do Kauan): tudo o que o Meu dia monta virou interruptor —
// as origens das listas (processos, pendências e solicitações, além de
// transferências e atividades) e os blocos ao lado que antes não desligavam
// (Prazos da semana e No Societário, com você). E "Próximas reuniões" nasce
// desligado no setor que não usa reuniões (SectorAgendaView.usaReunioes).

export type TaskWidgetKey =
  | "transferencias"
  | "cards-kanban"
  | "reunioes"
  | "processos"
  | "pendencias"
  | "solicitacoes"
  | "prazos-semana"
  | "societario";

// Onde o bloco mora no layout de duas colunas. Assim como na Home, a coluna é
// do Design System e não é configurável — decide-se o que aparece, não onde.
export type TaskWidgetSlot = "main" | "side";

/** "origem": entra nas listas da esquerda; "bloco": um cartão da direita. */
export type TaskWidgetGrupo = "origem" | "bloco";

export type TaskWidgetDef = {
  key: TaskWidgetKey;
  label: string;
  description: string;
  slot: TaskWidgetSlot;
  grupo: TaskWidgetGrupo;
};

export const TASK_WIDGETS: TaskWidgetDef[] = [
  {
    key: "cards-kanban",
    label: "Atividades dos Quadros",
    description: "As atividades dos Quadros em que você responde.",
    slot: "main",
    grupo: "origem",
  },
  {
    key: "processos",
    label: "Processos",
    description: "Os processos do Societário em que você responde.",
    slot: "main",
    grupo: "origem",
  },
  {
    key: "pendencias",
    label: "Pendências com o cliente",
    description: "As pendências abertas com o cliente em que você responde.",
    slot: "main",
    grupo: "origem",
  },
  {
    key: "solicitacoes",
    label: "Solicitações",
    description: "Os pedidos dos clientes pelo portal em que você responde.",
    slot: "main",
    grupo: "origem",
  },
  {
    key: "transferencias",
    label: "Transferências",
    description: "As transferências em aberto do seu setor ou passadas para você.",
    slot: "main",
    grupo: "origem",
  },
  {
    key: "reunioes",
    label: "Próximas reuniões",
    description: "As próximas reuniões que você marcou ou para as quais foi chamado.",
    slot: "side",
    grupo: "bloco",
  },
  {
    key: "societario",
    label: "No Societário, com você",
    description: "Exigências, taxas e licenças dos processos em que você responde.",
    slot: "side",
    grupo: "bloco",
  },
  {
    key: "prazos-semana",
    label: "Prazos da semana",
    description: "Os vencimentos dos seus setores nos próximos 7 dias, das fontes ligadas na sua Agenda.",
    slot: "side",
    grupo: "bloco",
  },
];

const KNOWN_KEYS = new Set<string>(TASK_WIDGETS.map((w) => w.key));

/** Tudo visível: o setor sem linha que usa reuniões (e a visão global). */
export const DEFAULT_TASK_WIDGETS: TaskWidgetKey[] = TASK_WIDGETS.map((w) => w.key);

/**
 * As chaves que existiam até 10/11/2026 — eram as únicas que desligavam. A
 * configuração gravada naquele formato (uma lista) só fala delas: as que
 * vieram depois ficam no padrão, que é como a pessoa as via (não desligavam).
 */
export const LEGACY_TASK_WIDGETS: readonly TaskWidgetKey[] = ["transferencias", "cards-kanban", "reunioes"];

/** O padrão do código para um setor: tudo, menos "Próximas reuniões" no setor que não usa reuniões. */
export function padraoDoSetor(usaReunioes: boolean): TaskWidgetKey[] {
  return usaReunioes ? DEFAULT_TASK_WIDGETS : DEFAULT_TASK_WIDGETS.filter((k) => k !== "reunioes");
}

function limpar(lista: unknown): TaskWidgetKey[] {
  if (!Array.isArray(lista)) return [];
  const seen = new Set<string>();
  const keys: TaskWidgetKey[] = [];
  for (const value of lista) {
    if (typeof value !== "string" || !KNOWN_KEYS.has(value) || seen.has(value)) continue;
    seen.add(value);
    keys.push(value as TaskWidgetKey);
  }
  return keys;
}

/** A configuração gravada: as chaves visíveis e as que ela conhece (as que existiam quando foi gravada). */
export type BlocosGravados = { visiveis: TaskWidgetKey[]; conhecidas: TaskWidgetKey[] };

// Nunca confia no conteúdo da coluna: JSON quebrado ou de outro formato é
// "sem configuração" (null), chave que já não existe ou repetida cai fora.
export function lerBlocosGravados(raw: string | null | undefined): BlocosGravados | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { visiveis: limpar(parsed), conhecidas: [...LEGACY_TASK_WIDGETS] };
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { visiveis?: unknown }).visiveis)) {
    const o = parsed as { visiveis: unknown; conhecidas?: unknown };
    return { visiveis: limpar(o.visiveis), conhecidas: Array.isArray(o.conhecidas) ? limpar(o.conhecidas) : [...DEFAULT_TASK_WIDGETS] };
  }
  return null;
}

/**
 * O que a configuração gravada mostra, chave a chave: a chave que ela conhece
 * segue o que foi gravado; a que ela não conhece (bloco lançado depois), o
 * `padrao` de baixo — o do setor para a pessoa, o do código para o setor.
 */
export function parseTaskWidgets(raw: string | null | undefined, padrao: readonly TaskWidgetKey[] = DEFAULT_TASK_WIDGETS): TaskWidgetKey[] {
  const gravados = lerBlocosGravados(raw);
  return TASK_WIDGETS.filter((w) =>
    gravados && gravados.conhecidas.includes(w.key) ? gravados.visiveis.includes(w.key) : padrao.includes(w.key),
  ).map((w) => w.key);
}

/**
 * Grava as visíveis junto com todas as chaves de hoje: bloco que vier depois
 * entra no padrão para quem já configurou, em vez de sumir.
 */
export function serializeTaskWidgets(keys: TaskWidgetKey[]): string {
  return JSON.stringify({ visiveis: limpar(keys), conhecidas: DEFAULT_TASK_WIDGETS });
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
 * Setor sem configuração vê o `padraoDoSetorCode` dele (o do código, que
 * depende de o setor usar reuniões). A ordem é sempre a do catálogo: duas
 * configurações de setor podem discordar de ordem, e não existe desempate
 * justo entre elas.
 */
export function visibleTaskWidgets(
  sectorCodes: string[],
  configBySector: Record<string, TaskWidgetKey[]>,
  padraoDoSetorCode: (code: string) => readonly TaskWidgetKey[] = () => DEFAULT_TASK_WIDGETS,
): TaskWidgetKey[] {
  if (sectorCodes.length === 0) return DEFAULT_TASK_WIDGETS;

  const union = new Set<TaskWidgetKey>();
  for (const code of sectorCodes) {
    for (const key of configBySector[code] ?? padraoDoSetorCode(code)) union.add(key);
  }
  return TASK_WIDGETS.filter((w) => union.has(w.key)).map((w) => w.key);
}
