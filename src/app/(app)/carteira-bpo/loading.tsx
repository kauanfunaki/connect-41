import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// O painel da carteira soma todas as telas do BPO por empresa (22/10/2026):
// sem isto, o clique no menu deixava a tela anterior parada.
export default function LoadingCarteiraBpo() {
  return <ListPageSkeleton />;
}
