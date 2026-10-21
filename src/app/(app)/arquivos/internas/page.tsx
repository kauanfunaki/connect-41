import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { NavegadorDeArquivos } from "@/components/arquivos/NavegadorDeArquivos";
import { buscarNoDrive, navegadorDaEquipe } from "@/lib/drive/servidor";
import { trilhaDaPasta } from "@/lib/drive/tela";
import { abrirArquivos } from "../acesso";

/**
 * As pastas do escritório que não são de nenhuma empresa (09/10/2026): modelos,
 * manuais, contratos da casa. Nunca vão para o portal; uma pasta de setor só o
 * setor vê, como nas empresas.
 */
export default async function PastasDoEscritorioPage({ searchParams }: { searchParams: Promise<{ pasta?: string; busca?: string }> }) {
  const ctx = await abrirArquivos();
  const { pasta, busca } = await searchParams;
  const [dados, resultados] = await Promise.all([
    navegadorDaEquipe(ctx, null, busca ? null : pasta || null),
    busca ? buscarNoDrive(ctx, null, busca) : Promise.resolve(null),
  ]);
  if (!dados) notFound();

  return (
    <PageContainer>
      {/* A trilha acima do título, começando em Arquivos (P04, 15/10/2026): ficava
          embaixo dele, ao lado da busca, e começava na pasta raiz. */}
      <Breadcrumb items={[{ label: "Arquivos", href: "/arquivos" }, ...trilhaDaPasta(dados, "/arquivos/internas", "Pastas do escritório")]} />
      <PageHeader title="Pastas do escritório" subtitle="Arquivos da casa, fora das empresas. Não aparecem no portal do cliente." />
      <NavegadorDeArquivos
        dados={dados}
        base="/arquivos/internas"
        rotuloDaRaiz="Pastas do escritório"
        trilhaNoCabecalho
        busca={busca ? { termo: busca, resultados: resultados ?? [] } : null}
      />
    </PageContainer>
  );
}
