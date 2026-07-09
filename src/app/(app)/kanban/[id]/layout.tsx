// Slot @modal renderizado ao lado do board — permanece null (default.tsx) a
// menos que a rota interceptada @modal/(.)itens/[itemId] esteja ativa.
export default function KanbanBoardLayout({
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
