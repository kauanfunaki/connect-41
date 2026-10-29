import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { prepararTelaDoSped, type TelaDoSped } from "@/lib/fiscal/sped/tela";
import { arquivosDaCompetencia, carregarClassificacao } from "@/lib/fiscal/sped/dados";
import { hrefDoSped } from "@/lib/fiscal/sped/etapas";
import { escritaNaTela } from "@/lib/fiscal/motor/permissoes";
import { CascoDoSped } from "@/components/fiscal/sped/CascoDoSped";
import { SemMotor } from "@/components/fiscal/sped/SemMotor";
import { ArquivoDaEtapa } from "@/components/fiscal/sped/ArquivoDaEtapa";
import { PainelDeClassificacao } from "@/components/fiscal/sped/PainelDeClassificacao";
import { Aviso } from "@/components/ui/Aviso";
import { CarregandoLeituraPesada, ErroDaLeitura } from "@/components/fiscal/motor/LeituraDoMotor";
import type { ArquivoDoMotor } from "@/lib/sped/motor";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await abrirTelaDoModulo("fiscal_classificacao");
  const tela = await prepararTelaDoSped(await searchParams, "classificacao");
  if (!tela) return <SemMotor />;
  return <CascoDoSped tela={tela}>
    <Suspense key={`${tela.estabelecimento?.id}:${tela.competencia}`} fallback={<CarregandoLeituraPesada oQue="os produtos do arquivo" />}>
      <Classificacao tela={tela} />
    </Suspense>
  </CascoDoSped>;
}

async function Classificacao({ tela }: { tela: TelaDoSped }) {
  const estab = tela.estabelecimento!;
  const aqui = hrefDoSped("classificacao", { empresa: estab.companyId, competencia: tela.competencia });
  const [arquivos, permissao] = await Promise.all([arquivosDaCompetencia(tela, estab), escritaNaTela(tela.ctx, tela.motor, "fiscal_classificacao")]);
  return <ArquivoDaEtapa tela={tela} arquivos={arquivos} hrefDeNovo={aqui}>
    {(arquivo) => <ProdutosDoArquivo tela={tela} arquivo={arquivo} permissao={permissao} aqui={aqui} />}
  </ArquivoDaEtapa>;
}

async function ProdutosDoArquivo({ tela, arquivo, permissao, aqui }: { tela: TelaDoSped; arquivo: ArquivoDoMotor; permissao: Awaited<ReturnType<typeof escritaNaTela>>; aqui: string }) {
  const estab = tela.estabelecimento!;
  const d = await carregarClassificacao(tela, estab, arquivo);
  if (d.erro !== null) return <ErroDaLeitura falha={d} hrefDeNovo={aqui} />;
  return <div className="space-y-4">
    {d.dados.decisoesTruncadas && <Aviso tom="atencao">O motor tem mais decisões do que o Connect leu de uma vez. Alguns produtos podem aparecer como “a decidir” mesmo já decididos.</Aviso>}
    <PainelDeClassificacao raiz={estab.raiz} cnpjEmpresa={estab.cnpj} competencia={tela.competencia} produtos={d.dados.produtos} porCfop={d.dados.leitura.porCfop} permissao={permissao} />
  </div>;
}
