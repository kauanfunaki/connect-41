import { TagToggleList } from 'connect-41';

const allTags = [
  { id: 't1', name: 'Urgente', color: '#C5374B' },
  { id: 't2', name: 'Fiscal', color: '#0E9384' },
  { id: 't3', name: 'Revisão', color: '#C8860D' },
  { id: 't4', name: 'Aguardando cliente', color: '#586577' },
];

async function toggleAction() {}

export function Default() {
  return (
    <div style={{ maxWidth: 400, padding: 24 }}>
      <TagToggleList allTags={allTags} selectedIds={['t1', 't2']} toggleAction={toggleAction} />
    </div>
  );
}
