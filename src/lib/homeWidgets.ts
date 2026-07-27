// Catálogo dos blocos da Home e leitura/escrita da personalização por usuário
// (UserPreference.homeWidgets). A Home é server component; o que o usuário
// escolhe aqui decide o que a página monta, então a lista precisa ser
// compartilhada entre servidor (page.tsx) e client (modal de personalização).

export type HomeWidgetKey =
  | "indicadores"
  | "proxima-reuniao"
  | "meu-dia"
  | "transferencias"
  | "workspace"
  | "agenda"
  | "atividade"
  | "setores";

// Onde o bloco mora no layout. "top" ocupa a largura toda acima das colunas;
// "main" é a coluna larga da esquerda; "side" é a coluna estreita da direita.
// A ordem escolhida pelo usuário só reordena dentro da própria faixa — mover
// "Agenda" pra antes de "Meu dia" não muda de coluna, e isso é proposital: o
// layout de duas colunas é do Design System, não uma preferência.
export type HomeWidgetSlot = "top" | "main" | "side";

export type HomeWidgetDef = {
  key: HomeWidgetKey;
  label: string;
  description: string;
  slot: HomeWidgetSlot;
  /** Bloco só existe pra quem tem visão de workspace (admin/coordenador). */
  restricted?: boolean;
};

export const HOME_WIDGETS: HomeWidgetDef[] = [
  {
    key: "indicadores",
    label: "Indicadores",
    description: "Empresas ativas, vencidos/hoje, transferências e pessoas.",
    slot: "top",
  },
  {
    key: "proxima-reuniao",
    label: "Próxima reunião",
    description: "Faixa com a próxima reunião do dia e o link de entrada.",
    slot: "top",
  },
  {
    key: "meu-dia",
    label: "Meu dia",
    description: "Tarefas atribuídas a você e itens com prazo.",
    slot: "main",
  },
  {
    key: "transferencias",
    label: "Transferências a revisar",
    description: "Transferências aguardando o seu setor.",
    slot: "main",
  },
  {
    key: "workspace",
    label: "Visão do workspace",
    description: "Cards por estágio e movimentações dos últimos 14 dias.",
    slot: "main",
    restricted: true,
  },
  {
    key: "agenda",
    label: "Agenda",
    description: "Suas próximas reuniões.",
    slot: "side",
  },
  {
    key: "atividade",
    label: "Atividade",
    description: "O que o time mexeu recentemente nos seus kanbans.",
    slot: "side",
  },
  {
    key: "setores",
    label: "Seus setores",
    description: "Volume de trabalho aberto e atrasado por setor.",
    slot: "side",
  },
];

const KNOWN_KEYS = new Set<string>(HOME_WIDGETS.map((w) => w.key));

// Padrão = tudo visível, na ordem do catálogo. Quem nunca personalizou vê a
// Home exatamente como era antes desta tela existir.
export const DEFAULT_HOME_WIDGETS: HomeWidgetKey[] = HOME_WIDGETS.map((w) => w.key);

// Nunca confia no conteúdo da coluna: JSON quebrado, chave de widget que já
// não existe ou duplicada caem fora em vez de derrubar a Home.
export function parseHomeWidgets(raw: string | null | undefined): HomeWidgetKey[] {
  if (!raw) return DEFAULT_HOME_WIDGETS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_HOME_WIDGETS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_HOME_WIDGETS;

  const seen = new Set<string>();
  const keys: HomeWidgetKey[] = [];
  for (const value of parsed) {
    if (typeof value !== "string" || !KNOWN_KEYS.has(value) || seen.has(value)) continue;
    seen.add(value);
    keys.push(value as HomeWidgetKey);
  }
  return keys;
}

export function serializeHomeWidgets(keys: HomeWidgetKey[]): string {
  const seen = new Set<string>();
  const clean: HomeWidgetKey[] = [];
  for (const key of keys) {
    if (!KNOWN_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    clean.push(key);
  }
  return JSON.stringify(clean);
}

// Ordena os widgets de uma faixa conforme a escolha do usuário, descartando os
// ocultos. Widget restrito some pra quem não tem permissão mesmo que esteja
// salvo como visível (a preferência não é um canal de autorização).
export function visibleWidgets(
  slot: HomeWidgetSlot,
  selected: HomeWidgetKey[],
  opts: { showRestricted: boolean }
): HomeWidgetKey[] {
  return selected.filter((key) => {
    const def = HOME_WIDGETS.find((w) => w.key === key);
    if (!def || def.slot !== slot) return false;
    return !def.restricted || opts.showRestricted;
  });
}
