import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { NavegadorDeArquivos } from "@/components/arquivos/NavegadorDeArquivos";
import { buscarNoDrive, destinosDaEmpresa, empresaDoDrive, navegadorDaEquipe, pastaDeEnviados } from "@/lib/drive/servidor";
import { anexosDoConnect } from "@/lib/drive/doConnect";
import { enderecoDaPasta, trilhaDaPasta } from "@/lib/drive/tela";
import { PastaDoConnect } from "@/components/arquivos/PastaDoConnect";
import { abrirArquivos } from "../../acesso";

/**
 * Os Arquivos de uma empresa (09/10/2026): as pastas do modelo, "Enviados pelo
 * cliente" e o que a equipe criar. `?pasta=` abre uma pasta; `?pasta=enviados`
 * é o atalho do aviso de arquivo novo do cliente; `?busca=` procura pelo nome
 * em todas as pastas da empresa.
 */
export default async function ArquivosDaEmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pasta?: string; busca?: string }>;
}) {
  const ctx = await abrirArquivos();
  const { id } = await params;
  const { pasta, busca } = await searchParams;

  // "Do Connect": os anexos dos módulos, só leitura, por origem.
  if (pasta === "do-connect" && !busca) {
    const empresa = await empresaDoDrive(ctx.tenantId, id);
    if (!empresa) notFound();
    const [grupos, destinos] = await Promise.all([anexosDoConnect(ctx, id), destinosDaEmpresa(ctx, id)]);
    return (
      <PageContainer>
        <Breadcrumb
          items={[
            { label: "Arquivos", href: "/arquivos" },
            { label: empresa.nome, href: enderecoDaPasta(`/arquivos/empresa/${id}`, null), truncate: true },
            { label: "Do Connect" },
          ]}
        />
        <PageHeader
          title={empresa.nome}
          subtitle="Arquivos da empresa. O que estiver numa pasta compartilhada aparece no portal do cliente."
          action={
            <Button href={`/empresas/${id}`} variant="secondary" size="sm">
              <Building2 size={14} /> Ficha da empresa
            </Button>
          }
        />
        <PastaDoConnect grupos={grupos} destinos={destinos ?? []} />
      </PageContainer>
    );
  }

  const pastaId = pasta === "enviados" ? await pastaDeEnviados(ctx.tenantId, id).catch(() => null) : pasta || null;
  const [dados, resultados] = await Promise.all([
    navegadorDaEquipe(ctx, id, busca ? null : pastaId),
    busca ? buscarNoDrive(ctx, id, busca) : Promise.resolve(null),
  ]);
  if (!dados?.empresa) notFound();

  const base = `/arquivos/empresa/${id}`;
  return (
    <PageContainer>
      {/* A trilha acima do título, começando em Arquivos (P04, 15/10/2026): ficava
          embaixo dele, ao lado da busca, e começava na pasta raiz. */}
      <Breadcrumb items={[{ label: "Arquivos", href: "/arquivos" }, ...trilhaDaPasta(dados, base, dados.empresa.nome)]} />
      <PageHeader
        title={dados.empresa.nome}
        subtitle="Arquivos da empresa. O que estiver numa pasta compartilhada aparece no portal do cliente."
        action={
          <Button href={`/empresas/${id}`} variant="secondary" size="sm">
            <Building2 size={14} /> Ficha da empresa
          </Button>
        }
      />
      <NavegadorDeArquivos
        dados={dados}
        base={base}
        rotuloDaRaiz="Pastas da empresa"
        trilhaNoCabecalho
        busca={busca ? { termo: busca, resultados: resultados ?? [] } : null}
      />
    </PageContainer>
  );
}
