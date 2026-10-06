// Catálogo dos blocos da Home e leitura/escrita da personalização por usuário
// (UserPreference.homeWidgets). A Home é server component; o que o usuário
// escolhe aqui decide o que a página monta, então a lista precisa ser
// compartilhada entre servidor (page.tsx) e client (modal de personalização).

export type HomeWidgetKey =
  | "indicadores"
  | "proxima-reuniao"
  | "destaques"
  | "meu-dia"
  | "transferencias"
  | "workspace"
  | "agenda"
  | "atividade"
  | "setores"
  | "painel-tarefas"
  | "painel-contas"
  | "painel-semanas"
  | "painel-pendencias"
  | "painel-processos"
  | "painel-dp"
  | "painel-recrutamento"
  | "painel-certificados";

// Onde o bloco mora no layout. "top" ocupa a largura toda acima das colunas;
// "paineis" é a grade de gráficos logo abaixo (30/09, a leitura "Power BI"
// pedida pelo Kauan); "main" é a coluna larga da esquerda; "side" é a coluna
// estreita da direita.
// A ordem escolhida pelo usuário só reordena dentro da própria faixa — mover
// "Agenda" pra antes de "Meu dia" não muda de coluna, e isso é proposital: o
// layout de duas colunas é do Design System, não uma preferência.
export type HomeWidgetSlot = "top" | "paineis" | "main" | "side";

export type HomeWidgetDef = {
  key: HomeWidgetKey;
  label: string;
  description: string;
  slot: HomeWidgetSlot;
  /** Bloco só existe pra quem tem visão de workspace (admin/coordenador). */
  restricted?: boolean;
  /**
   * Painel de setor: só existe pra quem enxerga a tela de onde os números
   * saem (setor + módulo ativo). Quem decide é `acessoDosPaineis`.
   */
  doSetor?: boolean;
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
  // Por último no topo (06/10): fica colada nos painéis que ela resume — e é
  // onde um bloco novo entra para quem já personalizou, então todo mundo a vê
  // no mesmo lugar.
  {
    key: "destaques",
    label: "Destaques",
    description: "Os três números que mais pedem você agora, dos painéis da sua Home.",
    slot: "top",
  },
  {
    key: "painel-tarefas",
    label: "Tarefas por prazo",
    description: "Rosca com os prazos das tarefas abertas nos seus kanbans.",
    slot: "paineis",
  },
  {
    key: "painel-contas",
    label: "Contas a pagar e a receber",
    description: "BPO: vencidas, de hoje e adiante, com o valor de cada faixa.",
    slot: "paineis",
    doSetor: true,
  },
  {
    key: "painel-semanas",
    label: "A pagar nas próximas semanas",
    description: "BPO: quanto vence em cada uma das próximas seis semanas.",
    slot: "paineis",
    doSetor: true,
  },
  {
    key: "painel-pendencias",
    label: "Pendências e aprovações",
    description: "BPO: o que espera o cliente e o que espera aprovação.",
    slot: "paineis",
    doSetor: true,
  },
  {
    key: "painel-processos",
    label: "Processos do Societário",
    description: "Processos abertos por situação, com o prazo de cada um.",
    slot: "paineis",
    doSetor: true,
  },
  {
    key: "painel-dp",
    label: "Departamento Pessoal",
    description: "Férias por prazo e o que está em andamento no DP.",
    slot: "paineis",
    doSetor: true,
  },
  {
    key: "painel-recrutamento",
    label: "Funil do Recrutamento",
    description: "Candidaturas das vagas abertas, etapa por etapa.",
    slot: "paineis",
    doSetor: true,
  },
  {
    key: "painel-certificados",
    label: "Certificados digitais",
    description: "Vencidos, a renovar e vigentes.",
    slot: "paineis",
    doSetor: true,
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

/**
 * Os blocos que existiam quando a preferência era só a lista dos visíveis
 * (até 30/09). Numa preferência nesse formato, o que é daqui e não está na
 * lista foi ocultado pelo usuário; o que veio depois é novo e aparece.
 */
const CHAVES_DO_FORMATO_ANTIGO: HomeWidgetKey[] = [
  "indicadores",
  "proxima-reuniao",
  "meu-dia",
  "transferencias",
  "workspace",
  "agenda",
  "atividade",
  "setores",
];

function limpar(valores: unknown): HomeWidgetKey[] {
  if (!Array.isArray(valores)) return [];
  const seen = new Set<string>();
  const keys: HomeWidgetKey[] = [];
  for (const value of valores) {
    if (typeof value !== "string" || !KNOWN_KEYS.has(value) || seen.has(value)) continue;
    seen.add(value);
    keys.push(value as HomeWidgetKey);
  }
  return keys;
}

/**
 * Os blocos visíveis, na ordem escolhida.
 *
 * A preferência guarda os visíveis **e** os ocultos (`{ visiveis, ocultos }`).
 * Guardava só os visíveis, e aí um bloco lançado depois nascia oculto para
 * todo mundo que já tinha personalizado — os painéis de 30/09 teriam sumido
 * justamente para quem mais mexe na Home. Bloco que não está em nenhuma das
 * duas listas é novo: entra visível, no fim da própria faixa.
 *
 * Nunca confia no conteúdo da coluna: JSON quebrado, chave de widget que já
 * não existe ou duplicada caem fora em vez de derrubar a Home.
 */
export function parseHomeWidgets(raw: string | null | undefined): HomeWidgetKey[] {
  if (!raw) return DEFAULT_HOME_WIDGETS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_HOME_WIDGETS;
  }

  let visiveis: HomeWidgetKey[];
  let ocultos: HomeWidgetKey[];
  if (Array.isArray(parsed)) {
    visiveis = limpar(parsed);
    ocultos = CHAVES_DO_FORMATO_ANTIGO.filter((k) => !visiveis.includes(k));
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { visiveis?: unknown }).visiveis)) {
    visiveis = limpar((parsed as { visiveis: unknown }).visiveis);
    ocultos = limpar((parsed as { ocultos?: unknown }).ocultos).filter((k) => !visiveis.includes(k));
  } else {
    return DEFAULT_HOME_WIDGETS;
  }

  const novos = DEFAULT_HOME_WIDGETS.filter((k) => !visiveis.includes(k) && !ocultos.includes(k));
  return [...visiveis, ...novos];
}

/**
 * `visiveis` na ordem escolhida; `ocultos` são só os que o usuário viu na
 * lista e desmarcou — um painel de setor que ele nem enxerga não entra, para
 * não nascer oculto no dia em que ele ganhar acesso.
 */
export function serializeHomeWidgets(visiveis: HomeWidgetKey[], ocultos: HomeWidgetKey[]): string {
  const v = limpar(visiveis);
  const o = limpar(ocultos).filter((k) => !v.includes(k));
  return JSON.stringify({ visiveis: v, ocultos: o });
}

// Ordena os widgets de uma faixa conforme a escolha do usuário, descartando os
// ocultos. Widget restrito some pra quem não tem permissão mesmo que esteja
// salvo como visível (a preferência não é um canal de autorização).
export function visibleWidgets(
  slot: HomeWidgetSlot,
  selected: HomeWidgetKey[],
  opts: OpcoesDeWidgets
): HomeWidgetKey[] {
  return selected.filter((key) => {
    const def = HOME_WIDGETS.find((w) => w.key === key);
    if (!def || def.slot !== slot) return false;
    return disponivel(def, opts);
  });
}

export type OpcoesDeWidgets = {
  showRestricted: boolean;
  /** Os painéis de setor que este usuário enxerga (ver `acessoDosPaineis`). */
  paineisDoSetor?: ReadonlySet<HomeWidgetKey>;
};

function disponivel(def: HomeWidgetDef, opts: OpcoesDeWidgets): boolean {
  if (def.restricted && !opts.showRestricted) return false;
  if (def.doSetor && !opts.paineisDoSetor?.has(def.key)) return false;
  return true;
}

/** Os blocos que este usuário pode ligar — o que a tela de personalização lista. */
export function widgetsDisponiveis(opts: OpcoesDeWidgets): HomeWidgetKey[] {
  return HOME_WIDGETS.filter((w) => disponivel(w, opts)).map((w) => w.key);
}
