import { EmpresaForm } from 'connect-41';

async function salvarEmpresa(prev: unknown) {
  return prev;
}

export function Edicao() {
  return (
    <div style={{ maxWidth: 720, padding: 24 }}>
      <EmpresaForm
        action={salvarEmpresa as never}
        cancelHref="/empresas"
        branchOptions={[{ value: 'br1', label: 'Matriz — Curitiba' }, { value: 'br2', label: 'Filial — São Paulo' }]}
        defaultValues={{
          id: 'emp_1',
          name: 'Alfa Contábil Ltda',
          tradeName: 'Alfa Contábil',
          cnpj: '12.345.678/0001-90',
          taxRegime: 'Simples Nacional',
          zipCode: '80010-000',
          addressStreet: 'Rua XV de Novembro',
          addressNumber: '500',
          neighborhood: 'Centro',
          city: 'Curitiba',
          stateCode: 'PR',
          email: 'contato@alfacontabil.com.br',
          phone: '(41) 99999-9999',
          website: 'https://alfacontabil.com.br',
          status: 'ACTIVE' as never,
          source: 'Indicação',
        }}
      />
    </div>
  );
}
