import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// O retorno do toque no menu (07/10/2026). Todas as telas do portal são
// `force-dynamic`, e sem um `loading` o cliente tocava no item e nada mudava
// até a tela nova chegar inteira — no celular, parecia que o toque não tinha
// pegado. O esqueleto de lista é o das telas da equipe: título e linhas, que é
// o formato da maioria das telas daqui.
export default function CarregandoNoPortal() {
  return <ListPageSkeleton />;
}
