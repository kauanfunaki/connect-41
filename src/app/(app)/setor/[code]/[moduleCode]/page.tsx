import { notFound, redirect } from "next/navigation";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";

// Dispatcher fino: cada módulo real vive na sua própria rota (ex: /vagas);
// esta página só existe pra o link montado em /setor/[code] ter destino.
const MODULE_ROUTES: Record<string, string> = {
  recrutamento_vagas: "/vagas",
  recrutamento_candidatos: "/candidatos",
  dprh_admissao:      "/admissoes",
  dprh_ferias:        "/ferias",
  dprh_afastamentos:  "/afastamentos",
  dprh_desligamentos: "/desligamentos",
  dprh_horas_extras:  "/horas-extras",
  dprh_escalas:       "/escalas",
  dprh_treinamentos:  "/treinamentos",
  dprh_avaliacoes:    "/avaliacoes",
  dprh_indicadores:   "/indicadores-rh",
};

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
