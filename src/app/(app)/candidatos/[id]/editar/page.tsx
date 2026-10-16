import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";

// Rota antiga — o formulário "Editar candidato" saiu em 14/10/2026: a ficha
// edita cada bloco no próprio lugar (o lápis de Identificação, Contato e
// Endereço). Mantida como redirect para a ficha, para links antigos e
// favoritos continuarem funcionando. Passa pelo gate do módulo antes, como
// toda tela do Recrutamento (modulo.contrato.test.ts): quem não abre a ficha
// não descobre por aqui que a rota existe.
export default async function EditarCandidatoRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await abrirTelaDoModulo("recrutamento_candidatos");
  redirect(`/candidatos/${encodeURIComponent(id)}`);
}
