import { redirect } from "next/navigation";

// Criar e editar o usuário abrem no painel ao lado da tabela desde 20/10/2026
// (escolha 3A dos Ajustes de 15/10). Este endereço fica para os links antigos.
export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/usuarios?editar=${encodeURIComponent(id)}`);
}
