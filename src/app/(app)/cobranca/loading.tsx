import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// Retorno enquanto a fila carrega (08/10/2026): a cobrança faz consultas
// pesadas, e sem isto o clique no menu deixava a tela anterior parada.
export default function LoadingCobranca() {
  return <ListPageSkeleton />;
}
