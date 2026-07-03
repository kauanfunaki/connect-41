import { EmpresasTable } from 'connect-41';

const STATUS_LABEL = {
  PROSPECT: 'Prospecto',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  CHURNED: 'Cancelado',
} as const;

const STATUS_STYLE = {
  PROSPECT: 'bg-warning/10 text-warning border-warning/25',
  ACTIVE: 'bg-success/10 text-success border-success/25',
  INACTIVE: 'bg-surface-2 text-fg-muted border-border',
  CHURNED: 'bg-danger/10 text-danger border-danger/25',
} as const;

const companies = [
  { id: 'c1', name: 'Alfa Contábil Ltda', cnpj: '12.345.678/0001-90', status: 'ACTIVE' as const, email: 'contato@alfacontabil.com.br', createdAtLabel: '12/03/2024' },
  { id: 'c2', name: 'Beta Serviços MEI', cnpj: '98.765.432/0001-10', status: 'PROSPECT' as const, email: null, createdAtLabel: '02/01/2025' },
  { id: 'c3', name: 'Gama Comércio de Peças', cnpj: '45.123.987/0001-55', status: 'INACTIVE' as const, email: 'financeiro@gama.com.br', createdAtLabel: '20/07/2023' },
  { id: 'c4', name: 'Delta Holding', cnpj: null, status: 'CHURNED' as const, email: null, createdAtLabel: '05/11/2022' },
];

async function atualizarStatusEmMassa() {}
async function excluirEmpresasEmMassa() {}

export function Default() {
  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <EmpresasTable
        companies={companies as never}
        canCreate
        isSuperAdmin
        statusLabel={STATUS_LABEL as never}
        statusStyle={STATUS_STYLE as never}
        atualizarStatusEmMassa={atualizarStatusEmMassa}
        excluirEmpresasEmMassa={excluirEmpresasEmMassa}
      />
    </div>
  );
}
