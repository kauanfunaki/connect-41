import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await abrirTelaDoModulo("fiscal_entregas");
  if ((await searchParams).aba === "dominio") redirect("/fiscal/entregas?aba=entregas");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="entregas" /></Suspense>;
}
