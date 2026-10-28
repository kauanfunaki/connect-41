import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";

// O hub "Colaboradores" (admissões, desligamentos e férias em três números)
// saiu no lote 9 (28/10/2026, decisão do Kauan nas perguntas do lote 7): os
// mesmos números estão no painel do DP na Home. O endereço antigo leva às
// Admissões, que têm as abas das outras duas (`AbasDoCiclo`).
export default async function ColaboradoresPage() {
  await abrirTelaDoModulo("dp_colaboradores");
  redirect("/admissoes");
}
