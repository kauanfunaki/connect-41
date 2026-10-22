import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { MotorIndisponivel, CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";

/** As antigas abas que recortavam o acervo viraram o filtro Grupo (15/10/2026). */
const GRUPOS_ANTIGOS = ["nfse", "apoio", "quarentena"];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_acervo");
  const params = await searchParams;
  // O motor ainda não expõe documentos e importações pela API (API-CONNECT §8.3).
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) return <CascoDoMotor tela={tela} caminho="/fiscal/documentos" titulo="Documentos e importações" descricao="Acervo, importações e cobertura do motor SPED."><SemFonteNoMotor area="Documentos e importações" /></CascoDoMotor>;
  }
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba && GRUPOS_ANTIGOS.includes(aba)) redirect(`/fiscal/documentos?aba=acervo&grupo=${aba}`);
  return <MotorIndisponivel />;
}
