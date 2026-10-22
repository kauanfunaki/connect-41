import { redirect } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { MotorIndisponivel, CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";
import { ArquivosMotor } from "@/components/fiscal/motor/ArquivosMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_entregas");
  const params = await searchParams;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const aba = params.aba === "entregas" ? "entregas" : "arquivos";
      const [regerar, entregas] = await Promise.all([podeNoModulo(ctx, "fiscal_operacao", "agir"), podeNoModulo(ctx, "fiscal_entregas", "agir")]);
      return <CascoDoMotor tela={tela} caminho="/fiscal/entregas" abas={[{ chave: "arquivos", rotulo: "SPED gerados" }, { chave: "entregas", rotulo: "Entregas" }]} aba={aba} titulo="SPED gerados" descricao="Versões geradas pelo motor, validação, entrega e decisões depois da geração.">
        {aba === "entregas" ? <DecisoesMotor tela={tela} caminho="/fiscal/entregas" aba="entregas" tipos={["entrega_competencia"]} params={params} permissoes={await permissoesDeDecisao(ctx, ["entrega_competencia"])} />
          : <ArquivosMotor tela={tela} params={params} permiteRegerar={regerar && tela.motor.escrita} permiteEntregas={entregas && tela.motor.escrita} />}
      </CascoDoMotor>;
    }
  }
  if (params.aba === "dominio") redirect("/fiscal/entregas?aba=entregas");
  return <MotorIndisponivel />;
}
