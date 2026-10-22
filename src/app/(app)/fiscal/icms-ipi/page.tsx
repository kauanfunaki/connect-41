import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_icms_ipi");
  const params = await searchParams;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      // Só os ajustes têm endpoint (§5.1, item 3); os lançamentos da DIME e da
      // DCIP são campos do próprio ajuste. Apuração e demonstrativo, não.
      const aba = params.aba === "apuracao" || params.aba === "demonstrativo" ? params.aba : params.aba === "dcip-dime" ? "dcip-dime" : "ajustes";
      return <CascoDoMotor tela={tela} caminho="/fiscal/icms-ipi" abas={[{ chave: "ajustes", rotulo: "Ajustes" }, { chave: "apuracao", rotulo: "Apuração" }, { chave: "demonstrativo", rotulo: "Demonstrativo" }]} aba={aba} titulo={aba === "dcip-dime" ? "DCIP e DIME" : "Apuração"} descricao="Ajustes da apuração do ICMS (E111, DIME e DCIP) gravados no motor SPED.">
        {aba === "apuracao" || aba === "demonstrativo" ? <SemFonteNoMotor area={aba === "apuracao" ? "Apuração do ICMS e IPI" : "Demonstrativo"} />
          : <DecisoesMotor tela={tela} caminho="/fiscal/icms-ipi" aba={aba} tipos={["ajuste_apuracao"]} params={params} permissoes={await permissoesDeDecisao(ctx, ["ajuste_apuracao"])} />}
      </CascoDoMotor>;
    }
  }
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="icms-ipi" /></Suspense>;
}
