import { redirect } from "next/navigation";

// O construtor dos campos, com criar e editar no painel ao lado, desde
// 20/10/2026 (escolhas 5A e 2B dos Ajustes de 15/10). Este endereço fica
// para os links antigos.
export default async function EditarCampoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/campos?editar=${encodeURIComponent(id)}`);
}
