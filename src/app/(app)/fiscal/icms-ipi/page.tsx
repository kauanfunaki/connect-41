import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_icms_ipi");
  const params = await searchParams;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) return <CascoDoMotor tela={tela} caminho="/fiscal/icms-ipi" aba={typeof params.aba === "string" ? params.aba : "apuracao"} titulo="Apuração" descricao="Apuração do ICMS e IPI no motor SPED."><SemFonteNoMotor area="Apuração do ICMS e IPI" /></CascoDoMotor>;
  }
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="icms-ipi" /></Suspense>;
}
