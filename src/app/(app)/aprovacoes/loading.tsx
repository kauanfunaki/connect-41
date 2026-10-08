import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// Retorno enquanto a fila carrega (08/10/2026): sem isto, o clique no menu
// deixava a tela anterior parada até o servidor responder.
export default function LoadingAprovacoes() {
  return <ListPageSkeleton />;
}
