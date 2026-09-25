import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
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

      <AbasDeLink
        abas={RECORTES.map((r) => ({
          chave: r.chave,
          rotulo: r.rotulo,
          href: r.chave === "abertas" ? "/portal/exigencias" : `/portal/exigencias?recorte=${r.chave}`,
        }))}
        ativa={recorte}
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
        <ul className="flex flex-col gap-2">
          {linhas.map((e) => (
            <li key={e.id}>
              <Card className="p-4 flex flex-col gap-1">
                <span className={`text-[12px] font-semibold ${e.resolvidaEm ? "text-fg-muted" : "text-warning"}`}>{e.orgao}</span>
                <p className="text-[13px] text-fg whitespace-pre-line break-words">{e.descricao}</p>
                <span className="text-[12px] text-fg-muted">
                  <Link href={`/portal/processos/${e.processoId}`} className="text-brand hover:underline">
                    {e.processoNome}
                  </Link>
                  {` · pedida em ${formatInstantDate(e.abertaEm)}`}
                  {e.resolvidaEm
                    ? ` · resolvida em ${formatInstantDate(e.resolvidaEm)}`
                    : e.prazo
                      ? ` · prazo do órgão ${formatInstantDate(e.prazo)}`
                      : ""}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
