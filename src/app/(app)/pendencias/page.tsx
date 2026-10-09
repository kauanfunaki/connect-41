import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareWarning, Paperclip, Hourglass, MessageCircleReply, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";
import { NovaPendencia, type LancamentoVinculado } from "@/components/pendencias/NovaPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { listarPendencias, RECORTES_DE_PENDENCIA, type RecorteDePendencia } from "@/lib/financeiro/pendencias/consultas";
import { soDoSetorPadrao } from "@/lib/financeiro/pendencias/setor";
import { ROTULO_DO_TIPO, ROTULO_DO_STATUS, ROTULO_DO_PRAZO } from "@/lib/financeiro/pendencias/regras";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

export const dynamic = "force-dynamic";

const MODULE = "bpo_pendencias";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/**
 * A fila de pendências ao cliente.
 *
 * Filtros por GET (recorte, empresa, só vencidas), para a URL ser copiável. Os
 * contadores são da empresa filtrada e ignoram o recorte: são o mapa da fila, e
 * um mapa que muda conforme a aba escolhida não serve para escolher a aba.
 */
export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);

  const params = await searchParams;
  const recorte: RecorteDePendencia = RECORTES_DE_PENDENCIA.find((r) => r.chave === params.recorte)?.chave ?? "andamento";
  const vencidas = params.vencidas === "1";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;
  const agora = new Date();

  const [{ linhas, contadores, limitado }, lancamento] = await Promise.all([
    // Só as do setor do módulo (e as de antes de 01/10, sem setor): os pedidos
    // dos outros setores ficam em Solicitações › Pedidos ao cliente.
    listarPendencias({ tenantId: ctx.tenantId, companyIds: null, setores: soDoSetorPadrao(setor) }, { recorte, empresaId, vencidas }, agora),
    podeAgir && params.lancamento ? lancamentoParaVincular(ctx.tenantId, params.lancamento) : Promise.resolve(null),
  ]);

  function href(mudancas: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = {
      recorte: recorte === "andamento" ? undefined : recorte,
      empresa: empresaId ?? undefined,
      vencidas: vencidas ? "1" : undefined,
      ...mudancas,
    };
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/pendencias?${s}` : "/pendencias";
  }

  return (
    <PageContainer>
      <PageHeader
        title="Pendências ao cliente"
        subtitle="O que a equipe precisa do cliente — documento, informação ou confirmação — e a conversa de cada pedido."
        action={
          podeAgir ? (
            <NovaPendencia
              empresas={empresas}
              empresaPadrao={empresaId ?? undefined}
              lancamento={lancamento}
              abertoDeInicio={params.nova === "1"}
            />
          ) : undefined
        }
      />

      {/* Cada cartão abre o recorte que ele conta. */}
      <div className="mt-4">
        <FaixaDeTotais
          itens={[
            {
              rotulo: "Aguardando cliente",
              valor: String(contadores.aguardando),
              icone: <Hourglass />,
              href: href({ recorte: recorte === "aguardando" && !vencidas ? undefined : "aguardando", vencidas: undefined }),
              ativo: recorte === "aguardando" && !vencidas,
            },
            {
              rotulo: "Respondidas",
              valor: String(contadores.respondidas),
              tom: contadores.respondidas > 0 ? "text-brand" : "",
              icone: <MessageCircleReply />,
              href: href({ recorte: recorte === "respondidas" && !vencidas ? undefined : "respondidas", vencidas: undefined }),
              ativo: recorte === "respondidas" && !vencidas,
            },
            {
              rotulo: "Vencidas",
              valor: String(contadores.vencidas),
              tom: contadores.vencidas > 0 ? "text-danger" : "",
              icone: <AlertTriangle />,
              href: href({ recorte: undefined, vencidas: recorte === "andamento" && vencidas ? undefined : "1" }),
              ativo: recorte === "andamento" && vencidas,
            },
            {
              rotulo: "Encerradas",
              valor: String(contadores.encerradas),
              tom: "text-fg-muted",
              icone: <CheckCircle2 />,
              href: href({ recorte: recorte === "encerradas" && !vencidas ? undefined : "encerradas", vencidas: undefined }),
              ativo: recorte === "encerradas" && !vencidas,
            },
          ]}
        />
      </div>

      {/* Situação, empresa e prazo no botão "Filtros" — eram uma fileira de
          pílulas mais um formulário com "Aplicar" (conferência de 30/09). */}
      <CascoDaTabela
        contagem={contarItens(linhas.length, "pendência", "pendências", limitado)}
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
              { chave: "empresa", rotulo: "Empresa", vazioLabel: "Todas", opcoes: empresas.map((e) => ({ value: e.id, label: e.nome })) },
              { chave: "vencidas", rotulo: "Prazo", vazioLabel: "Todos os prazos", opcoes: [{ value: "1", label: "Só vencidas" }] },
            ]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning />}
            title="Nenhuma pendência neste recorte"
            description={podeAgir ? "Abra uma pendência quando precisar de algo do cliente — ele responde pelo portal." : undefined}
          />
        ) : (
          <>
          {/* Abaixo de md, cartões — mesma forma da lista do portal, para os dois
              lados da mesma pendência se parecerem. */}
          <CartoesNoCelular>
            {linhas.map((l) => (
              <Cartao key={l.id}>
                <Link href={`/pendencias/${l.id}`} className="font-medium text-brand hover:underline break-words">
                  {l.titulo}
                </Link>
                <InfoDoCartao className="mt-0.5 break-words">
                  {ROTULO_DO_TIPO[l.tipo]} · {l.empresaNome} · {l.mensagens} {l.mensagens === 1 ? "mensagem" : "mensagens"}
                  {l.anexos > 0 && (
                    <>
                      {" · "}
                      <Paperclip size={10} className="inline" /> {l.anexos}
                    </>
                  )}
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
          </CartoesNoCelular>

          <TabelaFiltravel
            linhas={linhas.map((l) => ({
              id: l.id,
              valores: {
                tipo: ROTULO_DO_TIPO[l.tipo],
                empresa: l.empresaNome,
                prazo: l.prazo ? saoPauloParts(l.prazo).dateKey : "",
                status: ROTULO_DO_STATUS[l.status],
                situacaoDoPrazo: ROTULO_DO_PRAZO[l.situacaoDoPrazo],
                atualizada: saoPauloParts(l.atualizadaEm).dateKey,
              },
            }))}
          >
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">
                    <FiltroDaColuna rotulo="Pendência" campos={[{ chave: "tipo", rotulo: "Tipo" }]} />
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
                      <span className="block text-micro text-fg-muted">
                        {ROTULO_DO_TIPO[l.tipo]} · {l.mensagens} {l.mensagens === 1 ? "mensagem" : "mensagens"}
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
          </TabelaNoDesktop>
          </TabelaFiltravel>
          {/* Filho direto do casco, como em aprovações (08/10/2026): dentro da
              tabela, o aviso perdia o recuo e a divisória do pé do cartão. Um só
              para o cartão do celular e a tabela. */}
          {limitado && <p className="text-micro text-fg-muted mt-3">Mostrando as 500 primeiras. Filtre por empresa para ver o resto.</p>}
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}

/** O lançamento que veio de `/pagar` ou `/receber`, conferido no tenant. */
async function lancamentoParaVincular(tenantId: string, id: string): Promise<LancamentoVinculado | null> {
  const l = await getPrisma().financeEntry.findFirst({
    where: { id, tenantId },
    select: { id: true, companyId: true, kind: true, amount: true, dueDate: true, counterparty: { select: { name: true } } },
  });
  if (!l) return null;
  return {
    id: l.id,
    companyId: l.companyId,
    rotulo: `${l.kind === "PAGAR" ? "a pagar" : "a receber"} · ${l.counterparty.name} · ${moeda(centavosDeDecimal(l.amount))} · vence ${formatInstantDate(l.dueDate)}`,
  };
}
