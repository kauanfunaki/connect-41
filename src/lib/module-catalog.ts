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
  | "FolderOpen"
  | "Funnel"
  | "GraduationCap"
  | "HandCoins"
  | "IdCard"
  | "Inbox"
  | "KeyRound"
  | "Landmark"
  | "MessageCircle"
  | "MessageSquareWarning"
  | "MessagesSquare"
  | "Network"
  | "Receipt"
  | "ReceiptText"
  | "ShieldCheck"
  | "SquarePen"
  | "Star"
  | "Stethoscope"
  | "Target"
  | "TrendingUp"
  | "UserRoundCheck"
  | "UserRoundPlus"
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
  | "Prospecção"
  | "Cliente"
  | "Atendimento"
  | "Documentos"
  | "Apuração"
  | "Conferência"
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
  // Antes de "Cliente": primeiro quem ainda vai ser cliente (05/10/2026).
  "Prospecção",
  "Cliente",
  "Atendimento",
  "Documentos",
  "Apuração",
  "Conferência",
  "Licenças",
  "Desenvolvimento",
  "Resultado",
  "Relatórios",
  "Cadastros",
  "Apoio",
];

/** O ícone de cada grupo — a sidebar mostra o grupo, e o grupo leva à tela filtrada. */
export const ICONE_DO_GRUPO: Record<GrupoDeModulo, IconeDeModulo> = {
  Operação: "Workflow",
  Seleção: "Briefcase",
  Pessoas: "IdCard",
  Jornada: "Clock",
  Contas: "Receipt",
  "Banco e caixa": "Landmark",
  Prospecção: "Funnel",
  Cliente: "Users",
  Atendimento: "MessageCircle",
  Documentos: "ReceiptText",
  Apuração: "FileSpreadsheet",
  Conferência: "CheckCheck",
  Licenças: "BadgeCheck",
  Desenvolvimento: "GraduationCap",
  Resultado: "ChartColumn",
  Relatórios: "ChartPie",
  Cadastros: "Building2",
  Apoio: "BookOpen",
};

/**
 * O grupo como valor de URL: "Banco e caixa" → `banco-e-caixa`.
 *
 * Sem acento e sem espaço porque vira segmento de rota
 * (`/setor/bpo/grupo/banco-e-caixa`). O rótulo continua sendo a fonte: quem
 * renomear um grupo muda o endereço junto, e link antigo cai no `notFound`, que
 * é melhor que abrir a tela de outro grupo.
 */
export function slugDoGrupo(grupo: GrupoDeModulo): string {
  return grupo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** O grupo de um slug de URL, ou `null` quando não existe. */
export function grupoDoSlug(slug: string | null | undefined): GrupoDeModulo | null {
  if (!slug) return null;
  const alvo = slug.toLowerCase();
  return ORDEM_DOS_GRUPOS.find((g) => slugDoGrupo(g) === alvo) ?? null;
}

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
  /** Exibe a tela diretamente na lateral, mesmo em setores agrupados. */
  menuDireto?: boolean;
  /** Módulo exclusivo do setor de origem; não permite transferência. */
  fixedSector?: boolean;
};

/** O modo das telas fiscais na descrição (23/10/2026): real com a integração do SPED, prévia sem ela. */
const COM_O_MOTOR = "Opera o motor do SPED Generator quando a integração está configurada; sem ela, mostra a prévia de teste";
/** A área que o motor ainda não expõe pela API: com a integração, a tela avisa e manda para o painel do motor. */
const SO_NA_PREVIA = "Com a integração do SPED Generator configurada, o motor ainda não expõe esta área (use o painel do motor); sem ela, mostra a prévia de teste";

export const MODULE_CATALOG: ModuleDef[] = [
  {
    code: "tech_github_contributions", label: "GitHub — Contribuições", sectorCode: "tech",
    description: "Heatmap de commits, pull requests, issues e revisões nos repositórios monitorados",
    defaultEnabled: false, icon: "ChartColumn", group: "Operação", menuDireto: true, fixedSector: true,
  },
  {
    code: "tech_ops_center", label: "Ops Center", sectorCode: "tech",
    description: "Automações, sinal de atividade, resultados de processamento e instabilidades",
    defaultEnabled: false, icon: "Workflow", group: "Operação", menuDireto: true,
  },
  {
    code: "helpdesk", label: "Chamados", sectorCode: "tech",
    description: "Helpdesk interno: solicitações dos setores, atendimento, SLA e triagem conversacional por IA",
    defaultEnabled: false, icon: "MessageSquareWarning", group: "Atendimento",
  },
  {
    // Era item do menu geral até 30/09; o Kauan decidiu que é do setor novo
    // Controladoria, que cuida do atendimento do escritório. A avaliação dos
    // atendentes é uma visão dentro da mesma tela (?view=avaliacao).
    code: "controladoria_conversas",
    label: "Conversas",
    sectorCode: "controladoria",
    description: "Os atendimentos do escritório no Chatwoot, ligados a empresas e pessoas, e a avaliação de cada atendente",
    defaultEnabled: true,
    icon: "MessagesSquare",
    group: "Atendimento",
  },
  {
    // O portal como caminho único entre a 41 e o cliente (01/10): o cliente
    // abre a solicitação escolhendo o assunto, e o assunto diz o setor que
    // atende. Fica na Controladoria (atendimento) para ser ligado e desligado
    // por tenant, mas a tela é do menu Geral — cada setor atende as suas, e
    // não faz sentido entrar na Controladoria para vê-las.
    code: "portal_solicitacoes",
    label: "Solicitações dos clientes",
    sectorCode: "controladoria",
    description: "O que os clientes pedem pelo portal — documento, alteração ou qualquer outra coisa —, por assunto, com setor, responsável e prazo de resposta",
    defaultEnabled: true,
    icon: "Inbox",
    group: "Atendimento",
  },
  {
    // Arquivos (09/10/2026), no modelo do diretório do Acessórias: pastas de
    // cada empresa e internas do escritório, com o que fica compartilhado com o
    // cliente pelo portal e o que ele manda. Como as Solicitações, é do menu
    // Geral — todo setor guarda arquivo —, e a Controladoria só liga e desliga.
    code: "arquivos",
    label: "Arquivos",
    sectorCode: "controladoria",
    description: "Pastas de cada empresa e do escritório: o que a equipe guarda, o que fica compartilhado com o cliente no portal e o que ele envia",
    defaultEnabled: true,
    icon: "FolderOpen",
    group: "Documentos",
  },
  {
    // Primeiro módulo do Comercial (05/10/2026): quem quer ser cliente, vindo
    // da ficha "Quero ser cliente" do portal. Ligado por padrão — sem lead
    // chegando, a tela só explica como eles chegam. Converter o lead em empresa
    // fica para depois.
    code: "comercial_leads",
    label: "Leads",
    sectorCode: "comercial",
    description: "Quem quer ser cliente do escritório: a ficha do portal, com situação, responsável e observações da equipe",
    defaultEnabled: true,
    icon: "UserRoundPlus",
    group: "Prospecção",
  },
  {
    // Setor Tech até existir um módulo de Financeiro para onde ele vai
    // (decisão de 23/09) — o Tech segue com acesso depois da mudança.
    code: "tech_certificados",
    label: "Certificados digitais",
    sectorCode: "tech",
    description: "Vencimento dos certificados A1 dos clientes e em qual entrada do cofre está cada senha — sem arquivo e sem senha no Connect",
    defaultEnabled: false,
    icon: "KeyRound",
    group: "Documentos",
  },
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
    label: "Horas extras",
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
    label: "Avaliações de desempenho",
    sectorCode: "dp",
    description: "Ciclos de avaliação por competência",
    defaultEnabled: true,
    icon: "Star",
    group: "Desenvolvimento",
  },
  {
    code: "gestao_cargos_salarios",
    label: "Cargos e salários",
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
    // Veio do painel 41-gestao (29/09). Fica no setor Gestão para poder ser
    // ligado e desligado por cliente, mas quem vê não é só o setor: a
    // diretoria, os administradores e os coordenadores (ver
    // `recorteDaGestao`), pelo item "Gestão" do menu geral.
    code: "gestao_painel",
    label: "Painel de Gestão",
    sectorCode: "gestao",
    description: "Todos os setores num lugar: o que começou, o que anda, o que parou e o que terminou, a carga de cada pessoa e os alertas de processo parado e prazo",
    defaultEnabled: true,
    icon: "ChartLine",
    group: "Relatórios",
  },
  {
    code: "gestao_valora",
    label: "Valora",
    sectorCode: "gestao",
    description: "Precificação de honorários pelo custo real de atender: simulação com piso, alvo e tabela, e registro de propostas ganhas e perdidas",
    defaultEnabled: false,
    icon: "HandCoins",
    group: "Cliente",
  },
  {
    code: "bpo_dre",
    label: "DRE",
    sectorCode: "bpo",
    description: "Demonstrativo de resultado de caixa, por empresa e mês — monta do que foi pago e recebido",
    defaultEnabled: false,
    icon: "FileSpreadsheet",
    group: "Resultado",
  },
  {
    code: "bpo_senhas",
    label: "Repositório de senhas",
    sectorCode: "bpo",
    description: "Credenciais de portais, bancos e sistemas de clientes centralizadas com auditoria de acesso",
    defaultEnabled: true,
    icon: "KeyRound",
    group: "Apoio",
  },
  {
    code: "bpo_manual",
    label: "Repositório de manuais",
    sectorCode: "bpo",
    description: "Instruções internas escritas pelos colaboradores para alinhamento em ausências e férias",
    defaultEnabled: true,
    icon: "BookOpen",
    group: "Apoio",
  },
  {
    code: "fiscal_documentos",
    label: "Documentos fiscais",
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
  // As telas do processamento fiscal. Desde a PR #279 (22/10/2026) operam o
  // motor do SPED Generator quando a integração `sped` está configurada; sem
  // ela, mostram a prévia de teste do banco local (ver `fiscal/layout.tsx`).
  // As descrições diziam "em teste/simulado" em todas, o que deixou de ser
  // verdade no modo real (23/10/2026): agora dizem o que cada uma faz, e se o
  // motor já expõe a área ou se, com ele, ela ainda fica só no painel do motor.
  ...([
    ["fiscal_painel", "Painel fiscal", `Saúde dos agentes, fila e arquivos da competência. ${COM_O_MOTOR}`, "ChartColumn", "Operação"],
    ["fiscal_classificacao", "Classificação", `Destinação e crédito de produtos, contratos e recibos. ${COM_O_MOTOR}`, "ClipboardList", "Operação"],
    ["fiscal_operacao", "Executar", `Pedidos de extração e geração, fila, histórico e logs. ${COM_O_MOTOR}`, "Workflow", "Operação"],
    ["fiscal_acervo", "Documentos e importações", `Acervo, serviços, contratos, importação e cobertura. ${SO_NA_PREVIA}`, "ReceiptText", "Documentos"],
    ["fiscal_icms_ipi", "ICMS e IPI", `Ajustes da apuração (E111, DIME e DCIP), apuração e demonstrativo. ${COM_O_MOTOR}`, "FileSpreadsheet", "Apuração"],
    ["fiscal_contribuicoes", "PIS e COFINS", `Ajustes do bloco M, decisões por registro, parâmetros e fechamento da EFD Contribuições. ${COM_O_MOTOR}`, "Receipt", "Apuração"],
    ["fiscal_entregas", "SPED gerados", `Versões de SPED, validação, entrega e decisões depois da geração. ${COM_O_MOTOR}`, "CheckCheck", "Conferência"],
    ["fiscal_conferencia", "Conferência fiscal", `Prévia financeira e confronto de documentos. ${SO_NA_PREVIA}`, "Landmark", "Conferência"],
    ["fiscal_configuracoes", "Configurações fiscais", `Cadastro dos estabelecimentos, parâmetros e regras fiscais por CFOP e fonte. ${COM_O_MOTOR}`, "Building2", "Cadastros"],
  ] satisfies [string, string, string, IconeDeModulo, GrupoDeModulo][]).map(([code, label, description, icon, group]) => ({
    code, label, description, icon, group, sectorCode: "fiscal", defaultEnabled: true,
  })),
  {
    // Preparação para o Serpro (09/10/2026): a Autorização de Acesso de cada
    // cliente na Receita Federal, que o Integra Contador confere em cada
    // chamada. Ligado por padrão: é só a carteira com a situação de cada um.
    code: "fiscal_autorizacoes",
    label: "Autorizações de acesso",
    sectorCode: "fiscal",
    description: "Quais clientes já autorizaram o escritório na Receita Federal (a antiga procuração do e-CAC), quem falta pedir e o que vence",
    defaultEnabled: true,
    icon: "ShieldCheck",
    group: "Apoio",
    menuDireto: true,
  },
  {
    code: "societario_licencas",
    label: "Licenças",
    sectorCode: "societario",
    description: "Alvará, sanitária, ambiental e AVCB — o que fica valendo, e a fila de renovação",
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
  // A tabela dinâmica do financeiro (20/10/2026 — "como o Omie, para visualizar
  // e exportar"): contas e baixas em linhas e colunas, com visões prontas.
  {
    code: "bpo_tabela_dinamica",
    label: "Tabela dinâmica",
    sectorCode: "bpo",
    description: "Contas e baixas em linhas e colunas, com visões prontas e exportação para o Excel",
    defaultEnabled: true,
    icon: "FileSpreadsheet",
    group: "Relatórios",
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
    code: "bpo_comunicacao",
    label: "Conversa com o cliente",
    sectorCode: "bpo",
    description: "Conversa livre por empresa, com anexos — o que não é pedido com prazo, e o caminho do cliente para mandar arquivo sem esperar uma pendência",
    defaultEnabled: true,
    icon: "MessagesSquare",
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
  // O painel da carteira (22/10/2026): uma linha por empresa atendida pelo
  // BPO, com o que pede atenção em cada uma — como o painel de clientes do
  // Nibo BPO. Em "Relatórios" e não em "Operação": o BPO abre pelas contas
  // (ver o teste do catálogo), e o painel só lê o que as outras telas gravam.
  {
    code: "bpo_painel_carteira",
    label: "Painel da carteira",
    sectorCode: "bpo",
    description: "Uma linha por empresa atendida: vencidos, extrato, conciliação, saldo, pendências, aprovações e acesso ao portal",
    defaultEnabled: true,
    icon: "Briefcase",
    group: "Relatórios",
  },
  {
    // Fase 2 da integração com o Omie (decidida pelo Kauan em 13/10/2026): a
    // NFS-e sai pelo Omie da empresa, pedida daqui. Desligado por padrão e
    // ligado só no piloto, depois da prévia das respostas reais
    // (scripts/omie-previa-emissao.ts) — emitir é nota de verdade na prefeitura.
    code: "bpo_emitir_nfse",
    label: "Emitir NFS-e",
    sectorCode: "bpo",
    description: "Emissão de NFS-e pelo Omie da empresa, com tomador e serviço do cadastro do próprio Omie, acompanhamento até a prefeitura responder e cancelamento",
    defaultEnabled: false,
    icon: "ReceiptText",
    group: "Documentos",
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
  tech_github_contributions: "/github",
  tech_ops_center:         "/ops",
  helpdesk: "/chamados",
  controladoria_conversas: "/conversas",
  portal_solicitacoes:     "/solicitacoes",
  arquivos:                "/arquivos",
  tech_certificados:       "/certificados",
  comercial_leads:         "/leads",
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
  gestao_valora:           "/valora",
  gestao_painel:           "/gestao",
  bpo_senhas:              "/bpo-senhas",
  bpo_dre:                 "/dre",
  bpo_manual:              "/bpo-manual",
  fiscal_documentos:       "/documentos-fiscais",
  fiscal_autorizacoes:     "/autorizacoes",
  fiscal_painel:           "/fiscal",
  fiscal_classificacao:    "/fiscal/classificacao",
  fiscal_operacao:         "/fiscal/operacao",
  fiscal_acervo:           "/fiscal/documentos",
  fiscal_icms_ipi:         "/fiscal/icms-ipi",
  fiscal_contribuicoes:    "/fiscal/contribuicoes",
  fiscal_entregas:         "/fiscal/entregas",
  fiscal_conferencia:      "/fiscal/conferencia",
  fiscal_configuracoes:    "/fiscal/configuracoes",
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
  bpo_tabela_dinamica:     "/tabela-dinamica",
  bpo_conciliacao:         "/conciliacao",
  bpo_cadastros:           "/fornecedores-e-sacados",
  bpo_pendencias:          "/pendencias",
  bpo_aprovacoes:          "/aprovacoes",
  bpo_comunicacao:         "/comunicacao",
  bpo_cobranca:            "/cobranca",
  bpo_emitir_nfse:         "/emitir-nfse",
  bpo_painel_carteira:     "/carteira-bpo",
  dre_economica:           "/dre/economica",
  dre_analises:            "/dre/analises",
  dre_orcamento:           "/dre/orcamento",
};

/**
 * Módulos que moram numa aba de **Cadastros**, no menu Geral, e não na lista de
 * telas do setor dono (21/10/2026). Diferente de Solicitações e Arquivos, a aba
 * só aparece, e a tela só abre, para quem vê o setor do módulo: Fornecedores e
 * sacados é do BPO, e repetia no menu dele o "Cadastros" do Geral.
 */
export const MODULOS_NOS_CADASTROS: ReadonlySet<string> = new Set(["bpo_cadastros"]);

/**
 * Módulos cuja tela fica no menu **Geral**, e não na lista de telas do setor
 * dono: o setor só serve para ligar e desligar o módulo. Solicitações, Arquivos
 * e Chamados são para todos; os de `MODULOS_NOS_CADASTROS`, só para o setor.
 */
export const MODULOS_DO_MENU_GERAL: ReadonlySet<string> = new Set(["portal_solicitacoes", "arquivos", "helpdesk", ...MODULOS_NOS_CADASTROS]);

/**
 * As telas do grupo "Cliente" do BPO que moram nas abas das Solicitações
 * (21/10/2026), como Fornecedores e sacados nos Cadastros: saem do menu do BPO
 * e aparecem como aba de /solicitacoes só para quem vê o módulo. Com o módulo
 * das Solicitações desligado, voltam ao menu do setor — senão sumiriam.
 */
export const TELAS_DO_BPO_NAS_SOLICITACOES = [
  { modulo: "bpo_pendencias", chave: "pendencias", rotulo: "Pendências do BPO", href: "/pendencias" },
  { modulo: "bpo_aprovacoes", chave: "aprovacoes", rotulo: "Aprovações", href: "/aprovacoes" },
] as const;
export const MODULOS_NAS_SOLICITACOES: ReadonlySet<string> = new Set(TELAS_DO_BPO_NAS_SOLICITACOES.map((t) => t.modulo));

/**
 * O que sai do menu do setor quando as Solicitações estão ligadas: as abas
 * acima e a Conversa com o cliente. A Conversa aparecia no menu do BPO como
 * "Solicitações dos clientes", levando a /solicitacoes — o mesmo item do menu
 * Geral, duplicado (relato do Kauan, 21/10/2026). Até ela virar solicitação, a
 * tela dela segue no Ctrl+K e nas fixadas.
 */
export const FORA_DO_MENU_COM_SOLICITACOES: ReadonlySet<string> = new Set([...MODULOS_NAS_SOLICITACOES, "bpo_comunicacao"]);

/** Funcionalidades acessadas por fluxos internos, sem entrada na navegação. */
export const MODULOS_SEM_MENU: ReadonlySet<string> = new Set(["fiscal_documentos"]);

export function getModuleRoute(code: string): string | undefined {
  return MODULE_ROUTES[code];
}
