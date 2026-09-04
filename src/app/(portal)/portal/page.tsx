import { redirect } from "next/navigation";
import { LogOut, FileText } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { alcanceDoCliente } from "../alcance";
import { listarDocumentos, competenciasDisponiveis } from "@/lib/fiscal/data";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalDocumentosTable } from "@/components/portal/PortalDocumentosTable";
import { PortalCompetenciaFiltro } from "@/components/portal/PortalCompetenciaFiltro";
import { sairDoPortal } from "./login/actions";

// Acervo fiscal visto pelo cliente. **Só leitura**, e por construção: não há
// entrada de XML nem decisão de destino aqui, e as actions que fazem essas
// coisas exigem setor interno — que nenhuma sessão de portal tem.
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const params = await searchParams;
  const alcance = await alcanceDoCliente(sessao);
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const filtro = { competencia: params.competencia || undefined };

  const prisma = getPrisma();
  const [{ documentos, total, porPagina }, competencias, grupo] = await Promise.all([
    listarDocumentos(alcance, filtro, pagina),
    competenciasDisponiveis(alcance),
    prisma.clientGroup.findUnique({ where: { id: sessao.clientGroupId }, select: { name: true } }),
  ]);

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <PageHeader title="Documentos Fiscais" />
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
            {grupo?.name ?? "Seus documentos"} · notas emitidas e recebidas pelas suas empresas.
          </p>
        </div>
        <form action={sairDoPortal}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[length:var(--fs-button)] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
          >
            <LogOut size={15} /> Sair
          </button>
        </form>
      </div>

      {total === 0 && !params.competencia ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="Nenhum documento ainda"
            description="Assim que houver notas das suas empresas, elas aparecem aqui. Se você espera ver algo, fale com o seu contato na 41."
          />
        </Card>
      ) : (
        <>
          <PortalCompetenciaFiltro competencias={competencias} />
          {documentos.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon={<FileText />}
                title="Nenhum documento nesta competência"
                description="Escolha outro mês."
              />
            </Card>
          ) : (
            <PortalDocumentosTable
              documentos={documentos}
              total={total}
              pagina={pagina}
              porPagina={porPagina}
              filtrosDaUrl={params}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}
