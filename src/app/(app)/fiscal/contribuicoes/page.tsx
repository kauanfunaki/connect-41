import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { MotorIndisponivel, CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_contribuicoes");
  const params = await searchParams;
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba === "sped") redirect("/fiscal/entregas?obrigacao=contribuicoes");
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const atual = aba === "decisoes" || aba === "parametros" || aba === "fechamento" || aba === "demonstrativo" ? aba : "ajustes";
      const tipo = atual === "decisoes" ? "decisao_registro_contribuicoes" : atual === "parametros" ? "parametro_contribuicoes" : "ajuste_contribuicoes";
      return <CascoDoMotor tela={tela} caminho="/fiscal/contribuicoes" abas={[{ chave: "ajustes", rotulo: "Ajustes" }, { chave: "decisoes", rotulo: "Decisões por registro" }, { chave: "parametros", rotulo: "Parâmetros" }, { chave: "fechamento", rotulo: "Fechamento" }]} aba={atual} titulo="Apuração" descricao="EFD Contribuições: ajustes do bloco M, decisões por registro e parâmetros da competência, por raiz." semEstabelecimento>
        {atual === "fechamento" || atual === "demonstrativo" ? <SemFonteNoMotor area={atual === "fechamento" ? "Fechamento" : "Demonstrativo"} />
          : <DecisoesMotor tela={tela} caminho="/fiscal/contribuicoes" aba={atual} tipos={[tipo]} params={params} permissoes={await permissoesDeDecisao(ctx, [tipo])} />}
      </CascoDoMotor>;
    }
  }
  if (aba === "parametros") redirect("/fiscal/configuracoes?aba=parametros");
  return <MotorIndisponivel />;
}
