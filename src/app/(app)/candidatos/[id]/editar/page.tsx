import { redirect } from "next/navigation";

// Rota antiga — o formulário "Editar candidato" saiu em 14/10/2026: a ficha
// edita cada bloco no próprio lugar (o lápis de Identificação, Contato e
// Endereço). Mantida como redirect para a ficha, para links antigos e
// favoritos continuarem funcionando.
export default async function EditarCandidatoRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/candidatos/${encodeURIComponent(id)}`);
}
