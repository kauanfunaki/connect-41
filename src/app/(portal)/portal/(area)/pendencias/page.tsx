import Link from "next/link";
import { notFound } from "next/navigation";
import { Hourglass, MessagesSquare, AlertTriangle, CheckCircle2, MessageSquareWarning, Paperclip } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { listarPendencias } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_STATUS, ROTULO_DO_TIPO, type StatusDaPendencia } from "@/lib/financeiro/pendencias/regras";
import { pedidosAoClienteNoConjunto, setorDaPendencia, setorPadraoDasPendencias } from "@/lib/financeiro/pendencias/setor";
import { getSectorMaps } from "@/lib/sectors";
import { formatInstantDate } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

export const dynamic = "force-dynamic";

const RECORTES = [
  { chave: "andamento", rotulo: "Em andamento" },
  { chave: "encerradas", rotulo: "Encerradas" },
] as const;

/** O rótulo que o `SeloDoStatus` mostra ao cliente — o funil oferece o mesmo texto. */
function rotuloDoStatus(status: StatusDaPendencia): string {
  if (status === "ABERTA") return "Aguardando você";
  if (status === "RESPONDIDA") return "Com a equipe";
  return ROTULO_DO_STATUS[status];
}

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
      <CascoDaTabela
        contagem={contarItens(linhas.length, "pendência", "pendências")}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[{ chave: "recorte", rotulo: "Situação", vazioLabel: "Em andamento", opcoes: [{ value: "encerradas", label: "Encerradas" }] }]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState icon={<MessageSquareWarning />} title="Nenhuma pendência aqui" description="Quando a equipe precisar de algo, o pedido aparece nesta tela e você recebe um e-mail." />
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

          {/* Funil nas colunas (02/10): a lista vem inteira (até 500), então
              filtra no navegador. Pendência filtra pelo tipo e pelo setor, que
              é o que a segunda linha da célula mostra. */}
          <TabelaFiltravel
            linhas={linhas.map((l) => ({
              id: l.id,
              valores: {
                tipo: ROTULO_DO_TIPO[l.tipo],
                setor: setorDe(l.setor),
                empresa: l.empresaNome,
                prazo: l.prazo ? saoPauloParts(l.prazo).dateKey : "",
                situacao: rotuloDoStatus(l.status),
              },
            }))}
          >
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">
                    <FiltroDaColuna
                      rotulo="Pendência"
                      campos={[
                        { chave: "tipo", rotulo: "Tipo" },
                        { chave: "setor", rotulo: "Setor" },
                      ]}
                    />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <FiltroDaColuna rotulo="Prazo" chave="prazo" tipo="data" />
                  </th>
                  <th className="py-2 font-medium">
                    <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border-soft">
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
                  </LinhaFiltravel>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
          </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
