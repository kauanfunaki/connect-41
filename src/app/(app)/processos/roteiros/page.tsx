import { notFound } from "next/navigation";
import { ListOrdered } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { listarRoteiros } from "@/lib/societario/roteirosServidor";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODULE = "societario_processos";

/**
 * Os roteiros dos tipos de processo (09/11/2026): um tipo por linha, com a
 * versão em vigor, e o botão que abre o editor. Era só por script.
 *
 * É da coordenação ("gerir" no módulo de processos): para quem só toca
 * processo, a tela responde como rota que não existe, igual às outras telas
 * de configuração por módulo.
 */
export default async function RoteirosPage() {
  const { ctx } = await abrirTelaDoModulo(MODULE);
  if (!(await podeNoModulo(ctx, MODULE, "gerir"))) notFound();
  const tipos = await listarRoteiros(ctx.tenantId);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Processos", href: "/processos" }, { label: "Roteiros" }]} />
      <PageHeader
        title="Roteiros dos processos"
        subtitle="As etapas, os órgãos e o checklist que cada tipo de processo segue. Publicar um roteiro cria uma versão nova para os processos abertos daqui em diante — os que estão em andamento continuam na versão em que começaram."
      />

      <Card as="section" aria-labelledby="tabela-roteiros" className="p-4 flex flex-col gap-3">
        <h2 id="tabela-roteiros" className="sr-only">
          Tipos de processo
        </h2>
        {tipos.length === 0 ? (
          <EmptyState
            icon={<ListOrdered />}
            title="Nenhum tipo de processo"
            description="Os tipos e os roteiros padrão entram na configuração do Societário. Peça à 41 Tech para incluir os tipos do escritório."
          />
        ) : (
          <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  {["Tipo de processo", "Versão em vigor", "Etapas", "Publicada", "Em andamento", ""].map((c, i) => (
                    <th key={i} className="px-3 py-2">
                      {c || <span className="sr-only">Ações</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.id} className="border-b border-border-soft tabular-nums">
                    <td className="px-3 py-2">
                      <span className="inline-flex flex-wrap items-center justify-center gap-2">
                        <span className="font-semibold text-fg">{t.nome}</span>
                        {!t.ativo && <Selo tom="neutro">Inativo</Selo>}
                      </span>
                    </td>
                    <td className="px-3 py-2">{t.versao ? `Versão ${t.versao.numero}` : <Selo tom="atencao">Sem roteiro</Selo>}</td>
                    <td className="px-3 py-2">{t.versao ? t.versao.etapas : "—"}</td>
                    <td className="px-3 py-2">
                      {t.versao ? (
                        <span className="flex flex-col">
                          <span>{formatInstantDate(t.versao.publicadaEm)}</span>
                          <span className="text-fs-2 text-fg-muted">{t.versao.autor ? `por ${t.versao.autor}` : "gravada fora da tela"}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{t.emAndamento}</td>
                    <td className="px-3 py-2">
                      <Button href={`/processos/roteiros/${t.id}`} variant="secondary" size="xs">
                        {t.versao ? "Editar roteiro" : "Montar roteiro"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
