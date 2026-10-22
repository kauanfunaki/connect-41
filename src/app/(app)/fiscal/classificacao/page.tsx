import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { MotorIndisponivel, CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_classificacao");
  const params = await searchParams;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const aba = params.aba === "apoio" ? "apoio" : "produtos";
      const tipos = aba === "apoio" ? (["documento_apoio_categoria", "credito_documento_apoio"] as const) : (["classificacao_item", "credito_icms_item"] as const);
      return <CascoDoMotor tela={tela} caminho="/fiscal/classificacao" abas={[{ chave: "produtos", rotulo: "Produtos" }, { chave: "apoio", rotulo: "Contratos e recibos" }]} aba={aba} titulo="Classificação" descricao={aba === "apoio" ? "Categoria e crédito dos documentos de apoio, gravados no motor SPED." : "Tipo do item, destinação e crédito por produto, gravados no motor SPED."}>
        <DecisoesMotor tela={tela} caminho="/fiscal/classificacao" aba={aba} tipos={[...tipos]} params={params} permissoes={await permissoesDeDecisao(ctx, [...tipos])} />
      </CascoDoMotor>;
    }
  }
  if (typeof params.aba === "string" && ["produtos", "apoio", "decisoes"].includes(params.aba)) {
    const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"));
    query.delete("aba");
    if (params.aba === "decisoes") query.set("situacao", "Classificado");
    else query.set("grupo", params.aba);
    redirect(`/fiscal/classificacao?${query}`);
  }
  return <MotorIndisponivel />;
}
