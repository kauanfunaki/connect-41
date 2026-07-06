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
    code: "dprh_admissao",
    label: "Admissões",
    sectorCode: "dprh",
    description: "Admissões em andamento e exames admissionais",
    defaultEnabled: true,
  },
  {
    code: "dprh_ferias",
    label: "Férias",
    sectorCode: "dprh",
    description: "Controle de férias vencidas e a vencer",
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
    code: "dprh_desligamentos",
    label: "Desligamentos",
    sectorCode: "dprh",
    description: "Desligamentos em andamento e turnover",
    defaultEnabled: true,
  },
];

export function getModuleDef(code: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.code === code);
}

export function getModulesForSector(sectorCode: string): ModuleDef[] {
  return MODULE_CATALOG.filter((m) => m.sectorCode === sectorCode);
}
