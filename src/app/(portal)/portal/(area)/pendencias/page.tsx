import Link from "next/link";
import { notFound } from "next/navigation";
import { Hourglass, MessagesSquare, AlertTriangle, CheckCircle2, MessageSquareWarning, Paperclip } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { listarPendencias } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO } from "@/lib/financeiro/pendencias/regras";
import { pedidosAoClienteNoConjunto, setorDaPendencia, setorPadraoDasPendencias } from "@/lib/financeiro/pendencias/setor";
import { getSectorMaps } from "@/lib/sectors";
import { formatInstantDate } from "@/lib/format";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";

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
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!pedidosAoClienteNoConjunto(modulos)) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "andamento";
  const [{ linhas, contadores }, padrao, { labels }] = await Promise.all([
    listarPendencias(escopo, { recorte }, new Date()),
    setorPadraoDasPendencias(escopo.tenantId),
    getSectorMaps(escopo.tenantId),
  ]);
  // Quem pediu, para o cliente saber com que parte da 41 está falando (01/10:
  // qualquer setor pede).
  const setorDe = (s: string | null) => labels[setorDaPendencia(s, padrao)] ?? setorDaPendencia(s, padrao);

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Pendências"
        descricao="O que a equipe precisa de você para fechar o mês."
        somenteLeitura={false}
      />

      {/* Os números levam ao recorte que contam, e o recorte mora no
          "Filtros" — as abas "Em andamento | Encerradas" eram filtro da mesma
          lista (regra da conferência de 30/09, que vale também aqui). */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Aguardando você",
            valor: String(contadores.aguardando),
            tom: contadores.aguardando > 0 ? "text-warning" : "",
            icone: <Hourglass />,
            href: "/portal/pendencias",
          },
          { rotulo: "Com a equipe", valor: String(contadores.respondidas), icone: <MessagesSquare />, href: "/portal/pendencias" },
          {
            rotulo: "Vencidas",
            valor: String(contadores.vencidas),
            tom: contadores.vencidas > 0 ? "text-danger" : "",
            icone: <AlertTriangle />,
            href: "/portal/pendencias",
          },
          {
            rotulo: "Encerradas",
            valor: String(contadores.encerradas),
            tom: "text-fg-muted",
            icone: <CheckCircle2 />,
            detalhe: recorte === "encerradas" ? "mostrando agora" : undefined,
            href: "/portal/pendencias?recorte=encerradas",
          },
        ]}
      />
      <FiltrosDaTela
        className="mb-4"
        campos={[{ chave: "recorte", rotulo: "Situação", vazioLabel: "Em andamento", opcoes: [{ value: "encerradas", label: "Encerradas" }] }]}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState icon={<MessageSquareWarning />} title="Nenhuma pendência aqui" description="Quando a equipe precisar de algo, o pedido aparece nesta tela e você recebe um e-mail." />
        </Card>
      ) : (
        <>
        {/* Abaixo de md, cartões: o cliente lê isto no celular, e o que importa
            é o título e o prazo — não a quarta coluna de uma tabela de 720px. */}
        <CartoesNoCelular>
          {linhas.map((l) => (
            <Cartao key={l.id}>
              <Link href={`/portal/pendencias/${l.id}`} className="font-medium text-brand hover:underline break-words">
                {l.titulo}
              </Link>
              <InfoDoCartao className="mt-0.5">
                {ROTULO_DO_TIPO[l.tipo]} · {setorDe(l.setor)} · {l.empresaNome}
                {l.anexos > 0 && (
                  <>
                    {" · "}
                    <Paperclip size={10} className="inline" /> {l.anexos}
                  </>
                )}
              </InfoDoCartao>
              <InfoDoCartao className="tabular-nums">
                {l.prazo ? `prazo ${formatInstantDate(l.prazo)}` : "sem prazo"}
              </InfoDoCartao>
              <PeDoCartao>
                <SeloDoStatus status={l.status} lado="CLIENTE" />
                <SeloDoPrazo situacao={l.situacaoDoPrazo} status={l.status} />
              </PeDoCartao>
            </Cartao>
          ))}
        </CartoesNoCelular>

        <TabelaNoDesktop padrao>
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
                      {ROTULO_DO_TIPO[l.tipo]} · {setorDe(l.setor)}
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
        </TabelaNoDesktop>
        </>
      )}
    </PageContainer>
  );
}
