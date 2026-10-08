import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { CartaoDeLista } from "@/components/portal/CartaoDeLista";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { exigenciasDoPortal } from "@/lib/societario/portal-data";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const RECORTES = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "resolvidas", rotulo: "Resolvidas" },
] as const;

/**
 * As exigências dos órgãos em todos os processos do cliente. Quem resolve é a
 * equipe; a tela existe para o cliente saber por que o processo parou e, se a
 * exigência depender dele, já ter lido antes de a equipe pedir.
 */
export default async function PortalExigenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("societario_processos")) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "abertas";
  const linhas = await exigenciasDoPortal(sessao.tenantId, escopo.companyIds ?? [], recorte === "abertas");

  return (
    <PageContainer>
      <PortalCabecalho titulo="Exigências" descricao="O que os órgãos pediram nos processos das suas empresas." />

      {/* Abertas/resolvidas é filtro da mesma lista: mora no "Filtros"
          (regra da conferência de 30/09). */}
      <FiltrosDaTela
        className="mb-4"
        campos={[{ chave: "recorte", rotulo: "Situação", vazioLabel: "Abertas", opcoes: [{ value: "resolvidas", label: "Resolvidas" }] }]}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TriangleAlert />}
            title={recorte === "abertas" ? "Nenhuma exigência aberta" : "Nenhuma exigência resolvida"}
            description="Quando um órgão pedir ajuste num processo, o pedido aparece aqui."
          />
        </Card>
      ) : (
        // O cartão inteiro abre o processo da exigência (07/10/2026): era um
        // link no meio da linha de apoio, um alvo do tamanho do nome.
        <ul className="flex flex-col gap-2.5">
          {linhas.map((e) => (
            <li key={e.id}>
              <CartaoDeLista
                href={`/portal/processos/${e.processoId}`}
                sobretitulo={<span className={e.resolvidaEm ? undefined : "text-warning-fg"}>{e.orgao}</span>}
                titulo={e.processoNome}
                corpo={e.descricao}
                apoio={
                  <span>
                    {`pedida em ${formatInstantDate(e.abertaEm)}`}
                    {e.resolvidaEm
                      ? ` · resolvida em ${formatInstantDate(e.resolvidaEm)}`
                      : e.prazo
                        ? ` · prazo do órgão ${formatInstantDate(e.prazo)}`
                        : ""}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
