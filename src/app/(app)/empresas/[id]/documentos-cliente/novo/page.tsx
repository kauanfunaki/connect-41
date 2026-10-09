import { redirect } from "next/navigation";
import { destinoDaRotaAntiga } from "@/lib/envios/regras";

// Rota antiga — o novo envio mora em /solicitacoes/envios/novo desde
// 08/10/2026, com a empresa já escolhida. Mantido como redirect.
export default async function NovoDocumentoClienteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(destinoDaRotaAntiga(id, { tela: "novo" }));
}
