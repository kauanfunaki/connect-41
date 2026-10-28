import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";

// O formulário abre no painel ao lado desde 28/10/2026 (lote 5, no molde da
// escolha 2B dos Ajustes de 15/10). Este endereço fica para os links antigos,
// e passa pelo gate do módulo como toda tela do DP.
export default async function NovoTreinamentoPage() {
  await abrirTelaDoModulo("dp_treinamentos");
  redirect("/treinamentos?novo=1");
}
