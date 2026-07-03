import { CampoForm } from 'connect-41';

const sectorOptions = [
  { value: 'contabil', label: 'Contábil' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'societario', label: 'Societário' },
  { value: 'dprh', label: 'DP/RH' },
];

async function criarCampo(prev: unknown) {
  return prev;
}

export function Novo() {
  return (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <CampoForm action={criarCampo as never} cancelHref="/admin/campos" sectorOptions={sectorOptions} />
    </div>
  );
}

export function Edicao() {
  return (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <CampoForm
        action={criarCampo as never}
        cancelHref="/admin/campos"
        sectorOptions={sectorOptions}
        defaultValues={{
          id: 'cmp_1',
          sectorCode: 'fiscal',
          entityType: 'COMPANY' as never,
          label: 'Regime tributário',
          fieldType: 'SELECT' as never,
          options: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
          required: true,
          order: 2,
        }}
      />
    </div>
  );
}
