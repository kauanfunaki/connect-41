import { HandoffForm } from 'connect-41';

const sectorOptions = [
  { value: 'contabil', label: 'Contábil' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'societario', label: 'Societário' },
];

async function solicitarHandoff(prev: unknown) {
  return prev;
}

export function Livre() {
  return (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <HandoffForm
        action={solicitarHandoff as never}
        fromSectorOptions={sectorOptions}
        toSectorOptions={sectorOptions}
        cancelHref="/transferencias"
        companies={[{ id: 'c1', name: 'Alfa Contábil Ltda' }, { id: 'c2', name: 'Beta Serviços MEI' }]}
        people={[{ id: 'p1', name: 'João Silva' }]}
      />
    </div>
  );
}

export function EntidadeFixa() {
  return (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <HandoffForm
        action={solicitarHandoff as never}
        fromSectorOptions={sectorOptions}
        toSectorOptions={sectorOptions}
        cancelHref="/transferencias"
        fixedEntity={{ entityType: 'COMPANY' as never, entityId: 'c1', entityName: 'Alfa Contábil Ltda' }}
      />
    </div>
  );
}
