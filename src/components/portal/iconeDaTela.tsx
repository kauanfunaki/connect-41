import { ChartColumn, FileCheck, House, Megaphone, TriangleAlert } from "lucide-react";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import type { TelaDoPortal } from "@/lib/portal/telas";

// O ícone de cada tela do portal, o mesmo no menu e na ajuda. São os ícones
// das telas equivalentes na sidebar do Connect; Início (05/10), Relatório e
// Exigências não têm módulo próprio e ganham o seu.
export function iconeDaTela(t: TelaDoPortal): React.ReactNode {
  if (t.href === "/portal") return <House size={16} />;
  if (t.href === "/portal/relatorios") return <ChartColumn size={16} />;
  if (t.href === "/portal/exigencias") return <TriangleAlert size={16} />;
  if (t.href === "/portal/comunicados") return <Megaphone size={16} />;
  // O mesmo ícone de "Envios ao cliente" na ficha da empresa (08/10/2026).
  if (t.href === "/portal/envios") return <FileCheck size={16} />;
  return <ModuleIcon code={t.modulo ?? "fiscal_documentos"} />;
}
