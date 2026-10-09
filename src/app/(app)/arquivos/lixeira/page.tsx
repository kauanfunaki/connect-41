import { Trash2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { lixeiraDaEquipe } from "@/lib/drive/servidor";
import { DIAS_NA_LIXEIRA } from "@/lib/drive/regras";
import { ListaDaLixeira } from "@/components/arquivos/ListaDaLixeira";
import { abrirArquivos } from "../acesso";

/** A lixeira dos Arquivos (09/10/2026): o que foi excluído nos últimos 30 dias, de todas as empresas e das internas. */
export default async function LixeiraDosArquivosPage() {
  const ctx = await abrirArquivos();
  const itens = await lixeiraDaEquipe(ctx);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Arquivos", href: "/arquivos" }, { label: "Lixeira" }]} />
      <PageHeader
        title="Lixeira"
        subtitle={`O que foi excluído dos Arquivos fica aqui por ${DIAS_NA_LIXEIRA} dias e depois some de vez. Restaurar devolve ao lugar de onde saiu.`}
      />
      {itens.length === 0 ? (
        <EmptyState icon={<Trash2 />} title="Lixeira vazia" description="Nada foi excluído nos últimos 30 dias." />
      ) : (
        <ListaDaLixeira itens={itens} />
      )}
    </PageContainer>
  );
}
