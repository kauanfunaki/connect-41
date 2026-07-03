import { KanbanBoard } from 'connect-41';

const stages = [
  { id: 'novo', name: 'Novo', color: '#2E6FB8' },
  { id: 'andamento', name: 'Em andamento', color: '#C8860D' },
  { id: 'concluido', name: 'Concluído', color: '#1E8E5A', isTerminal: true },
];

const items = [
  {
    id: 'it_1',
    stageId: 'novo',
    entityName: 'Empresa Alfa Contábil Ltda',
    priority: 2,
    dueDate: '2026-06-20',
    tags: [{ id: 't1', name: 'Urgente', color: '#C5374B' }],
    assignees: [{ id: 'u1', name: 'Ana Souza' }],
    daysInStage: 1,
  },
  {
    id: 'it_2',
    stageId: 'novo',
    entityName: 'Beta Serviços MEI',
    priority: 0,
    dueDate: null,
    daysInStage: 4,
  },
  {
    id: 'it_3',
    stageId: 'andamento',
    entityName: 'Gama Comércio de Peças',
    priority: 1,
    dueDate: '2026-07-10',
    tags: [{ id: 't2', name: 'Fiscal', color: '#C5374B' }, { id: 't3', name: 'Revisão', color: '#0E9384' }],
    assignees: [
      { id: 'u1', name: 'Ana Souza' },
      { id: 'u2', name: 'Bruno Lima' },
      { id: 'u3', name: 'Carla Dias' },
      { id: 'u4', name: 'Diego Melo' },
    ],
    daysInStage: 6,
  },
  {
    id: 'it_4',
    stageId: 'concluido',
    entityName: 'Delta Holding',
    priority: 0,
    dueDate: null,
    daysInStage: 12,
  },
];

async function moveAction() {}

export function Default() {
  return (
    <div style={{ height: 420, padding: 16 }}>
      <KanbanBoard pipelineId="pl_1" stages={stages} items={items} moveAction={moveAction} />
    </div>
  );
}
