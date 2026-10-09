import { redirect } from "next/navigation";
import { destinoDaRotaAntiga } from "@/lib/envios/regras";

// Rota antiga — o envio mora em /solicitacoes/envios/{docId} desde 08/10/2026.
// A tela nova confere se a pessoa pode vê-lo. Mantido como redirect.
export default async function DocumentoClienteRedirect({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  redirect(destinoDaRotaAntiga(id, { docId }));
}
