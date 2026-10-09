import { redirect } from "next/navigation";
import { destinoDaRotaAntiga } from "@/lib/envios/regras";

// Rota antiga — "Documentos para cliente" saiu da ficha da empresa e virou a
// aba "Envios" da central de Solicitações (08/10/2026). Fica como redirect para
// não quebrar favorito nem link colado; o link que o cliente recebeu por e-mail
// é /d/{token} e não muda.
export default async function DocumentosClienteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(destinoDaRotaAntiga(id));
}
