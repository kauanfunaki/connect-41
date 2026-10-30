import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { PainelMotor } from "@/components/fiscal/motor/PainelMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_painel");
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(await searchParams);
    if (tela) return <CascoDoMotor tela={tela} caminho="/fiscal" titulo="Painel fiscal" descricao="Agentes, fila e arquivos da competência no motor SPED.">
      <PainelMotor tela={tela} />
    </CascoDoMotor>;
  }
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="painel" /></Suspense>;
}
