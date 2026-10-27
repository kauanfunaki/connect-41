import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { ContabilSped } from "@/components/contabil/ContabilSped";
export default async function Page() {
  await abrirTelaDoModulo("contabil_sped");
  return <Suspense fallback={<p role="status">Carregando o Contábil…</p>}><ContabilSped /></Suspense>;
}
