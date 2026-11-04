import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";

// A agenda própria do Societário saiu (Exigências A, página de opções de
// 04/11/2026): repetia a Agenda geral, que já mostra os prazos do setor —
// exigência, taxa, licença e prazo combinado (`prazosDaAgenda.ts`). O endereço
// antigo leva à Agenda geral, filtrada no setor que opera o módulo.
const MODULE = "societario_prazos";

export const dynamic = "force-dynamic";

export default async function AgendaDePrazosPage() {
  const ctx = await getAuthContext();
  // O primeiro setor que opera o módulo: é o dono (ver `setoresDoModulo`).
  const setor = (ctx.tenantId && (await setoresDoModulo(ctx.tenantId, MODULE))?.[0]) || getModuleDef(MODULE)!.sectorCode;
  redirect(`/agenda?view=semana&setor=${encodeURIComponent(setor)}`);
}
