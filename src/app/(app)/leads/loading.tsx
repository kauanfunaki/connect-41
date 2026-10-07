import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// Sem loading.tsx, a tela anterior ficava parada até a consulta acabar — as
// irmãs do Recrutamento já mostravam o esqueleto (auditoria DRG-33, 07/10/2026).
export default function LoadingLeads() {
  return <ListPageSkeleton />;
}
