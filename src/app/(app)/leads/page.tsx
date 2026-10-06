import Link from "next/link";
import { UserRoundPlus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDateTime, formatPhone } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { escritorioDaFicha } from "@/lib/leads/servidor";
import {
  MODULO_LEADS,
  RECORTES_DOS_LEADS,
  ROTULO_DO_STATUS,
  VARIANTE_DO_STATUS,
  rotuloDaOrigem,
  statusDoRecorte,
} from "@/lib/leads/regras";

export const dynamic = "force-dynamic";

/** Teto da lista, como na fila de solicitações: acima disso, filtrar. */
const LIMITE = 500;

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/**
 * Os leads do Comercial (05/10/2026): quem quer ser cliente do escritório.
 *
 * Filtros por GET, como nas filas vizinhas, para a URL ser copiável. Sem
 * filtro a lista mostra os em aberto — novos e em contato —, que é o trabalho
 * que falta; "Todos" no filtro de situação traz o resto.
 */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx, setor } = await abrirTelaDoModulo(MODULO_LEADS);
  const params = await searchParams;
  const prisma = getPrisma();

  const [pessoasDoSetor, origens, ficha] = await Promise.all([
    getSectorUsers(ctx.tenantId, setor),
    prisma.lead.findMany({ where: { tenantId: ctx.tenantId }, distinct: ["source"], select: { source: true } }),
    escritorioDaFicha(),
  ]);

  const status = statusDoRecorte(params.situacao);
  const origem = params.origem && origens.some((o) => o.source === params.origem) ? params.origem : null;
  // "eu" e "sem" são atalhos; qualquer outro valor só vale se for alguém da lista.
  const responsavel =
    params.responsavel === "eu"
      ? ctx.userId || null
      : params.responsavel === "sem"
        ? null
        : pessoasDoSetor.some((p) => p.id === params.responsavel)
          ? params.responsavel!
          : undefined;

  const encontrados = await prisma.lead.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(status ? { status: { in: [...status] } } : {}),
      ...(origem ? { source: origem } : {}),
      ...(responsavel !== undefined ? { assigneeId: responsavel } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: LIMITE + 1,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      companyName: true,
      source: true,
      status: true,
      createdAt: true,
      assignee: { select: { name: true } },
    },
  });
  const limitado = encontrados.length > LIMITE;
  const leads = encontrados.slice(0, LIMITE);
  const filtrando = Boolean(params.situacao || origem || responsavel !== undefined);

  return (
    <PageContainer>
      <PageHeader
        title="Leads"
        subtitle="Quem quer ser cliente do escritório. A ficha “Quero ser cliente” do portal cai aqui, e o setor é avisado no sino."
      />

      <CascoDaTabela
        contagem={contarItens(leads.length, "lead", "leads", limitado)}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Em aberto",
                opcoes: RECORTES_DOS_LEADS.map((r) => ({ value: r.chave, label: r.rotulo })),
              },
              {
                chave: "origem",
                rotulo: "Origem",
                vazioLabel: "Todas",
                opcoes: origens.map((o) => ({ value: o.source, label: rotuloDaOrigem(o.source) })),
              },
              {
                chave: "responsavel",
                rotulo: "Responsável",
                vazioLabel: "Todos",
                opcoes: [
                  { value: "eu", label: "Comigo" },
                  { value: "sem", label: "Sem responsável" },
                  ...pessoasDoSetor.filter((p) => p.id !== ctx.userId).map((p) => ({ value: p.id, label: p.name })),
                ],
              },
            ]}
          />
        }
      >
        {leads.length === 0 ? (
          <EmptyState
            icon={<UserRoundPlus />}
            title={filtrando ? "Nenhum lead neste recorte" : "Nenhum lead em aberto"}
            description={
              ficha?.tenantId === ctx.tenantId
                ? "Quando alguém preencher a ficha “Quero ser cliente” no login do portal, o lead aparece aqui e o setor é avisado no sino."
                : "A ficha “Quero ser cliente” do portal ainda não entrega para este escritório. Peça a quem administra o Connect para ligá-la — enquanto isso, nenhum lead chega."
            }
          />
        ) : (
          <>
            <CartoesNoCelular>
              {leads.map((l) => (
                <Cartao key={l.id}>
                  <TopoDoCartao
                    nome={
                      <Link href={`/leads/${l.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                        {l.name}
                      </Link>
                    }
                  />
                  {l.companyName && <InfoDoCartao>{l.companyName}</InfoDoCartao>}
                  <InfoDoCartao>
                    {[l.email, l.phone ? formatPhone(l.phone) : null].filter(Boolean).join(" · ") || "sem contato"}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    {rotuloDaOrigem(l.source)} · {formatInstantDateTime(l.createdAt, QUANDO)} · {l.assignee?.name ?? "sem responsável"}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <Badge variant={VARIANTE_DO_STATUS[l.status]}>{ROTULO_DO_STATUS[l.status]}</Badge>
                  </PeDoCartao>
                </Cartao>
              ))}
              {limitado && <p className="text-[11px] text-fg-muted mt-1">Mostrando os {LIMITE} mais recentes. Filtre para ver o resto.</p>}
            </CartoesNoCelular>

            <TabelaFiltravel
              linhas={leads.map((l) => ({
                id: l.id,
                valores: {
                  nome: l.name,
                  empresa: l.companyName ?? "",
                  origem: rotuloDaOrigem(l.source),
                  situacao: ROTULO_DO_STATUS[l.status],
                  responsavel: l.assignee?.name ?? "Sem responsável",
                  recebido: saoPauloParts(l.createdAt).dateKey,
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[900px] text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna
                          rotulo="Nome e empresa"
                          campos={[
                            { chave: "nome", rotulo: "Nome" },
                            { chave: "empresa", rotulo: "Empresa" },
                          ]}
                        />
                      </th>
                      <th className="py-2 pr-3 font-medium">Contato</th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Origem" chave="origem" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Situação" chave="situacao" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Responsável" chave="responsavel" />
                      </th>
                      <th className="py-2 font-medium">
                        <FiltroDaColuna rotulo="Recebido em" chave="recebido" tipo="data" align="right" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <LinhaFiltravel
                        key={l.id}
                        id={l.id}
                        href={`/leads/${l.id}`}
                        className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors"
                      >
                        <td className="py-2.5 pr-3">
                          <Link href={`/leads/${l.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                            {l.name}
                          </Link>
                          <span className="block text-[11px] text-fg-muted">{l.companyName ?? "Empresa não informada"}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">
                          <span className="block break-all">{l.email ?? "—"}</span>
                          <span className="block text-[11px] text-fg-muted tabular-nums">{l.phone ? formatPhone(l.phone) : "—"}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{rotuloDaOrigem(l.source)}</td>
                        <td className="py-2.5 pr-3">
                          <Badge variant={VARIANTE_DO_STATUS[l.status]}>{ROTULO_DO_STATUS[l.status]}</Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{l.assignee?.name ?? <span className="text-fg-muted">Sem responsável</span>}</td>
                        <td className="py-2.5 tabular-nums whitespace-nowrap text-right text-fg-muted">
                          {formatInstantDateTime(l.createdAt, QUANDO)}
                        </td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
                {limitado && <p className="text-[11px] text-fg-muted mt-3">Mostrando os {LIMITE} mais recentes. Filtre para ver o resto.</p>}
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
