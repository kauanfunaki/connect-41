import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Hourglass, MessageCircleReply, MessageSquareWarning, Paperclip } from "lucide-react";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors, getSectorMaps } from "@/lib/sectors";
import { formatInstantDate } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { NovaPendencia } from "@/components/pendencias/NovaPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { AbasDoAtendimento } from "@/components/solicitacoes/AbasDoAtendimento";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { listarPendencias, RECORTES_DE_PENDENCIA, type RecorteDePendencia } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_PRAZO, ROTULO_DO_STATUS, ROTULO_DO_TIPO } from "@/lib/financeiro/pendencias/regras";
import { dosSetores, setorDaPendencia, setorPadraoDasPendencias, MODULO_DO_CANAL } from "@/lib/financeiro/pendencias/setor";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

export const dynamic = "force-dynamic";

/**
 * Pedidos da 41 ao cliente, de todos os setores da pessoa (01/10).
 *
 * São as mesmas pendências do BPO — o cliente vê, responde e é lembrado do
 * mesmo jeito —, agora pedidas por qualquer setor. A tela do BPO (/pendencias)
 * continua mostrando só as do BPO; aqui fica o conjunto, com o setor de cada uma.
 */
export default async function PedidosAoClientePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, MODULO_DO_CANAL))) notFound();

  const params = await searchParams;
  const recorte: RecorteDePendencia = RECORTES_DE_PENDENCIA.find((r) => r.chave === params.recorte)?.chave ?? "andamento";
  const vencidas = params.vencidas === "1";
  const setoresDaPessoa = setoresDaFila(ctx);
  const [empresas, ativos, { labels }, padrao] = await Promise.all([
    empresasDoSeletor(ctx.tenantId),
    getActiveSectors(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    setorPadraoDasPendencias(ctx.tenantId),
  ]);
  const opcoesDeSetor = ativos.filter((s) => setoresDaPessoa === null || setoresDaPessoa.includes(s.code));
  const setor = params.setor && opcoesDeSetor.some((s) => s.code === params.setor) ? params.setor : null;
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;
  const podePedirEm = opcoesDeSetor.filter((s) => canActOnSector(ctx, s.code)).map((s) => ({ code: s.code, label: s.label }));
  const agora = new Date();

  const codigos = setor ? [setor] : opcoesDeSetor.map((s) => s.code);
  const { linhas, contadores, limitado } = await listarPendencias(
    { tenantId: ctx.tenantId, companyIds: null, setores: dosSetores(codigos, padrao) },
    { recorte, empresaId, vencidas },
    agora
  );
  const nomeDoSetor = (s: string | null) => labels[setorDaPendencia(s, padrao)] ?? setorDaPendencia(s, padrao);

  function href(mudancas: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = {
      recorte: recorte === "andamento" ? undefined : recorte,
      setor: setor ?? undefined,
      empresa: empresaId ?? undefined,
      vencidas: vencidas ? "1" : undefined,
      ...mudancas,
    };
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/solicitacoes/pedidos?${s}` : "/solicitacoes/pedidos";
  }

  return (
    <PageContainer>
      <PageHeader
        title="Pedidos ao cliente"
        subtitle="O que a 41 pede aos clientes — documento, informação ou confirmação —, de todos os seus setores. O cliente responde pelo portal e é lembrado se o prazo passar."
        action={podePedirEm.length > 0 ? <NovaPendencia empresas={empresas} setores={podePedirEm} /> : undefined}
      />

      <AbasDoAtendimento ativa="pedidos" />

      <div>
        <FaixaDeTotais
          itens={[
            {
              rotulo: "Aguardando cliente",
              valor: String(contadores.aguardando),
              icone: <Hourglass />,
              href: href({ recorte: "aguardando", vencidas: undefined }),
            },
            {
              rotulo: "Respondidas",
              valor: String(contadores.respondidas),
              tom: contadores.respondidas > 0 ? "text-brand" : "",
              icone: <MessageCircleReply />,
              href: href({ recorte: "respondidas", vencidas: undefined }),
            },
            {
              rotulo: "Vencidas",
              valor: String(contadores.vencidas),
              tom: contadores.vencidas > 0 ? "text-danger" : "",
              icone: <AlertTriangle />,
              href: href({ recorte: undefined, vencidas: "1" }),
            },
            {
              rotulo: "Encerradas",
              valor: String(contadores.encerradas),
              tom: "text-fg-muted",
              icone: <CheckCircle2 />,
              href: href({ recorte: "encerradas", vencidas: undefined }),
            },
          ]}
        />
      </div>

      <CascoDaTabela
        contagem={contarItens(linhas.length, "pedido", "pedidos", limitado)}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "recorte",
                rotulo: "Situação",
                vazioLabel: "Em andamento",
                opcoes: RECORTES_DE_PENDENCIA.filter((r) => r.chave !== "andamento").map((r) => ({ value: r.chave, label: r.rotulo })),
              },
              { chave: "setor", rotulo: "Setor", vazioLabel: "Todos os meus setores", opcoes: opcoesDeSetor.map((s) => ({ value: s.code, label: s.label })) },
              { chave: "empresa", rotulo: "Empresa", vazioLabel: "Todas", opcoes: empresas.map((e) => ({ value: e.id, label: e.nome })) },
              { chave: "vencidas", rotulo: "Prazo", vazioLabel: "Todos os prazos", opcoes: [{ value: "1", label: "Só vencidas" }] },
            ]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning />}
            title="Nenhum pedido neste recorte"
            description={
              podePedirEm.length > 0
                ? "Quando precisar de algo do cliente — um documento, uma informação —, peça por aqui. Ele responde pelo portal, sem WhatsApp."
                : undefined
            }
          />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((l) => (
                <Cartao key={l.id}>
                  <Link href={`/pendencias/${l.id}`} className="font-medium text-brand hover:underline break-words">
                    {l.titulo}
                  </Link>
                  <InfoDoCartao className="mt-0.5 break-words">
                    {ROTULO_DO_TIPO[l.tipo]} · {nomeDoSetor(l.setor)} · {l.empresaNome}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    prazo {l.prazo ? formatInstantDate(l.prazo) : "—"} · atualizada {formatInstantDate(l.atualizadaEm)}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <SeloDoStatus status={l.status} lado="EQUIPE" />
                    <SeloDoPrazo situacao={l.situacaoDoPrazo} status={l.status} />
                  </PeDoCartao>
                </Cartao>
              ))}
              {limitado && <p className="text-[11px] text-fg-muted mt-1">Mostrando os 500 primeiros. Filtre por setor ou empresa para ver o resto.</p>}
            </CartoesNoCelular>

            <TabelaFiltravel
              linhas={linhas.map((l) => ({
                id: l.id,
                valores: {
                  tipo: ROTULO_DO_TIPO[l.tipo],
                  setor: nomeDoSetor(l.setor),
                  empresa: l.empresaNome,
                  prazo: l.prazo ? saoPauloParts(l.prazo).dateKey : "",
                  status: ROTULO_DO_STATUS[l.status],
                  situacaoDoPrazo: ROTULO_DO_PRAZO[l.situacaoDoPrazo],
                  atualizada: saoPauloParts(l.atualizadaEm).dateKey,
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[920px] text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Pedido" campos={[{ chave: "tipo", rotulo: "Tipo" }]} />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Setor" chave="setor" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Prazo" chave="prazo" tipo="data" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna
                          rotulo="Situação"
                          campos={[
                            { chave: "status", rotulo: "Status" },
                            { chave: "situacaoDoPrazo", rotulo: "Prazo" },
                          ]}
                        />
                      </th>
                      <th className="py-2 font-medium">
                        <FiltroDaColuna rotulo="Atualizada" chave="atualizada" tipo="data" align="right" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 pr-3">
                          <Link href={`/pendencias/${l.id}`} className="font-medium text-brand hover:underline">
                            {l.titulo}
                          </Link>
                          <span className="block text-[11px] text-fg-muted">
                            {ROTULO_DO_TIPO[l.tipo]} · {l.mensagens} {l.mensagens === 1 ? "mensagem" : "mensagens"}
                            {l.anexos > 0 && (
                              <>
                                {" "}
                                · <Paperclip size={10} className="inline" /> {l.anexos}
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{nomeDoSetor(l.setor)}</td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{l.empresaNome}</td>
                        <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{l.prazo ? formatInstantDate(l.prazo) : "—"}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SeloDoStatus status={l.status} lado="EQUIPE" />
                            <SeloDoPrazo situacao={l.situacaoDoPrazo} status={l.status} />
                          </div>
                        </td>
                        <td className="py-2.5 tabular-nums whitespace-nowrap text-fg-muted">{formatInstantDate(l.atualizadaEm)}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
                {limitado && <p className="text-[11px] text-fg-muted mt-3">Mostrando os 500 primeiros. Filtre por setor ou empresa para ver o resto.</p>}
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
