import { ChartColumn, Megaphone, TriangleAlert } from "lucide-react";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import type { TelaDoPortal } from "@/lib/portal/telas";

// O ícone de cada tela do portal, o mesmo no menu e na ajuda. São os ícones
// das telas equivalentes na sidebar do Connect; Relatório e Exigências não têm
// módulo próprio e ganham o seu.
export function iconeDaTela(t: TelaDoPortal): React.ReactNode {
  if (t.href === "/portal/relatorios") return <ChartColumn size={16} />;
  if (t.href === "/portal/exigencias") return <TriangleAlert size={16} />;
  if (t.href === "/portal/comunicados") return <Megaphone size={16} />;
  return <ModuleIcon code={t.modulo ?? "fiscal_documentos"} />;
}
