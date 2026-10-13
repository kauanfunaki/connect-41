import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await abrirTelaDoModulo("fiscal_conferencia");
  const { aba } = await searchParams;
  if (aba === "depara" || aba === "lancamentos") redirect("/fiscal/conferencia?aba=previa");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="conferencia" /></Suspense>;
}
