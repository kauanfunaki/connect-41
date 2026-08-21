import { notFound, redirect } from "next/navigation";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getModuleDef, MODULE_ROUTES } from "@/lib/module-catalog";

// Dispatcher fino: cada módulo real vive na sua própria rota (ex: /vagas);
// esta página só existe pra o link montado em /setor/[code] ter destino.
// O de-para mora em src/lib/module-catalog.ts, porque a sidebar setorial usa o
// mesmo mapa.

export default async function SectorModulePage({
  params,
}: {
  params: Promise<{ code: string; moduleCode: string }>;
}) {
  const { code, moduleCode } = await params;
  const ctx = await getAuthContext();

  if (!canViewSector(ctx, code)) notFound();

  const moduleDef = getModuleDef(moduleCode);
  if (!moduleDef || moduleDef.sectorCode !== code) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, moduleCode))) notFound();

  const target = MODULE_ROUTES[moduleCode];
  if (!target) notFound();

  redirect(target);
}
