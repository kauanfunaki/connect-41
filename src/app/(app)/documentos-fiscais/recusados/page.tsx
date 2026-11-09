import { notFound } from "next/navigation";
import { FileX2, MapPin, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { RecusasPorMunicipio, UltimasRecusas } from "@/components/fiscal/RecusasDeXml";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { resumoDasRecusas, DIAS_DO_RESUMO } from "@/lib/fiscal/recusasServidor";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const INTEIRO = new Intl.NumberFormat("pt-BR");

// XML recusados (06/11/2026) — o passo 1 da NFS-e fora do ABRASF e do padrão
// nacional: medir antes de construir. A recusa era o veredito na tela e mais
// nada; agora fica guardada, e esta tela diz quantas são e de quais municípios.
// A leitura desses arquivos vem no passo seguinte, com IA e revisão.
export default async function XmlRecusadosPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const resumo = await resumoDasRecusas(ctx.tenantId);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Documentos fiscais", href: "/documentos-fiscais" }, { label: "XML recusados" }]} />
      <PageHeader
        title="XML recusados"
        subtitle={`Arquivos que o leitor não conseguiu ler nos últimos ${DIAS_DO_RESUMO} dias, pela entrada de XML ou pela importação do SPED. Ficam guardados para medir quais municípios fogem do ABRASF e do padrão nacional.`}
        action={
          <Button href="/documentos-fiscais/entrada" variant="secondary">
            Entrada de XML
          </Button>
        }
      />

      {resumo.arquivos === 0 ? (
        <Card>
          <EmptyState
            icon={<FileX2 />}
            title={`Nenhum XML recusado nos últimos ${DIAS_DO_RESUMO} dias`}
            description="Quando a entrada de XML ou a importação do SPED recusar um arquivo, ele aparece aqui, com o motivo e o município."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <FaixaDeTotais
            itens={[
              { rotulo: "Arquivos recusados", valor: INTEIRO.format(resumo.arquivos), icone: <FileX2 /> },
              { rotulo: "Prováveis NFS-e", valor: INTEIRO.format(resumo.nfse), icone: <ReceiptText />, detalhe: "fora do ABRASF e do nacional" },
              { rotulo: "Municípios", valor: INTEIRO.format(resumo.municipios), icone: <MapPin />, detalhe: "com NFS-e recusada" },
            ]}
          />

          <section aria-labelledby="por-municipio">
            <h2 id="por-municipio" className="text-section font-semibold text-fg mb-2">NFS-e por município</h2>
            <CascoDaTabela contagem={contarItens(resumo.porMunicipio.length, "município", "municípios")}>
              {resumo.porMunicipio.length === 0 ? (
                <EmptyState
                  icon={<MapPin />}
                  title="Nenhuma NFS-e entre os recusados"
                  description="Os arquivos recusados no período são de outros tipos. A lista abaixo mostra cada um."
                />
              ) : (
                <RecusasPorMunicipio linhas={resumo.porMunicipio} />
              )}
            </CascoDaTabela>
          </section>

          <section aria-labelledby="ultimas">
            <h2 id="ultimas" className="text-section font-semibold text-fg mb-2">Últimas recusas</h2>
            <CascoDaTabela contagem={contarItens(resumo.ultimas.length, "arquivo", "arquivos")}>
              <UltimasRecusas linhas={resumo.ultimas} />
            </CascoDaTabela>
          </section>
        </div>
      )}
    </PageContainer>
  );
}
