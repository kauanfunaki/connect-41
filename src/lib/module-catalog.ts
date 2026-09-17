// Catálogo de módulos — vive em código porque um módulo só existe quando a tela
// dele existe de verdade. O que é dinâmico por tenant é só o "ligado/desligado"
// (tabela TenantModule, ver src/lib/modules.ts).
//
// ─── Ícone e grupo (17/09) ───────────────────────────────────────────────────
//
// Até aqui um módulo era só código, rótulo e setor, e a sidebar desenhava os 15
// do BPO com o mesmo ícone, numa lista única — 15 linhas iguais, que é o mesmo
// que nenhuma pista. Ícone e grupo são dado do catálogo, não decisão de cada
// tela: assim a sidebar, o hub do setor e o que vier depois separam igual, e
// módulo novo já nasce no lugar certo.
//
// O `icon` é um nome de ícone do lucide, fechado em união de tipo: o mapa que
// desenha (`src/components/shared/ModuleIcon.tsx`) é `Record<IconeDeModulo, …>`,
// então esquecer de mapear um nome novo não compila.
//
// O grupo também é união de tipo, e a ordem na tela é a de `ORDEM_DOS_GRUPOS` —
// não a ordem deste arquivo. Rótulo de grupo se repete entre setores quando
// quer dizer a mesma coisa ("Cadastros" no BPO e no Recrutamento), e é por isso
// que a ordem é global.

export type IconeDeModulo =
  | "AlarmClock"
  | "BadgeCheck"
  | "BookOpen"
  | "Briefcase"
  | "Building2"
  | "CalendarClock"
  | "ChartColumn"
  | "ChartLine"
  | "ChartPie"
  | "CheckCheck"
  | "ClipboardList"
  | "Clock"
  | "FileSpreadsheet"
  | "GraduationCap"
  | "HandCoins"
  | "IdCard"
  | "KeyRound"
  | "Landmark"
  | "MessageCircle"
  | "MessageSquareWarning"
  | "Network"
  | "Receipt"
  | "ReceiptText"
  | "SquarePen"
  | "Star"
  | "Stethoscope"
  | "Target"
  | "TrendingUp"
  | "UserRoundCheck"
  | "UserSearch"
  | "Users"
  | "Workflow";

export type GrupoDeModulo =
  | "Operação"
  | "Seleção"
  | "Pessoas"
  | "Jornada"
  | "Contas"
  | "Banco e caixa"
  | "Cliente"
  | "Atendimento"
  | "Documentos"
  | "Licenças"
  | "Desenvolvimento"
  | "Resultado"
  | "Relatórios"
  | "Cadastros"
  | "Apoio";

/**
 * A ordem dos grupos em qualquer lista de módulos.
 *
 * Começa pelo que se usa todos os dias e termina no que se consulta de vez em
 * quando: operação, depois dinheiro, depois resultado, e por último cadastro e
 * apoio. Um setor mostra só os grupos que tem.
 */
export const ORDEM_DOS_GRUPOS: readonly GrupoDeModulo[] = [
  "Operação",
  "Seleção",
  "Pessoas",
  "Jornada",
  "Contas",
  "Banco e caixa",
  "Cliente",
  "Atendimento",
  "Documentos",
  "Licenças",
  "Desenvolvimento",
  "Resultado",
  "Relatórios",
  "Cadastros",
  "Apoio",
];

export type ModuleDef = {
  code: string;
  label: string;
  sectorCode: string;
  description: string;
  defaultEnabled: boolean;
  /** Nome do ícone do lucide — ver `ModuleIcon`. */
  icon: IconeDeModulo;
  /** Grupo dentro do setor; a ordem de exibição é a de `ORDEM_DOS_GRUPOS`. */
  group: GrupoDeModulo;
};

export const MODULE_CATALOG: ModuleDef[] = [
  {
    code: "recrutamento_vagas",
    label: "Vagas",
    sectorCode: "recrutamento",
    description: "Vagas e processo seletivo",
    defaultEnabled: true,
    icon: "Briefcase",
    group: "Seleção",
  },
  {
    code: "recrutamento_candidatos",
    label: "Candidatos",
    sectorCode: "recrutamento",
    description: "Banco de candidatos, independente de vaga",
    defaultEnabled: true,
    icon: "UserSearch",
    group: "Seleção",
  },
  {
    code: "recrutamento_colaboradores_clientes",
    label: "Colaboradores de clientes",
    sectorCode: "recrutamento",
    description: "Pessoas que trabalham nas empresas clientes — o cadastro que alimenta admissão, férias e rescisão do DP",
    defaultEnabled: true,
    icon: "Users",
    group: "Cadastros",
  },
  {
    code: "recrutamento_whatsapp",
    label: "WhatsApp",
    sectorCode: "recrutamento",
    description: "Conversas com candidatos no número do Recrutamento, e o que o assistente passou para uma pessoa",
    defaultEnabled: false,
    icon: "MessageCircle",
    group: "Atendimento",
  },
  {
    code: "recrutamento_testes",
    label: "Testes",
    sectorCode: "recrutamento",
    description: "Testes comportamentais e de perfil aplicados a candidatos",
    defaultEnabled: true,
    icon: "ClipboardList",
    group: "Seleção",
  },
  {
    code: "dp_colaboradores",
    label: "Colaboradores",
    sectorCode: "dp",
    description: "Admissões, rescisões e férias — ciclo de vida do colaborador",
    defaultEnabled: true,
    icon: "IdCard",
    group: "Pessoas",
  },
  {
    code: "dp_afastamentos",
    label: "Afastamentos",
    sectorCode: "dp",
    description: "Afastamentos e atestados ativos",
    defaultEnabled: true,
    icon: "Stethoscope",
    group: "Pessoas",
  },
  {
    code: "dp_horas_extras",
    label: "Horas Extras",
    sectorCode: "dp",
    description: "Lançamentos de horas extras pendentes de aprovação",
    defaultEnabled: true,
    icon: "Clock",
    group: "Jornada",
  },
  {
    code: "dp_escalas",
    label: "Escalas",
    sectorCode: "dp",
    description: "Escala de trabalho dos próximos 30 dias",
    defaultEnabled: true,
    icon: "CalendarClock",
    group: "Jornada",
  },
  {
    code: "dp_treinamentos",
    label: "Treinamentos",
    sectorCode: "dp",
    description: "Catálogo de treinamentos, turmas e participantes",
    defaultEnabled: true,
    icon: "GraduationCap",
    group: "Desenvolvimento",
  },
  {
    code: "dp_avaliacoes",
    label: "Avaliações de Desempenho",
    sectorCode: "dp",
    description: "Ciclos de avaliação por competência",
    defaultEnabled: true,
    icon: "Star",
    group: "Desenvolvimento",
  },
  {
    code: "gestao_cargos_salarios",
    label: "Cargos e Salários",
    sectorCode: "gestao",
    description: "Matriz de cargos, áreas e faixas salariais de todas as empresas",
    defaultEnabled: true,
    icon: "Network",
    group: "Cadastros",
  },
  {
    code: "gestao_indicadores_rh",
    label: "Indicadores de RH",
    sectorCode: "gestao",
    description: "Dashboard consolidado — headcount, turnover, absenteísmo, custo de folha e mais",
    defaultEnabled: true,
    icon: "ChartColumn",
    group: "Relatórios",
  },
  {
    code: "bpo_dre",
    label: "DRE",
    sectorCode: "bpo",
    description: "Demonstrativo de resultado de caixa, por empresa e mes - monta do que foi pago e recebido",
    defaultEnabled: false,
    icon: "FileSpreadsheet",
    group: "Resultado",
  },
  {
    code: "bpo_senhas",
    label: "Repositório de Senhas",
    sectorCode: "bpo",
    description: "Credenciais de portais, bancos e sistemas de clientes centralizadas com auditoria de acesso",
    defaultEnabled: true,
    icon: "KeyRound",
    group: "Apoio",
  },
  {
    code: "bpo_manual",
    label: "Repositório de Manuais",
    sectorCode: "bpo",
    description: "Instruções internas escritas pelos colaboradores para alinhamento em ausências e férias",
    defaultEnabled: true,
    icon: "BookOpen",
    group: "Apoio",
  },
  {
    code: "fiscal_documentos",
    label: "Documentos Fiscais",
    sectorCode: "fiscal",
    description: "Acervo de NF-e, NFC-e, CT-e e NFS-e por empresa e competência, com entrada de XML e destino no financeiro",
    // Desligado por padrão, ao contrário dos outros: é o primeiro módulo do
    // setor fiscal e depende de sincronização com o SPED para o acervo não
    // nascer vazio. Ligar num tenant sem essa ponte entregaria uma tela que só
    // sabe dizer "nenhum documento".
    defaultEnabled: false,
    icon: "ReceiptText",
    group: "Documentos",
  },
  {
    code: "societario_licencas",
    label: "Licencas",
    sectorCode: "societario",
    description: "Alvara, sanitaria, ambiental e AVCB - o que fica valendo, e a fila de renovacao",
    defaultEnabled: false,
    icon: "BadgeCheck",
    group: "Licenças",
  },
  {
    code: "societario_processos",
    label: "Processos",
    sectorCode: "societario",
    description: "Constituição, alteração contratual, baixa e alvarás — com protocolo, exigência e prazo",
    defaultEnabled: true,
    icon: "Workflow",
    group: "Operação",
  },
  // Os três abaixo são telas sobre o motor de processos — não têm dado próprio.
  // Kanban e visão de cliente não viraram módulo: são outro jeito de olhar a
  // fila e moram como sub-rotas de `/processos`, sob o gate de
  // `societario_processos`.
  {
    code: "societario_minha_area",
    label: "Minha área",
    sectorCode: "societario",
    description: "O que está na sua mão, por prazo: processos, exigências, taxas e licenças vencendo",
    defaultEnabled: true,
    icon: "UserRoundCheck",
    group: "Operação",
  },
  {
    code: "societario_prazos",
    label: "Exigências e prazos",
    sectorCode: "societario",
    description: "Exigências abertas de todos os processos e a agenda unificada de prazos",
    defaultEnabled: true,
    icon: "AlarmClock",
    group: "Operação",
  },
  {
    code: "societario_relatorios",
    label: "Relatórios",
    sectorCode: "societario",
    description: "SLA por tipo, voltas de exigência, produtividade por responsável e custo em taxas",
    defaultEnabled: true,
    icon: "ChartPie",
    group: "Relatórios",
  },
  {
    code: "bpo_contas_pagar",
    label: "Contas a pagar",
    sectorCode: "bpo",
    description: "O que sai — nasce do documento fiscal e herda o valor dele",
    defaultEnabled: true,
    icon: "Receipt",
    group: "Contas",
  },
  {
    code: "bpo_contas_receber",
    label: "Contas a receber",
    sectorCode: "bpo",
    description: "O que entra — nasce do documento fiscal emitido pela empresa",
    defaultEnabled: true,
    icon: "HandCoins",
    group: "Contas",
  },
  // ─── Paridade do BPO e do DRE (15/09) ─────────────────────────────────────
  //
  // Telas sobre FinanceEntry/FinanceCategory/FinanceCounterparty, sem motor
  // novo. Agrupadas em poucos módulos coesos em vez de um por tela, e com o DRE
  // separado das contas: um cliente pode transferir as DREs para outro setor
  // (ver `setorDoModulo`) sem levar junto o operacional do BPO.
  {
    code: "bpo_lancamentos",
    label: "Lançamentos",
    sectorCode: "bpo",
    description: "Lançamento manual de contas sem nota fiscal e importação de lançamentos por CSV",
    defaultEnabled: true,
    icon: "SquarePen",
    group: "Contas",
  },
  {
    code: "bpo_fluxo_caixa",
    label: "Fluxo de caixa",
    sectorCode: "bpo",
    description: "Realizado dos últimos meses, projeção dos títulos em aberto e consolidado por empresa",
    defaultEnabled: true,
    icon: "TrendingUp",
    group: "Banco e caixa",
  },
  {
    code: "bpo_conciliacao",
    label: "Conciliação bancária",
    sectorCode: "bpo",
    description: "Contas bancárias das empresas, importação de extrato OFX e casamento das transações com os lançamentos",
    defaultEnabled: true,
    icon: "Landmark",
    group: "Banco e caixa",
  },
  {
    code: "bpo_cadastros",
    label: "Fornecedores e sacados",
    sectorCode: "bpo",
    description: "Cadastro das contrapartes das empresas clientes, com a categoria que a próxima conta herda",
    defaultEnabled: true,
    icon: "Building2",
    group: "Cadastros",
  },
  // ─── Relacionamento com o cliente no BPO (16/09) ──────────────────────────
  //
  // Os dois primeiros módulos em que o cliente **escreve** pelo portal. Ligados
  // por padrão como o resto do operacional: pendência sem cliente avisado e
  // aprovação sem alçada cadastrada não mudam nada até alguém usá-las.
  {
    code: "bpo_pendencias",
    label: "Pendências ao cliente",
    sectorCode: "bpo",
    description: "Pedidos de documento, informação ou confirmação ao cliente, com conversa e anexos pelo portal",
    defaultEnabled: true,
    icon: "MessageSquareWarning",
    group: "Cliente",
  },
  {
    code: "bpo_aprovacoes",
    label: "Aprovações",
    sectorCode: "bpo",
    description: "Aprovação de contas a pagar por alçada — o cliente aprova no portal antes da baixa",
    defaultEnabled: true,
    icon: "CheckCheck",
    group: "Cliente",
  },
  // Ligado por padrão como o resto do operacional: a fila só lê o que já está
  // vencido em contas a receber, e a régua de e-mail nasce **desligada** por
  // tenant (sem linha de configuração) — ligar o módulo não manda nada a ninguém.
  {
    code: "bpo_cobranca",
    label: "Cobrança",
    sectorCode: "bpo",
    description: "Inadimplência de contas a receber: fila de vencidos, contatos, acordos, baixa por perda e régua de lembretes por e-mail",
    defaultEnabled: true,
    icon: "AlarmClock",
    group: "Contas",
  },
  {
    code: "dre_economica",
    label: "DRE econômica",
    sectorCode: "bpo",
    description: "Demonstrativo de resultado por competência — o que pertence ao mês, pago ou não",
    // Desligado como o `bpo_dre`: as duas DREs são entregas que o tenant liga
    // quando o plano de contas já está classificado.
    defaultEnabled: false,
    icon: "ChartColumn",
    group: "Resultado",
  },
  {
    code: "dre_analises",
    label: "Análises gerenciais",
    sectorCode: "bpo",
    description: "Econômico × financeiro, reconciliação lucro → caixa, comparativos, forecast, cenários, indicadores e CFO",
    defaultEnabled: false,
    icon: "ChartLine",
    group: "Resultado",
  },
  // Desligado como as outras entregas de DRE: o orçado só faz sentido quando a
  // DRE econômica já está no ar. Ligado, as telas de DRE passam a comparar com a
  // versão aprovada do ano.
  {
    code: "dre_orcamento",
    label: "Orçamento",
    sectorCode: "bpo",
    description: "Orçamento anual por grupo da DRE, com versões e aprovação, comparado ao realizado na DRE econômica e nas análises",
    defaultEnabled: false,
    icon: "Target",
    group: "Resultado",
  },
];

export function getModuleDef(code: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.code === code);
}

export function getModulesForSector(sectorCode: string): ModuleDef[] {
  return MODULE_CATALOG.filter((m) => m.sectorCode === sectorCode);
}

/** Grupo de um módulo pelo código. Código fora do catálogo cai em "Apoio". */
export function grupoDoModulo(code: string): GrupoDeModulo {
  return getModuleDef(code)?.group ?? "Apoio";
}

/**
 * Agrupa uma lista de módulos na ordem de `ORDEM_DOS_GRUPOS`.
 *
 * Serve a qualquer forma de módulo que tenha `code` — o que a sidebar recebe
 * pronto do layout, o que o hub do setor lê do banco —, e **nunca perde item**:
 * código que não está no catálogo vai para "Apoio" em vez de desaparecer do
 * menu, que é o pior jeito de falhar aqui.
 */
export function agruparModulos<T extends { code: string }>(itens: T[]): { grupo: GrupoDeModulo; itens: T[] }[] {
  const porGrupo = new Map<GrupoDeModulo, T[]>();
  for (const item of itens) {
    const grupo = grupoDoModulo(item.code);
    const atual = porGrupo.get(grupo);
    if (atual) atual.push(item);
    else porGrupo.set(grupo, [item]);
  }
  return ORDEM_DOS_GRUPOS.filter((g) => porGrupo.has(g)).map((g) => ({ grupo: g, itens: porGrupo.get(g)! }));
}

// Rota real de cada módulo. Viveu dentro de
// src/app/(app)/setor/[code]/[moduleCode]/page.tsx até 2026-08-21, quando a
// sidebar setorial passou a precisar da mesma informação — duas cópias de um
// de-para é como um módulo novo aparece no menu e não abre.
export const MODULE_ROUTES: Record<string, string> = {
  recrutamento_vagas:      "/vagas",
  recrutamento_candidatos: "/candidatos",
  recrutamento_testes:     "/testes",
  recrutamento_whatsapp:   "/whatsapp",
  recrutamento_colaboradores_clientes: "/colaboradores-clientes",
  dp_colaboradores:      "/colaboradores",
  dp_afastamentos:       "/afastamentos",
  dp_horas_extras:       "/horas-extras",
  dp_escalas:            "/escalas",
  dp_treinamentos:       "/treinamentos",
  dp_avaliacoes:         "/avaliacoes",
  gestao_cargos_salarios:  "/cargos-salarios",
  gestao_indicadores_rh:   "/indicadores-rh",
  bpo_senhas:              "/bpo-senhas",
  bpo_dre:                 "/dre",
  bpo_manual:              "/bpo-manual",
  fiscal_documentos:       "/documentos-fiscais",
  societario_processos:    "/processos",
  societario_licencas:     "/licencas",
  // Fora de `/processos` de propósito: a sidebar marca ativo por prefixo, e
  // `/processos/exigencias` acenderia "Processos" e "Exigências" juntos.
  societario_minha_area:   "/societario/minha-area",
  societario_prazos:       "/societario/exigencias",
  societario_relatorios:   "/societario/relatorios",
  bpo_contas_pagar:        "/pagar",
  bpo_contas_receber:      "/receber",
  bpo_lancamentos:         "/lancamentos",
  bpo_fluxo_caixa:         "/fluxo-de-caixa",
  bpo_conciliacao:         "/conciliacao",
  bpo_cadastros:           "/cadastros-financeiros",
  bpo_pendencias:          "/pendencias",
  bpo_aprovacoes:          "/aprovacoes",
  bpo_cobranca:            "/cobranca",
  dre_economica:           "/dre/economica",
  dre_analises:            "/dre/analises",
  dre_orcamento:           "/dre/orcamento",
};

export function getModuleRoute(code: string): string | undefined {
  return MODULE_ROUTES[code];
}
