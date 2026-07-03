import { ItemForm } from 'connect-41';

async function adicionarItem(prev: unknown) {
  return prev;
}

export function Default() {
  return (
    <div style={{ maxWidth: 520, padding: 24 }}>
      <ItemForm
        action={adicionarItem as never}
        pipelineId="pl_1"
        entityType={'COMPANY' as never}
        entities={[{ id: 'c1', name: 'Alfa Contábil Ltda' }, { id: 'c2', name: 'Gama Comércio de Peças' }]}
        tags={[{ id: 't1', name: 'Urgente', color: '#C5374B' }, { id: 't2', name: 'Fiscal', color: '#0E9384' }]}
        sectorUsers={[{ id: 'u1', name: 'Ana Souza' }, { id: 'u2', name: 'Bruno Lima' }]}
        cancelHref="/kanban/pl_1"
      />
    </div>
  );
}
