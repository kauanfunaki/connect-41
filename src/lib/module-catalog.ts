// Catálogo de módulos — vive em código porque um módulo só existe quando a tela
// dele existe de verdade. O que é dinâmico por tenant é só o "ligado/desligado"
// (tabela TenantModule, ver src/lib/modules.ts).
export type ModuleDef = {
  code: string;
  label: string;
  sectorCode: string;
  description: string;
  defaultEnabled: boolean;
};

export const MODULE_CATALOG: ModuleDef[] = [
  {
    code: "recrutamento_vagas",
    label: "Vagas",
    sectorCode: "recrutamento",
    description: "Vagas e processo seletivo",
    defaultEnabled: true,
  },
  {
    code: "recrutamento_candidatos",
    label: "Candidatos",
    sectorCode: "recrutamento",
    description: "Banco de candidatos, independente de vaga",
    defaultEnabled: true,
  },
  {
    code: "recrutamento_colaboradores_clientes",
    label: "Colaboradores de clientes",
    sectorCode: "recrutamento",
    description: "Pessoas que trabalham nas empresas clientes — o cadastro que alimenta admissão, férias e rescisão do DP",
    defaultEnabled: true,
  },
  {
    code: "recrutamento_whatsapp",
    label: "WhatsApp",
    sectorCode: "recrutamento",
    description: "Conversas com candidatos no número do Recrutamento, e o que o assistente passou para uma pessoa",
    defaultEnabled: false,
  },
  {
    code: "recrutamento_testes",
    label: "Testes",
    sectorCode: "recrutamento",
    description: "Testes comportamentais e de perfil aplicados a candidatos",
    defaultEnabled: true,
  },
  {
    code: "dp_colaboradores",
    label: "Colaboradores",
    sectorCode: "dp",
    description: "Admissões, rescisões e férias — ciclo de vida do colaborador",
    defaultEnabled: true,
  },
  {
    code: "dp_afastamentos",
    label: "Afastamentos",
    sectorCode: "dp",
    description: "Afastamentos e atestados ativos",
    defaultEnabled: true,
  },
  {
    code: "dp_horas_extras",
    label: "Horas Extras",
    sectorCode: "dp",
    description: "Lançamentos de horas extras pendentes de aprovação",
    defaultEnabled: true,
  },
  {
    code: "dp_escalas",
    label: "Escalas",
    sectorCode: "dp",
    description: "Escala de trabalho dos próximos 30 dias",
    defaultEnabled: true,
  },
  {
    code: "dp_treinamentos",
    label: "Treinamentos",
    sectorCode: "dp",
    description: "Catálogo de treinamentos, turmas e participantes",
    defaultEnabled: true,
  },
  {
    code: "dp_avaliacoes",
    label: "Avaliações de Desempenho",
    sectorCode: "dp",
    description: "Ciclos de avaliação por competência",
    defaultEnabled: true,
  },
  {
    code: "gestao_cargos_salarios",
    label: "Cargos e Salários",
    sectorCode: "gestao",
    description: "Matriz de cargos, áreas e faixas salariais de todas as empresas",
    defaultEnabled: true,
  },
  {
    code: "gestao_indicadores_rh",
    label: "Indicadores de RH",
    sectorCode: "gestao",
    description: "Dashboard consolidado — headcount, turnover, absenteísmo, custo de folha e mais",
    defaultEnabled: true,
  },
  {
    code: "bpo_dre",
    label: "DRE",
    sectorCode: "bpo",
    description: "Demonstrativo de resultado de caixa, por empresa e mes - monta do que foi pago e recebido",
    defaultEnabled: false,
  },
  {
    code: "bpo_senhas",
    label: "Repositório de Senhas",
    sectorCode: "bpo",
    description: "Credenciais de portais, bancos e sistemas de clientes centralizadas com auditoria de acesso",
    defaultEnabled: true,
  },
  {
    code: "bpo_manual",
    label: "Repositório de Manuais",
    sectorCode: "bpo",
    description: "Instruções internas escritas pelos colaboradores para alinhamento em ausências e férias",
    defaultEnabled: true,
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
  },
  {
    code: "societario_licencas",
    label: "Licencas",
    sectorCode: "societario",
    description: "Alvara, sanitaria, ambiental e AVCB - o que fica valendo, e a fila de renovacao",
    defaultEnabled: false,
  },
  {
    code: "societario_processos",
    label: "Processos",
    sectorCode: "societario",
    description: "Constituição, alteração contratual, baixa e alvarás — com protocolo, exigência e prazo",
    defaultEnabled: true,
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
  },
  {
    code: "societario_prazos",
    label: "Exigências e prazos",
    sectorCode: "societario",
    description: "Exigências abertas de todos os processos e a agenda unificada de prazos",
    defaultEnabled: true,
  },
  {
    code: "societario_relatorios",
    label: "Relatórios",
    sectorCode: "societario",
    description: "SLA por tipo, voltas de exigência, produtividade por responsável e custo em taxas",
    defaultEnabled: true,
  },
  {
    code: "bpo_contas_pagar",
    label: "Contas a pagar",
    sectorCode: "bpo",
    description: "O que sai — nasce do documento fiscal e herda o valor dele",
    defaultEnabled: true,
  },
  {
    code: "bpo_contas_receber",
    label: "Contas a receber",
    sectorCode: "bpo",
    description: "O que entra — nasce do documento fiscal emitido pela empresa",
    defaultEnabled: true,
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
  },
  {
    code: "bpo_fluxo_caixa",
    label: "Fluxo de caixa",
    sectorCode: "bpo",
    description: "Realizado dos últimos meses, projeção dos títulos em aberto e consolidado por empresa",
    defaultEnabled: true,
  },
  {
    code: "bpo_cadastros",
    label: "Fornecedores e sacados",
    sectorCode: "bpo",
    description: "Cadastro das contrapartes das empresas clientes, com a categoria que a próxima conta herda",
    defaultEnabled: true,
  },
  {
    code: "dre_economica",
    label: "DRE econômica",
    sectorCode: "bpo",
    description: "Demonstrativo de resultado por competência — o que pertence ao mês, pago ou não",
    // Desligado como o `bpo_dre`: as duas DREs são entregas que o tenant liga
    // quando o plano de contas já está classificado.
    defaultEnabled: false,
  },
  {
    code: "dre_analises",
    label: "Análises gerenciais",
    sectorCode: "bpo",
    description: "Econômico × financeiro, reconciliação lucro → caixa, comparativos, forecast, cenários, indicadores e CFO",
    defaultEnabled: false,
  },
];

export function getModuleDef(code: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.code === code);
}

export function getModulesForSector(sectorCode: string): ModuleDef[] {
  return MODULE_CATALOG.filter((m) => m.sectorCode === sectorCode);
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
  bpo_cadastros:           "/cadastros-financeiros",
  dre_economica:           "/dre/economica",
  dre_analises:            "/dre/analises",
};

export function getModuleRoute(code: string): string | undefined {
  return MODULE_ROUTES[code];
}
