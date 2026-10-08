import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Hand, Hourglass, Inbox, Paperclip } from "lucide-react";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getSectorMaps, getActiveSectors } from "@/lib/sectors";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { SeloDaSolicitacao, SeloDoPrazoDeResposta } from "@/components/solicitacoes/SelosDaSolicitacao";
import { AbasDoAtendimento } from "@/components/solicitacoes/AbasDoAtendimento";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";
import { listarParaEquipe, RECORTES_DA_EQUIPE, type RecorteDaEquipe } from "@/lib/solicitacoes/consultas";
import { ROTULO_DA_RESPOSTA, ROTULO_PARA_EQUIPE } from "@/lib/solicitacoes/regras";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

export const dynamic = "force-dynamic";

/**
 * A fila das solicitações que os clientes abrem pelo portal (01/10).
 *
 * Menu Geral, não de setor: cada pessoa vê as dos setores dela (e as que
 * estão com ela), administrador vê todas. Filtros por GET, como na pendência,
 * para a URL ser copiável; os contadores são o mapa da fila e ignoram o recorte.
 */
export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  const params = await searchParams;
  const recorte: RecorteDaEquipe = RECORTES_DA_EQUIPE.find((r) => r.chave === params.recorte)?.chave ?? "abertas";
  const atrasadas = params.atrasadas === "1";
  const setoresDaPessoa = setoresDaFila(ctx);
  const [empresas, ativos, { labels }] = await Promise.all([
    empresasDoSeletor(ctx.tenantId),
    getActiveSectors(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);
  const opcoesDeSetor = ativos.filter((s) => setoresDaPessoa === null || setoresDaPessoa.includes(s.code));
  const setor = params.setor && opcoesDeSetor.some((s) => s.code === params.setor) ? params.setor : null;
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;
  const agora = new Date();

  const { linhas, contadores, limitado } = await listarParaEquipe(
    { tenantId: ctx.tenantId, setores: setoresDaPessoa, userId: ctx.userId },
    { recorte, setor, empresaId, atrasadas },
    agora
  );

  function href(mudancas: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = {
      recorte: recorte === "abertas" ? undefined : recorte,
      setor: setor ?? undefined,
      empresa: empresaId ?? undefined,
      atrasadas: atrasadas ? "1" : undefined,
      ...mudancas,
    };
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/solicitacoes?${s}` : "/solicitacoes";
  }

  return (
    <PageContainer>
      <PageHeader
        title="Solicitações dos clientes"
        subtitle="O que os clientes pedem pelo portal. Cada setor vê as suas, com o prazo de resposta prometido ao cliente."
      />

      <AbasDoAtendimento ativa="solicitacoes" />

      {/* Cada cartão abre o recorte que ele conta, e o do recorte aberto fica
          aceso (`ativo`, 07/10/2026). */}
      <div>
        <FaixaDeTotais
          itens={[
            {
              rotulo: "Novas",
              valor: formatarNumero(contadores.novas, 0),
              tom: contadores.novas > 0 ? "text-brand" : "",
              icone: <Inbox />,
              href: href({ recorte: "novas", atrasadas: undefined }),
              ativo: recorte === "novas" && !atrasadas,
            },
            {
              rotulo: "Minhas",
              valor: formatarNumero(contadores.minhas, 0),
              icone: <Hand />,
              href: href({ recorte: "minhas", atrasadas: undefined }),
              ativo: recorte === "minhas" && !atrasadas,
            },
            {
              rotulo: "Resposta atrasada",
              valor: formatarNumero(contadores.atrasadas, 0),
              tom: contadores.atrasadas > 0 ? "text-danger" : "",
              icone: <AlertTriangle />,
              href: href({ recorte: undefined, atrasadas: "1" }),
              ativo: recorte === "abertas" && atrasadas,
            },
            {
              rotulo: "Aguardando cliente",
              valor: formatarNumero(contadores.aguardando, 0),
              tom: "text-fg-muted",
              icone: <Hourglass />,
              href: href({ recorte: "aguardando", atrasadas: undefined }),
              ativo: recorte === "aguardando" && !atrasadas,
            },
          ]}
        />
      </div>

      <CascoDaTabela
        contagem={contarItens(linhas.length, "solicitação", "solicitações", limitado)}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "recorte",
                rotulo: "Situação",
                vazioLabel: "Em aberto",
                opcoes: RECORTES_DA_EQUIPE.filter((r) => r.chave !== "abertas").map((r) => ({ value: r.chave, label: r.rotulo })),
              },
              { chave: "setor", rotulo: "Setor", vazioLabel: "Todos os meus setores", opcoes: opcoesDeSetor.map((s) => ({ value: s.code, label: s.label })) },
              { chave: "empresa", rotulo: "Empresa", vazioLabel: "Todas", opcoes: empresas.map((e) => ({ value: e.id, label: e.nome })) },
              { chave: "atrasadas", rotulo: "Prazo", vazioLabel: "Todos os prazos", opcoes: [{ value: "1", label: "Só com resposta atrasada" }] },
            ]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Nenhuma solicitação neste recorte"
            description="Quando um cliente pedir algo pelo portal num assunto dos seus setores, a solicitação aparece aqui e você é avisado no sino."
          />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((l) => (
                <Cartao key={l.id}>
                  <Link href={`/solicitacoes/${l.id}`} className="font-medium text-brand hover:underline break-words">
                    Nº {l.numero} · {l.assunto}
                  </Link>
                  <InfoDoCartao className="mt-0.5 break-words">
                    {l.empresaNome} · {labels[l.setor] ?? l.setor} · {l.responsavel ?? "sem responsável"}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    resposta até {formatInstantDate(l.prazo)} · atualizada {formatInstantDate(l.atualizadaEm)}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <SeloDaSolicitacao status={l.status} lado="EQUIPE" />
                    <SeloDoPrazoDeResposta situacao={l.situacao} />
                  </PeDoCartao>
                </Cartao>
              ))}
              {limitado && <p className="text-[11px] text-fg-muted mt-1">Mostrando as 500 mais recentes. Filtre por setor ou empresa para ver o resto.</p>}
            </CartoesNoCelular>

            <TabelaFiltravel
              linhas={linhas.map((l) => ({
                id: l.id,
                valores: {
                  assunto: l.assunto,
                  empresa: l.empresaNome,
                  setor: labels[l.setor] ?? l.setor,
                  responsavel: l.responsavel ?? "Sem responsável",
                  prazo: saoPauloParts(l.prazo).dateKey,
                  status: ROTULO_PARA_EQUIPE[l.status],
                  resposta: ROTULO_DA_RESPOSTA[l.situacao],
                  atualizada: saoPauloParts(l.atualizadaEm).dateKey,
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[960px] text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Solicitação" campos={[{ chave: "assunto", rotulo: "Assunto" }]} />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna
                          rotulo="Com quem"
                          campos={[
                            { chave: "setor", rotulo: "Setor" },
                            { chave: "responsavel", rotulo: "Responsável" },
                          ]}
                        />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Resposta até" chave="prazo" tipo="data" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna
                          rotulo="Situação"
                          campos={[
                            { chave: "status", rotulo: "Status" },
                            { chave: "resposta", rotulo: "Resposta" },
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
                          <Link href={`/solicitacoes/${l.id}`} className="font-medium text-brand hover:underline">
                            Nº {l.numero} · {l.assunto}
                          </Link>
                          <span className="block text-[11px] text-fg-muted">
                            {l.mensagens} {l.mensagens === 1 ? "mensagem" : "mensagens"}
                            {l.anexos > 0 && (
                              <>
                                {" "}
                                · <Paperclip size={10} className="inline" /> {l.anexos}
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{l.empresaNome}</td>
                        <td className="py-2.5 pr-3">
                          <span className="block text-fg-secondary">{labels[l.setor] ?? l.setor}</span>
                          <span className="block text-[11px] text-fg-muted">{l.responsavel ?? "Sem responsável"}</span>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{formatInstantDate(l.prazo)}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SeloDaSolicitacao status={l.status} lado="EQUIPE" />
                            <SeloDoPrazoDeResposta situacao={l.situacao} />
                          </div>
                        </td>
                        <td className="py-2.5 tabular-nums whitespace-nowrap text-fg-muted">{formatInstantDate(l.atualizadaEm)}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
                {limitado && <p className="text-[11px] text-fg-muted mt-3">Mostrando as 500 mais recentes. Filtre por setor ou empresa para ver o resto.</p>}
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
