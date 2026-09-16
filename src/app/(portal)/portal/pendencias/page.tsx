import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareWarning, Paperclip } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { listarPendencias } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO } from "@/lib/financeiro/pendencias/regras";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const RECORTES = [
  { chave: "andamento", rotulo: "Em andamento" },
  { chave: "encerradas", rotulo: "Encerradas" },
] as const;

/**
 * As pendências das empresas do cliente.
 *
 * Dois recortes só: para o cliente, a diferença entre "aguardando" e
 * "respondida" é a vez de quem, e isso o selo já diz linha a linha.
 */
export default async function PortalPendenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos, grupoNome } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_pendencias")) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "andamento";
  const { linhas, contadores } = await listarPendencias(escopo, { recorte }, new Date());

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Pendências"
        descricao="o que a equipe precisa de você para fechar o mês."
        grupoNome={grupoNome}
        ativo="pendencias"
        modulos={modulos}
        somenteLeitura={false}
      />

      <FaixaDeTotais
        itens={[
          { rotulo: "Aguardando você", valor: String(contadores.aguardando), tom: contadores.aguardando > 0 ? "text-warning" : "" },
          { rotulo: "Com a equipe", valor: String(contadores.respondidas) },
          { rotulo: "Vencidas", valor: String(contadores.vencidas), tom: contadores.vencidas > 0 ? "text-danger" : "" },
          { rotulo: "Encerradas", valor: String(contadores.encerradas), tom: "text-fg-muted" },
        ]}
      />

      <AbasDeLink
        abas={RECORTES.map((r) => ({
          chave: r.chave,
          rotulo: r.rotulo,
          href: r.chave === "andamento" ? "/portal/pendencias" : `/portal/pendencias?recorte=${r.chave}`,
        }))}
        ativa={recorte}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState icon={<MessageSquareWarning />} title="Nenhuma pendência aqui" description="Quando a equipe precisar de algo, o pedido aparece nesta tela e você recebe um e-mail." />
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Pendência</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">Prazo</th>
                <th className="py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-border-soft">
                  <td className="py-2.5 pr-3">
                    <Link href={`/portal/pendencias/${l.id}`} className="font-medium text-brand hover:underline">
                      {l.titulo}
                    </Link>
                    <span className="block text-[11px] text-fg-muted">
                      {ROTULO_DO_TIPO[l.tipo]}
                      {l.anexos > 0 && (
                        <>
                          {" "}
                          · <Paperclip size={10} className="inline" /> {l.anexos}
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">{l.empresaNome}</td>
                  <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{l.prazo ? formatInstantDate(l.prazo) : "—"}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeloDoStatus status={l.status} lado="CLIENTE" />
                      <SeloDoPrazo situacao={l.situacaoDoPrazo} status={l.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
