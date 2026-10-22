import { redirect } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { MotorIndisponivel, CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { OperacaoMotor } from "@/components/fiscal/motor/OperacaoMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_operacao");
  const params = await searchParams;
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const atual = aba === "historico" ? "historico" : "executar";
      const [agir, gerir] = await Promise.all([podeNoModulo(ctx, "fiscal_operacao", "agir"), podeNoModulo(ctx, "fiscal_operacao", "gerir")]);
      return <CascoDoMotor tela={tela} caminho="/fiscal/operacao" abas={[{ chave: "executar", rotulo: "Executar" }, { chave: "historico", rotulo: "Histórico" }]} aba={atual} titulo={atual === "historico" ? "Histórico de execuções" : "Executar"} descricao="Pedidos para a fila do motor SPED. Os agentes do motor executam; aqui se acompanha o log.">
        <OperacaoMotor tela={tela} aba={atual} params={params} permiteAgir={agir} permiteGerir={gerir} />
      </CascoDoMotor>;
    }
  }
  // Fila e Erros viraram o filtro Estado do Histórico (15/10/2026).
  if (aba === "fila" || aba === "erros") redirect(`/fiscal/operacao?aba=historico&estado=${aba === "fila" ? "fila" : "erro"}`);
  return <MotorIndisponivel />;
}
