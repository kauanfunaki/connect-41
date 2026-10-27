import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { AcervoMotor, CoberturaMotor, ImportacoesMotor } from "@/components/fiscal/motor/DocumentosMotor";
import { CarregandoLeitura } from "@/components/fiscal/motor/LeituraDoMotor";

/** As antigas abas que recortavam o acervo viraram o filtro Grupo (15/10/2026). */
const GRUPOS_ANTIGOS = ["nfse", "apoio", "quarentena"];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_acervo");
  const params = await searchParams;
  // Modo motor (API-CONNECT §11.1): Acervo pela projeção `FiscalDocument`,
  // Importações e Cobertura pelas leituras leves da v1; as escritas de §13
  // (enviar documentos, resolver na quarentena, apurar cobertura) aparecem
  // para quem age no módulo.
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const aba = params.aba === "importacoes" || params.aba === "cobertura" ? params.aba : "acervo";
      const chave = JSON.stringify(params);
      return <CascoDoMotor tela={tela} caminho="/fiscal/documentos" abas={[{ chave: "acervo", rotulo: "Acervo" }, { chave: "importacoes", rotulo: "Importações" }, { chave: "cobertura", rotulo: "Cobertura" }]} aba={aba} titulo="Documentos e importações" descricao="Acervo sincronizado, importações, quarentena e cobertura do motor SPED.">
        <Suspense key={chave} fallback={<CarregandoLeitura oQue={aba === "acervo" ? "o acervo" : aba === "importacoes" ? "as importações" : "a cobertura"} />}>
          {aba === "importacoes" ? <ImportacoesMotor tela={tela} params={params} /> : aba === "cobertura" ? <CoberturaMotor tela={tela} params={params} /> : <AcervoMotor tela={tela} params={params} />}
        </Suspense>
      </CascoDoMotor>;
    }
  }
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba && GRUPOS_ANTIGOS.includes(aba)) redirect(`/fiscal/documentos?aba=acervo&grupo=${aba}`);
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="documentos" /></Suspense>;
}
