import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { ErroDaLeitura } from "@/components/fiscal/motor/LeituraDoMotor";
import type { ArquivoDoMotor } from "@/lib/sped/motor";
import type { Leitura } from "@/lib/fiscal/motor/leitura";
import { dataHora } from "@/lib/fiscal/motor/formato";
import type { ArquivosDaCompetencia } from "@/lib/fiscal/sped/dados";
import { hrefDoSped } from "@/lib/fiscal/sped/etapas";
import { mesPorExtenso } from "@/lib/fiscal/sped/formato";
import type { TelaDoSped } from "@/lib/fiscal/sped/tela";

/**
 * O arquivo sobre o qual a etapa trabalha (Classificação e Apuração leem o
 * arquivo gerado): uma linha só, com a versão e, quando há decisão gravada
 * depois da geração, o atalho para gerar de novo. Sem arquivo, a etapa
 * explica por que precisa de um e leva a Gerar SPED.
 */
export function ArquivoDaEtapa({ tela, arquivos, hrefDeNovo, children }: {
  tela: TelaDoSped;
  arquivos: Leitura<ArquivosDaCompetencia>;
  hrefDeNovo: string;
  children: (arquivo: ArquivoDoMotor) => ReactNode;
}) {
  const recorte = { empresa: tela.estabelecimento?.companyId, competencia: tela.competencia };
  if (arquivos.erro !== null) return <ErroDaLeitura falha={arquivos} hrefDeNovo={hrefDeNovo} />;
  const arquivo = arquivos.dados.vigente;
  if (!arquivo) {
    return <Card>
      <EmptyState
        icon={<FileText />}
        title={`Ainda não há arquivo de ${mesPorExtenso(tela.competencia)}`}
        description="A classificação e a apuração são lidas do arquivo que o motor gera. Gere uma primeira versão; depois de decidir, gere de novo para o arquivo levar as decisões."
        action={tela.etapas.includes("gerar") ? <Button href={hrefDoSped("gerar", recorte)}>Ir para Gerar SPED</Button> : undefined}
      />
    </Card>;
  }
  const outras = arquivos.dados.versoes.length - 1;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ui text-fg-secondary">
      <FileText size={15} aria-hidden className="text-fg-muted" />
      <span>Lido do arquivo <strong className="font-semibold text-fg">versão {arquivo.versao}</strong>, gerado em {dataHora(arquivo.gerado_em)}{outras > 0 ? ` · ${outras} versão(ões) anterior(es)` : ""}</span>
      {arquivo.defasado
        ? <>
          <Selo tom="atencao">{arquivo.decisoes_posteriores ? `${arquivo.decisoes_posteriores} decisão(ões) depois desta geração` : "Há decisões depois desta geração"}</Selo>
          {tela.etapas.includes("gerar") && <Button size="xs" variant="secondary" href={hrefDoSped("gerar", recorte)}>Gerar de novo</Button>}
        </>
        : <Selo tom="sucesso">Em dia com as decisões</Selo>}
    </div>
    {children(arquivo)}
  </div>;
}
