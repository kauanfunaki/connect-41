import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { comoTelaDoMotor, prepararTelaDoSped, type TelaDoSped } from "@/lib/fiscal/sped/tela";
import { arquivosDaCompetencia, carregarApuracao } from "@/lib/fiscal/sped/dados";
import { hrefDoSped } from "@/lib/fiscal/sped/etapas";
import { param } from "@/lib/fiscal/motor/url";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";
import type { ArquivoDoMotor } from "@/lib/sped/motor";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BotaoDeExportar } from "@/components/shared/BotaoDeExportar";
import { CascoDoSped } from "@/components/fiscal/sped/CascoDoSped";
import { SemMotor } from "@/components/fiscal/sped/SemMotor";
import { ArquivoDaEtapa } from "@/components/fiscal/sped/ArquivoDaEtapa";
import { ResumoDaApuracao, VistaDaApuracao, VistaDoLivro } from "@/components/fiscal/sped/ApuracaoDoSped";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { CarregandoLeituraPesada, ErroDaLeitura } from "@/components/fiscal/motor/LeituraDoMotor";

export const dynamic = "force-dynamic";

const VISTAS = [
  { chave: "apuracao", rotulo: "Apuração" },
  { chave: "livro", rotulo: "Livro fiscal" },
  { chave: "ajustes", rotulo: "Ajustes (E111)" },
] as const;
type Vista = (typeof VISTAS)[number]["chave"];
type Params = Record<string, string | string[] | undefined>;

/**
 * A Apuração do SPED (29/10/2026): o Connect lê o arquivo gerado e monta a
 * apuração do ICMS e o livro fiscal (o porte de `analise_apuracao` e
 * `demonstrativo_icms`). Os ajustes do E111 continuam sendo decisões do motor,
 * que entram na próxima geração. "Exportar" leva apuração e livro para o
 * Excel ou CSV.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  await abrirTelaDoModulo("fiscal_icms_ipi");
  const params = await searchParams;
  const tela = await prepararTelaDoSped(params, "apuracao");
  if (!tela) return <SemMotor />;
  const pedida = param(params, "vista") ?? param(params, "aba");
  const vista: Vista = VISTAS.find((v) => v.chave === pedida)?.chave ?? "apuracao";
  const recorte = { empresa: tela.estabelecimento?.companyId, competencia: tela.competencia };
  const exportar = tela.estabelecimento && <BotaoDeExportar href={`/fiscal/sped/apuracao/exportar?empresa=${recorte.empresa}&competencia=${recorte.competencia}`} dica="A apuração por CFOP, os ajustes e o livro fiscal do arquivo vigente." />;
  return <CascoDoSped tela={tela} acao={exportar}>
    <div className="space-y-5">
      <SegmentedControl<Vista> label="O que ver da apuração" active={vista} items={VISTAS.map((v) => ({ key: v.chave, label: v.rotulo, href: hrefDoSped("apuracao", recorte, { vista: v.chave === "apuracao" ? null : v.chave }) }))} />
      <Suspense key={`${tela.estabelecimento?.id}:${tela.competencia}:${vista}`} fallback={<CarregandoLeituraPesada oQue={vista === "ajustes" ? "os ajustes" : "a apuração do arquivo"} />}>
        {vista === "ajustes" ? <Ajustes tela={tela} params={params} /> : <Apuracao tela={tela} vista={vista} />}
      </Suspense>
    </div>
  </CascoDoSped>;
}

async function Apuracao({ tela, vista }: { tela: TelaDoSped; vista: Vista }) {
  const estab = tela.estabelecimento!;
  const aqui = hrefDoSped("apuracao", { empresa: estab.companyId, competencia: tela.competencia }, { vista: vista === "apuracao" ? null : vista });
  const arquivos = await arquivosDaCompetencia(tela, estab);
  return <ArquivoDaEtapa tela={tela} arquivos={arquivos} hrefDeNovo={aqui}>
    {(arquivo) => <DoArquivo tela={tela} arquivo={arquivo} vista={vista} aqui={aqui} />}
  </ArquivoDaEtapa>;
}

async function DoArquivo({ tela, arquivo, vista, aqui }: { tela: TelaDoSped; arquivo: ArquivoDoMotor; vista: Vista; aqui: string }) {
  const d = await carregarApuracao(tela, tela.estabelecimento!, arquivo);
  if (d.erro !== null) return <ErroDaLeitura falha={d} hrefDeNovo={aqui} />;
  return <div className="space-y-6">
    <ResumoDaApuracao apuracao={d.dados.apuracao} livro={d.dados.livro} />
    {vista === "livro" ? <VistaDoLivro livro={d.dados.livro} /> : <VistaDaApuracao apuracao={d.dados.apuracao} />}
  </div>;
}

/** Os ajustes gravados no motor para a competência — o que entra no E111 da próxima geração. */
async function Ajustes({ tela, params }: { tela: TelaDoSped; params: Params }) {
  const estab = tela.estabelecimento!;
  const [telaDoMotor, permissoes] = await Promise.all([comoTelaDoMotor(tela, estab), permissoesDeDecisao(tela.ctx, ["ajuste_apuracao"])]);
  return <div className="space-y-3">
    <p className="text-ui text-fg-secondary">Os ajustes lançados aqui entram no E111 na próxima geração do arquivo. A natureza (débito, crédito, estorno) sai do próprio código, pela tabela 5.1.1.</p>
    <DecisoesMotor tela={telaDoMotor} caminho="/fiscal/sped/apuracao" aba="ajustes" tipos={["ajuste_apuracao"]} params={params} permissoes={permissoes} />
  </div>;
}
