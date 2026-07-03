import { PessoasTable } from 'connect-41';

const typeLabel = { CANDIDATO: 'Candidato', COLABORADOR: 'Colaborador' } as const;
const typeStyle = {
  CANDIDATO: 'bg-warning/10 text-warning border-warning/25',
  COLABORADOR: 'bg-success/10 text-success border-success/25',
} as const;

const people = [
  { id: 'p1', name: 'João Silva', type: 'COLABORADOR' as const, active: true, cpf: '123.456.789-00', email: 'joao.silva@email.com', companyName: 'Alfa Contábil Ltda', companyId: 'c1', createdAtLabel: '10/02/2024' },
  { id: 'p2', name: 'Maria Oliveira', type: 'CANDIDATO' as const, active: true, cpf: null, email: 'maria.oliveira@email.com', companyName: null, companyId: null, createdAtLabel: '01/06/2025' },
];

async function inativarPessoasEmMassa() {}

export function Default() {
  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <PessoasTable
        people={people as never}
        canCreate
        typeLabel={typeLabel as never}
        typeStyle={typeStyle as never}
        inativarPessoasEmMassa={inativarPessoasEmMassa}
      />
    </div>
  );
}
