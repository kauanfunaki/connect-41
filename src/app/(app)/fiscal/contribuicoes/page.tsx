import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

export default async function Page() {
  await abrirTelaDoModulo("fiscal_contribuicoes");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="contribuicoes" /></Suspense>;
}
