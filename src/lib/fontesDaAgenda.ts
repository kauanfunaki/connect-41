// As fontes de prazo da Agenda (10/11/2026, pedido do Kauan).
//
// "Agenda e Meu dia usam as reuniões, mas tem setores que não fazem reuniões":
// para esses, a Agenda é a lista do que vence. Cada prazo vem de uma tela do
// Connect (a fonte), e a pessoa liga e desliga as fontes nos botões acima de
// Prazos e de Mês. O catálogo mora aqui, em código: chave, rótulo, a cor (um
// token que já existe — setor ou área do menu, nenhuma cor nova) e o módulo de
// que a fonte depende. Quem pode ver cada fonte é decidido no servidor, pela
// mesma regra da tela de onde ela vem (`acessoAsFontes`, em prazosDaAgenda.ts).
//
// Puro, sem banco: os componentes de cliente importam daqui.

/** O que gerou o prazo — o ícone e o rótulo do item. */
export type TipoDePrazo =
  | "tech"
  | "tarefa"
  | "conta-pagar"
  | "conta-receber"
  | "pendencia"
  | "processo"
  | "exigencia"
  | "taxa"
  | "licenca"
  | "ferias"
  | "exame"
  | "vaga"
  | "certificado"
  // As duas fontes novas de 10/11/2026: a data legal das obrigações e o
  // vencimento das guias emitidas pelo Connect.
  | "obrigacao"
  | "guia";

export type FonteDaAgenda =
  | "obrigacoes"
  | "guias"
  | "tarefas"
  | "contas"
  | "pendencias"
  | "societario"
  | "dp"
  | "vagas"
  | "certificados"
  | "controle-interno";

export type DefDaFonte = {
  chave: FonteDaAgenda;
  /** O rótulo do botão — curto. */
  rotulo: string;
  /** O que entra, para a dica e para a configuração do setor. */
  descricao: string;
  /** Um token de cor que já existe (setor ou área do menu). */
  cor: string;
  tipos: readonly TipoDePrazo[];
  /**
   * Os módulos de que a fonte depende — basta um ligado no escritório. Vazio:
   * sempre existe (as atividades dos Quadros e as obrigações, que são
   * atividades dos Quadros com data legal).
   */
  modulos: readonly string[];
};

/**
 * Na ordem dos botões. As cores repetem as do desenho aprovado (B, 10/11/2026):
 * obrigação no vermelho do Fiscal, guia no laranja da área Fiscal do menu,
 * tarefa no azul da marca, férias no roxo do DP, certificado no azul do Tech.
 */
export const FONTES_DA_AGENDA: readonly DefDaFonte[] = [
  {
    chave: "obrigacoes",
    rotulo: "Obrigações",
    descricao: "A data legal das obrigações geradas para as empresas, com o aviso de risco de multa.",
    cor: "var(--c41-sector-fiscal)",
    tipos: ["obrigacao"],
    modulos: [],
  },
  {
    chave: "guias",
    rotulo: "Guias",
    descricao: "O vencimento das guias emitidas pelo Connect que ainda não foram pagas.",
    cor: "var(--c41-grupo-fiscal)",
    tipos: ["guia"],
    modulos: ["fiscal_autorizacoes"],
  },
  {
    chave: "tarefas",
    rotulo: "Tarefas",
    descricao: "O prazo das atividades dos Quadros.",
    cor: "var(--c41-brand)",
    tipos: ["tarefa"],
    modulos: [],
  },
  {
    chave: "contas",
    rotulo: "Contas",
    descricao: "Contas a pagar e a receber em aberto.",
    cor: "var(--c41-grupo-financeiro)",
    tipos: ["conta-pagar", "conta-receber"],
    modulos: ["bpo_contas_pagar", "bpo_contas_receber"],
  },
  {
    chave: "pendencias",
    rotulo: "Pendências",
    descricao: "As pendências com o cliente que têm prazo.",
    cor: "var(--c41-grupo-atendimento)",
    tipos: ["pendencia"],
    modulos: ["bpo_pendencias"],
  },
  {
    chave: "societario",
    rotulo: "Societário",
    descricao: "Processos com prazo combinado, exigências do órgão, taxas e licenças vencendo.",
    cor: "var(--c41-sector-societario)",
    tipos: ["processo", "exigencia", "taxa", "licenca"],
    modulos: ["societario_processos"],
  },
  {
    chave: "dp",
    rotulo: "Férias e exames",
    descricao: "Férias começando e exames admissionais marcados.",
    cor: "var(--c41-sector-dprh)",
    tipos: ["ferias", "exame"],
    modulos: ["dp_colaboradores"],
  },
  {
    chave: "vagas",
    rotulo: "Vagas",
    descricao: "O fim das inscrições das vagas abertas.",
    cor: "var(--c41-sector-recrutamento)",
    tipos: ["vaga"],
    modulos: ["recrutamento_vagas"],
  },
  {
    chave: "certificados",
    rotulo: "Certificados",
    descricao: "Certificados digitais vencendo.",
    cor: "var(--c41-sector-tech)",
    tipos: ["certificado"],
    modulos: ["tech_certificados"],
  },
  {
    chave: "controle-interno",
    rotulo: "Controle interno",
    descricao: "O prazo dos itens em aberto do controle interno do Tech.",
    cor: "var(--c41-grupo-escritorio)",
    tipos: ["tech"],
    modulos: ["tech_controle_interno"],
  },
];

const CHAVES = new Set<string>(FONTES_DA_AGENDA.map((f) => f.chave));

export function ehFonteDaAgenda(valor: unknown): valor is FonteDaAgenda {
  return typeof valor === "string" && CHAVES.has(valor);
}

export function defDaFonte(chave: FonteDaAgenda): DefDaFonte {
  return FONTES_DA_AGENDA.find((f) => f.chave === chave)!;
}

const FONTE_DO_TIPO = new Map<TipoDePrazo, FonteDaAgenda>(
  FONTES_DA_AGENDA.flatMap((f) => f.tipos.map((t) => [t, f.chave] as const)),
);

export function fonteDoTipo(tipo: TipoDePrazo): FonteDaAgenda {
  return FONTE_DO_TIPO.get(tipo)!;
}

/**
 * Os tipos em que "a data passou e continua aberto" é atraso. Férias que já
 * começaram e inscrição de vaga que já encerrou não são atraso de ninguém —
 * ficam fora de "Atrasados" e não levam o selo.
 */
const ATRASA = new Set<TipoDePrazo>([
  "tech",
  "tarefa",
  "conta-pagar",
  "conta-receber",
  "pendencia",
  "processo",
  "exigencia",
  "taxa",
  "licenca",
  "exame",
  "certificado",
  "obrigacao",
  "guia",
]);

export function tipoAtrasa(tipo: TipoDePrazo): boolean {
  return ATRASA.has(tipo);
}

/**
 * Lê a lista de fontes desligadas gravada no banco. `null` quando não há
 * escolha (coluna nula ou JSON quebrado): aí vale o padrão de cima. Chave que
 * já não existe e repetida caem fora; a ordem é a do catálogo.
 */
export function lerFontesOcultas(raw: string | null | undefined): FonteDaAgenda[] | null {
  if (raw == null || raw === "") return null;
  let lido: unknown;
  try {
    lido = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(lido)) return null;
  return limparFontes(lido);
}

/** As fontes conhecidas da lista, sem repetição, na ordem do catálogo. */
export function limparFontes(lista: readonly unknown[]): FonteDaAgenda[] {
  const pedidas = new Set(lista.filter(ehFonteDaAgenda));
  return FONTES_DA_AGENDA.filter((f) => pedidas.has(f.chave)).map((f) => f.chave);
}

export function gravarFontesOcultas(lista: readonly unknown[]): string {
  return JSON.stringify(limparFontes(lista));
}
