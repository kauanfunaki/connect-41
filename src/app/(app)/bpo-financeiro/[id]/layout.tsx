// Slot @modal renderizado ao lado do board — permanece null (default.tsx) a
// menos que a rota interceptada @modal/(.)itens/[itemId] esteja ativa.
// Mesmo padrão de src/app/(app)/kanban/[id]/layout.tsx, duplicado aqui porque
// o BPO tem rota própria (não usa as telas gerais de /kanban).
export default function BpoBoardLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
