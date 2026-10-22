import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_conferencia");
  const params = await searchParams;
  // Confrontos e prévia financeira não têm endpoint no motor (API-CONNECT §8.3).
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) return <CascoDoMotor tela={tela} caminho="/fiscal/conferencia" titulo="Conferência fiscal" descricao="Prévia financeira e confronto de documentos."><SemFonteNoMotor area="Conferência fiscal" /></CascoDoMotor>;
  }
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba === "depara" || aba === "lancamentos") redirect("/fiscal/conferencia?aba=previa");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="conferencia" /></Suspense>;
}
