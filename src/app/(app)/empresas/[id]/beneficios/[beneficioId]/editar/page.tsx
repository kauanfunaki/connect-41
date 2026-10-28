import { redirect } from "next/navigation";

// O formulário abre no painel ao lado da lista desde 28/10/2026 (lote 5,
// no molde da escolha 2B dos Ajustes de 15/10). Este endereço fica para os
// links antigos.
export default async function EditarBenefitCatalogFormPage({ params }: { params: Promise<{ id: string; beneficioId: string }> }) {
  const { id, beneficioId } = await params;
  redirect(`/empresas/${encodeURIComponent(id)}/beneficios?editar=${encodeURIComponent(beneficioId)}`);
}
