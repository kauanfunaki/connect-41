import { redirect } from "next/navigation";
import { PortalContas } from "@/components/portal/PortalContas";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";

export const dynamic = "force-dynamic";

export default async function PortalPagarPage() {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) redirect("/portal/login");
  if (await telaBloqueadaNoPortal(sessao.tenantId, "/portal/pagar")) return <TelaIndisponivel />;
  return <PortalContas kind="PAGAR" />;
}
