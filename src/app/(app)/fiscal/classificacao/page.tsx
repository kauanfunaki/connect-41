import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await abrirTelaDoModulo("fiscal_classificacao");
  const params = await searchParams;
  if (typeof params.aba === "string" && ["produtos", "apoio", "decisoes"].includes(params.aba)) {
    const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"));
    query.delete("aba");
    if (params.aba === "decisoes") query.set("situacao", "Classificado");
    else query.set("grupo", params.aba);
    redirect(`/fiscal/classificacao?${query}`);
  }
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="classificacao" /></Suspense>;
}
