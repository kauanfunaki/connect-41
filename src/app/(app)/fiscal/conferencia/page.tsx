import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { Aviso } from "@/components/ui/Aviso";
import { CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { ConfrontoMotor, PreviaFinanceiraMotor } from "@/components/fiscal/motor/ConferenciaMotor";
import { CarregandoLeitura, ErroDaLeitura } from "@/components/fiscal/motor/LeituraDoMotor";
import { competenciasDaConferencia, contextoDaConferencia } from "@/lib/fiscal/motor/telas/conferencia";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_conferencia");
  const params = await searchParams;
  // Modo motor (API-CONNECT §11.4): tudo da raiz, por competência. Sem
  // competência na URL, vale a primeira que o motor tem documentos.
  if (await modoDoFiscal(ctx) === "motor") {
    const preparada = await prepararTelaDoMotor(params);
    if (preparada) {
      const competencias = preparada.contexto ? await competenciasDaConferencia(preparada) : null;
      const tela = preparada.contexto ? { ...preparada, contexto: contextoDaConferencia(preparada.contexto, params, competencias?.dados ?? null) } : preparada;
      const aba = params.aba === "confronto" ? "confronto" : "previa";
      return <CascoDoMotor tela={tela} caminho="/fiscal/conferencia" abas={[{ chave: "previa", rotulo: "Prévia financeira" }, { chave: "confronto", rotulo: "Confronto de documentos" }]} aba={aba} titulo="Conferência fiscal" descricao="Prévia financeira e confronto de documentos do motor SPED, por raiz." semEstabelecimento>
        {competencias && competencias.erro !== null && <div className="mb-5"><ErroDaLeitura falha={competencias} /></div>}
        {competencias?.dados && tela.contexto && !competencias.dados.includes(tela.contexto.competencia) && <div className="mb-5"><Aviso tom="neutro">O motor não tem documentos de {tela.contexto.competencia}{competencias.dados.length ? `; há de ${competencias.dados.slice(0, 6).join(", ")}${competencias.dados.length > 6 ? "…" : ""}` : ""}.</Aviso></div>}
        <Suspense key={JSON.stringify(params)} fallback={<CarregandoLeitura oQue={aba === "previa" ? "a prévia financeira" : "o confronto"} />}>
          {aba === "confronto" ? <ConfrontoMotor tela={tela} params={params} /> : <PreviaFinanceiraMotor tela={tela} params={params} />}
        </Suspense>
      </CascoDoMotor>;
    }
  }
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba === "depara" || aba === "lancamentos") redirect("/fiscal/conferencia?aba=previa");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="conferencia" /></Suspense>;
}
