import { FolderSearch } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/** Antes da primeira varredura concluída não há o que mostrar em nenhuma das telas. */
export function SemVarredura({ texto }: { texto: string }) {
  return <EmptyState title="Nenhuma varredura concluída ainda" description={texto} icon={<FolderSearch />} />;
}
