import { redirect } from "next/navigation";

// O formulário abre no painel ao lado da lista desde 20/10/2026 (escolha 2B
// dos Ajustes de 15/10). Este endereço fica para os links antigos.
export default async function EditarCategoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/plano-de-contas?editar=${encodeURIComponent(id)}`);
}
