// Catálogo de módulos — vive em código porque um módulo só existe quando a tela
// dele existe de verdade. O que é dinâmico por tenant é só o "ligado/desligado"
// (tabela TenantModule, ver src/lib/modules.ts). Nenhum módulo real ainda — este
// array é o ponto de entrada para a Fase 2 (Recrutamento, RH/DP...).
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
    code: "recrutamento_testes",
    label: "Testes",
    sectorCode: "recrutamento",
    description: "Testes comportamentais e de perfil aplicados a candidatos",
    defaultEnabled: true,
  },
  {
    code: "dprh_colaboradores",
    label: "Colaboradores",
    sectorCode: "dprh",
    description: "Admissões, rescisões e férias — ciclo de vida do colaborador",
    defaultEnabled: true,
  },
  {
    code: "dprh_afastamentos",
    label: "Afastamentos",
    sectorCode: "dprh",
    description: "Afastamentos e atestados ativos",
    defaultEnabled: true,
  },
  {
    code: "dprh_horas_extras",
    label: "Horas Extras",
    sectorCode: "dprh",
    description: "Lançamentos de horas extras pendentes de aprovação",
    defaultEnabled: true,
  },
  {
    code: "dprh_escalas",
    label: "Escalas",
    sectorCode: "dprh",
    description: "Escala de trabalho dos próximos 30 dias",
    defaultEnabled: true,
  },
  {
    code: "dprh_treinamentos",
    label: "Treinamentos",
    sectorCode: "dprh",
    description: "Catálogo de treinamentos, turmas e participantes",
    defaultEnabled: true,
  },
  {
    code: "dprh_avaliacoes",
    label: "Avaliações de Desempenho",
    sectorCode: "dprh",
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
  recrutamento_colaboradores_clientes: "/colaboradores-clientes",
  dprh_colaboradores:      "/colaboradores",
  dprh_afastamentos:       "/afastamentos",
  dprh_horas_extras:       "/horas-extras",
  dprh_escalas:            "/escalas",
  dprh_treinamentos:       "/treinamentos",
  dprh_avaliacoes:         "/avaliacoes",
  gestao_cargos_salarios:  "/cargos-salarios",
  gestao_indicadores_rh:   "/indicadores-rh",
  bpo_senhas:              "/bpo-senhas",
  bpo_manual:              "/bpo-manual",
};

export function getModuleRoute(code: string): string | undefined {
  return MODULE_ROUTES[code];
}
