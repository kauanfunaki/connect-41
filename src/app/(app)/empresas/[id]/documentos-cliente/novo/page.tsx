import { redirect } from "next/navigation";
import { destinoDaRotaAntiga } from "@/lib/envios/regras";
import { getAuthContext } from "@/lib/auth/context";
import { registroDaRota } from "@/lib/enderecoCurtoServidor";

// Rota antiga — o novo envio mora em /solicitacoes/envios/novo desde
// 08/10/2026, com a empresa já escolhida. Mantido como redirect.
export default async function NovoDocumentoClienteRedirect({ params }: { params: Promise<{ id: string }> }) {
  // O filtro dos envios é pelo uuid: a empresa vem pelo uuid ou pelo id curto (10/11/2026).
  const { id } = await registroDaRota("empresa", (await getAuthContext()).tenantId, (await params).id);
  redirect(destinoDaRotaAntiga(id, { tela: "novo" }));
}
