import { redirect } from "next/navigation";
import { destinoDaRotaAntiga } from "@/lib/envios/regras";
import { getAuthContext } from "@/lib/auth/context";
import { registroDaRota } from "@/lib/enderecoCurtoServidor";

// Rota antiga — "Documentos para cliente" saiu da ficha da empresa e virou a
// aba "Envios" da central de Solicitações (08/10/2026). Fica como redirect para
// não quebrar favorito nem link colado; o link que o cliente recebeu por e-mail
// é /d/{token} e não muda.
export default async function DocumentosClienteRedirect({ params }: { params: Promise<{ id: string }> }) {
  // O filtro dos envios é pelo uuid: a empresa vem pelo uuid ou pelo id curto (10/11/2026).
  const { id } = await registroDaRota("empresa", (await getAuthContext()).tenantId, (await params).id);
  redirect(destinoDaRotaAntiga(id));
}
