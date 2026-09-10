import { EmpresasTable } from 'connect-41';

// Reescrito em 10/09/2026, no primeiro rebuild desde julho. O preview anterior
// passava `statusStyle` e o componente hoje recebe `statusColor` — a prop foi
// renomeada depois do sync, e indexar `undefined` derrubava a árvore inteira:
// o render check acusava "root empty", que é a forma que a deriva de props
// assume aqui. As linhas também ganharam campos desde então (cliente, matriz,
// regime, cidade), e `agruparPorCliente`/`montarArvore` leem exatamente esses.
const STATUS_LABEL = {
  PROSPECT: 'Prospecto',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  CHURNED: 'Cancelado',
} as const;

const STATUS_COLOR = {
  PROSPECT: 'bg-warning/10 text-warning border-warning/25',
  ACTIVE: 'bg-success/10 text-success border-success/25',
  INACTIVE: 'bg-surface-2 text-fg-muted border-border',
  CHURNED: 'bg-danger/10 text-danger border-danger/25',
} as const;

// Duas empresas do mesmo cliente, uma delas filial: é o caso que exercita o
// cabeçalho de grupo e a linha recolhível ao mesmo tempo.
const companies = [
  {
    id: 'c1',
    name: 'ALFA CONTABILIDADE E ASSESSORIA LTDA',
    displayName: 'Alfa Contábil',
    externalId: '4412',
    kind: 'PESSOA_JURIDICA' as const,
    cnpj: '12345678000190',
    cpf: null,
    status: 'ACTIVE' as const,
    email: 'contato@alfacontabil.com.br',
    taxRegime: 'SIMPLES_NACIONAL',
    logoUrl: null,
    city: 'Londrina',
    stateCode: 'PR',
    clientGroupId: 'g1',
    clientGroupName: 'Grupo Alfa',
    parentCompanyId: null,
  },
  {
    id: 'c2',
    name: 'ALFA CONTABILIDADE FILIAL CURITIBA LTDA',
    displayName: null,
    externalId: '4413',
    kind: 'PESSOA_JURIDICA' as const,
    cnpj: '12345678000271',
    cpf: null,
    status: 'ACTIVE' as const,
    email: null,
    taxRegime: 'SIMPLES_NACIONAL',
    logoUrl: null,
    city: 'Curitiba',
    stateCode: 'PR',
    clientGroupId: 'g1',
    clientGroupName: 'Grupo Alfa',
    parentCompanyId: 'c1',
  },
  {
    id: 'c3',
    name: 'BETA SERVICOS DIGITAIS MEI',
    displayName: null,
    externalId: null,
    kind: 'PESSOA_JURIDICA' as const,
    cnpj: '98765432000110',
    cpf: null,
    status: 'PROSPECT' as const,
    email: null,
    taxRegime: 'MEI',
    logoUrl: null,
    city: 'Maringá',
    stateCode: 'PR',
    clientGroupId: 'g2',
    clientGroupName: 'Beta',
    parentCompanyId: null,
  },
  // Pessoa física: identificada por CPF, sem CNPJ e sem regime — mora na mesma
  // tabela desde 03/09, e é onde a coluna de documento precisa não quebrar.
  {
    id: 'c4',
    name: 'MARIA APARECIDA DE SOUZA',
    displayName: null,
    externalId: null,
    kind: 'PESSOA_FISICA' as const,
    cnpj: null,
    cpf: '11122233344',
    status: 'CHURNED' as const,
    email: 'maria@exemplo.com.br',
    taxRegime: null,
    logoUrl: null,
    city: null,
    stateCode: null,
    clientGroupId: null,
    clientGroupName: null,
    parentCompanyId: null,
  },
];

async function atualizarStatusEmMassa() {}
async function excluirEmpresasEmMassa() {}

export function Default() {
  return (
    <div style={{ maxWidth: 980, padding: 24 }}>
      <EmpresasTable
        companies={companies as never}
        canCreate
        isSuperAdmin
        statusLabel={STATUS_LABEL as never}
        statusColor={STATUS_COLOR as never}
        atualizarStatusEmMassa={atualizarStatusEmMassa}
        excluirEmpresasEmMassa={excluirEmpresasEmMassa}
      />
    </div>
  );
}
