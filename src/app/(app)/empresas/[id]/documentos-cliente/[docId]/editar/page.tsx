import { redirect } from "next/navigation";
import { destinoDaRotaAntiga } from "@/lib/envios/regras";

// Rota antiga — a edição do envio mora em /solicitacoes/envios/{docId}/editar
// desde 08/10/2026. Mantido como redirect.
export default async function EditarDocumentoClienteRedirect({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  redirect(destinoDaRotaAntiga(id, { docId, tela: "editar" }));
}
