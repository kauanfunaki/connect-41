import { PessoaForm } from 'connect-41';

async function salvarPessoa(prev: unknown) {
  return prev;
}

export function Edicao() {
  return (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <PessoaForm
        action={salvarPessoa as never}
        cancelHref="/pessoas"
        companies={[{ id: 'c1', name: 'Alfa Contábil Ltda' }, { id: 'c2', name: 'Gama Comércio de Peças' }]}
        defaultValues={{
          id: 'p1',
          name: 'João Silva',
          cpf: '123.456.789-00',
          email: 'joao.silva@email.com',
          phone: '(41) 98888-7777',
          birthDate: '1990-04-12',
          type: 'COLABORADOR' as never,
          currentCompanyId: 'c1',
        }}
      />
    </div>
  );
}
