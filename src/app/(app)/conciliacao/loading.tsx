import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// Retorno enquanto a tela carrega (08/10/2026): a conciliação faz consultas
// pesadas, e sem isto o clique no menu deixava a tela anterior parada.
export default function LoadingConciliacao() {
  return <ListPageSkeleton />;
}
