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
    code: "bpo_tarefas",
    label: "Tarefas do BPO",
    sectorCode: "bpo",
    description: "Quadro dedicado do BPO Financeiro — fechamento por competência, carteira de clientes e pendências",
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
    label: "Manual",
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
