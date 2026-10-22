import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Briefcase, CheckCheck, HandCoins, Landmark, MessageSquareWarning, Receipt } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { isFullAccess } from "@/lib/auth/context";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { setorPadraoDasPendencias } from "@/lib/financeiro/pendencias/setor";
import { carregarCarteira } from "@/lib/financeiro/carteira/consultas";
import {
  analistaDoFiltro,
  diasSemExtrato,
  filtrarLinhas,
  opcoesDeOrdem,
  ordemDaUrl,
  ordemNaUrl,
  ordenarLinhas,
  sentidoPadrao,
  textoDosDiasSemExtrato,
  tomDosDiasSemExtrato,
  totaisDaCarteira,
  type ColunaDaCarteira,
  type FiltroDoAnalista,
  type LinhaDaCarteira,
  type OrdemDaCarteira,
  type SomaDeVencidos,
} from "@/lib/financeiro/carteira/regras";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type OpcaoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";

export const dynamic = "force-dynamic";

const MODULE = "bpo_painel_carteira";

/** As telas para onde cada coluna leva — o link só aparece para quem abre a tela. */
const DESTINOS = {
  pagar: "bpo_contas_pagar",
  receber: "bpo_contas_receber",
  conciliacao: "bpo_conciliacao",
  pendencias: "bpo_pendencias",
  aprovacoes: "bpo_aprovacoes",
} as const;

type Destino = keyof typeof DESTINOS;
type Links = Record<Destino, boolean>;

const TOM_DO_EXTRATO: Record<ReturnType<typeof tomDosDiasSemExtrato>, string> = {
  ok: "",
  atencao: "text-warning-fg",
  critico: "text-danger",
  neutro: "text-fg-muted",
};

/**
 * Painel da carteira do BPO (22/10/2026): uma linha por empresa atendida pelo
 * setor, com o que pede atenção em cada uma, e cada número levando à tela que
 * o resolve, já filtrada na empresa.
 *
 * O foco (uma empresa por vez) não recorta o painel, de propósito: ele é a
 * visão da carteira inteira, como Pendências e Aprovações, que também não
 * seguem o foco — por isso a rota não está em `TELAS_DO_FOCO`. Quem está
 * numa empresa e abre o link de outra cai no aviso de sempre da tela de
 * destino ("Sair do foco e abrir").
 */
export default async function CarteiraBpoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx, setor } = await abrirTelaDoModulo(MODULE);
  const params = await searchParams;
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;

  const [linhas, ...podeAbrir] = await Promise.all([
    setorPadraoDasPendencias(ctx.tenantId).then((p) => carregarCarteira(ctx.tenantId, setor[0]!, p, agora)),
    ...Object.values(DESTINOS).map((m) => podeNoModulo(ctx, m, "ver")),
  ]);
  const links = Object.fromEntries(Object.keys(DESTINOS).map((d, i) => [d, podeAbrir[i]])) as Links;

  // Os analistas da carteira, para o filtro — só quem responde por alguma empresa.
  const analistas = new Map<string, string>();
  for (const l of linhas) if (l.analistaId) analistas.set(l.analistaId, l.analistaNome ?? "Sem nome");
  const { filtro, padrao } = analistaDoFiltro(
    params.analista,
    { userId: ctx.userId, administrador: isFullAccess(ctx.role) },
    new Set(analistas.keys())
  );
  const ordem = ordemDaUrl(params.ordem);
  const visiveis = ordenarLinhas(filtrarLinhas(linhas, { analista: filtro, busca: params.busca }), ordem.coluna, ordem.sentido, hojeKey);
  const totais = totaisDaCarteira(visiveis, hojeKey);

  const hrefDaOrdem = (coluna: ColunaDaCarteira) => {
    const proxima: OrdemDaCarteira =
      ordem.coluna === coluna
        ? { coluna, sentido: ordem.sentido === "asc" ? "desc" : "asc" }
        : { coluna, sentido: sentidoPadrao(coluna) };
    const q = new URLSearchParams();
    for (const chave of ["analista", "busca"] as const) if (params[chave]) q.set(chave, params[chave]!);
    const valor = ordemNaUrl(proxima);
    if (valor) q.set("ordem", valor);
    return q.size ? `/carteira-bpo?${q}` : "/carteira-bpo";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Painel da carteira"
        subtitle="Cada empresa atendida pelo BPO numa linha: o que venceu, há quanto tempo não entra extrato, o que falta conciliar e o que espera o cliente. Clique num número para abrir a tela já na empresa."
      />

      <FaixaDeTotais
        itens={[
          { rotulo: "Empresas", valor: String(totais.empresas), icone: <Briefcase /> },
          {
            rotulo: "Vencido a pagar",
            valor: moeda(totais.vencidosPagar.centavos),
            detalhe: contarItens(totais.vencidosPagar.n, "conta", "contas"),
            tom: totais.vencidosPagar.n > 0 ? "text-danger" : "text-fg-muted",
            icone: <Receipt />,
          },
          {
            rotulo: "Vencido a receber",
            valor: moeda(totais.vencidosReceber.centavos),
            detalhe: contarItens(totais.vencidosReceber.n, "conta", "contas"),
            tom: totais.vencidosReceber.n > 0 ? "text-danger" : "text-fg-muted",
            icone: <HandCoins />,
          },
          {
            rotulo: "Linhas a conciliar",
            valor: String(totais.linhasAConciliar),
            detalhe: [
              totais.contasComSaldoDivergente > 0 ? contarItens(totais.contasComSaldoDivergente, "conta com saldo que não bate", "contas com saldo que não bate") : null,
              totais.empresasSemExtratoRecente > 0 ? contarItens(totais.empresasSemExtratoRecente, "empresa sem extrato há 7+ dias", "empresas sem extrato há 7+ dias") : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
            tom: totais.linhasAConciliar > 0 || totais.contasComSaldoDivergente > 0 ? "text-warning-fg" : "text-fg-muted",
            icone: <Landmark />,
          },
          {
            rotulo: "Pendências abertas",
            valor: String(totais.pendenciasAbertas),
            tom: totais.pendenciasAbertas > 0 ? "text-warning-fg" : "text-fg-muted",
            icone: <MessageSquareWarning />,
          },
          {
            rotulo: "Aprovações aguardando",
            valor: String(totais.aprovacoesAguardando),
            tom: totais.aprovacoesAguardando > 0 ? "text-warning-fg" : "text-fg-muted",
            icone: <CheckCheck />,
          },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(visiveis.length, "empresa", "empresas")}
        busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa ou CNPJ" />}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              opcoesDoAnalista(padrao, ctx.userId, analistas),
              { chave: "ordem", rotulo: "Ordem", vazioLabel: "Mais urgentes primeiro", opcoes: opcoesDeOrdem() },
            ]}
          />
        }
      >
        {visiveis.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title={linhas.length === 0 ? "Nenhuma empresa na carteira do BPO" : "Nenhuma empresa neste filtro"}
            description={
              linhas.length === 0
                ? "A carteira são as empresas com o serviço do BPO ativo — marque o serviço e o responsável na ficha da empresa."
                : "Troque o analista ou a busca para ver as outras empresas."
            }
          />
        ) : (
          <>
            <CartoesNoCelular>
              {visiveis.map((l) => (
                <CartaoDaEmpresa key={l.companyId} l={l} hojeKey={hojeKey} links={links} />
              ))}
            </CartoesNoCelular>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[1180px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <Cabecalho coluna="empresa" rotulo="Empresa" ordem={ordem} href={hrefDaOrdem} />
                    <Cabecalho coluna="pagar" rotulo="Vencido a pagar" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="receber" rotulo="Vencido a receber" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="extrato" rotulo="Sem extrato" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="conciliar" rotulo="A conciliar" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="saldo" rotulo="Saldo não bate" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="pendencias" rotulo="Pendências" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="aprovacoes" rotulo="Aprovações" ordem={ordem} href={hrefDaOrdem} direita />
                    <Cabecalho coluna="portal" rotulo="Portal" ordem={ordem} href={hrefDaOrdem} />
                    <Cabecalho coluna="analista" rotulo="Analista" ordem={ordem} href={hrefDaOrdem} />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <LinhaDaEmpresa key={l.companyId} l={l} hojeKey={hojeKey} links={links} />
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>
      <p className="text-micro text-fg-muted mt-3">
        A carteira são as empresas com o serviço do BPO ativo. “Sem extrato” conta os dias desde a última importação de extrato nas
        contas bancárias ativas; “Saldo não bate” é a conferência da conciliação (saldo calculado contra o saldo do banco). Abre nas
        suas empresas quando você é o analista de alguma — “Todos os analistas” mostra a carteira inteira.
      </p>
    </PageContainer>
  );
}

/** O campo do analista: o vazio é o padrão da pessoa ("minhas" ou "todos"), e o outro vira opção. */
function opcoesDoAnalista(padrao: FiltroDoAnalista, userId: string, analistas: Map<string, string>) {
  const minhas = padrao.tipo === "pessoa";
  const pessoas: OpcaoDeFiltro[] = [...analistas]
    .filter(([id]) => id !== userId)
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([id, nome]) => ({ value: id, label: nome }));
  return {
    chave: "analista",
    rotulo: "Analista",
    vazioLabel: minhas ? "Minhas empresas" : "Todos os analistas",
    opcoes: [
      minhas ? { value: "todos", label: "Todos os analistas" } : { value: "eu", label: "Minhas empresas" },
      { value: "sem", label: "Sem analista" },
      ...pessoas,
    ],
  };
}

function Cabecalho({
  coluna,
  rotulo,
  ordem,
  href,
  direita = false,
}: {
  coluna: ColunaDaCarteira;
  rotulo: string;
  ordem: OrdemDaCarteira;
  href: (c: ColunaDaCarteira) => string;
  direita?: boolean;
}) {
  const ativa = ordem.coluna === coluna;
  const Seta = ordem.sentido === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`py-2 pr-3 font-medium ${direita ? "text-right" : ""}`}
      aria-sort={ativa ? (ordem.sentido === "asc" ? "ascending" : "descending") : undefined}
    >
      <Link href={href(coluna)} className={`inline-flex items-center gap-1 hover:text-fg ${ativa ? "text-fg" : ""}`} scroll={false}>
        {rotulo}
        {ativa && <Seta size={12} aria-hidden />}
      </Link>
    </th>
  );
}

/** Um número que leva à tela — só quando há o que ver e a pessoa abre a tela. */
function Numero({ valor, href, pode, tom = "" }: { valor: ReactNode; href: string; pode: boolean; tom?: string }) {
  if (!pode) return <span className={tom}>{valor}</span>;
  return (
    <Link href={href} className={`hover:underline ${tom}`}>
      {valor}
    </Link>
  );
}

function Vencidos({ soma, href, pode }: { soma: SomaDeVencidos; href: string; pode: boolean }) {
  if (soma.n === 0) return <span className="text-fg-muted">—</span>;
  return (
    <Numero
      pode={pode}
      href={href}
      tom="text-danger"
      valor={
        <>
          <span className="font-medium">{moeda(soma.centavos)}</span>
          <span className="block text-micro">{contarItens(soma.n, "conta", "contas")}</span>
        </>
      }
    />
  );
}

function hrefs(companyId: string) {
  const e = encodeURIComponent(companyId);
  return {
    pagar: `/pagar?empresa=${e}&recorte=vencidas`,
    receber: `/receber?empresa=${e}&recorte=vencidas`,
    conciliacao: `/conciliacao?empresa=${e}`,
    pendencias: `/pendencias?empresa=${e}`,
    aprovacoes: `/aprovacoes?empresa=${e}&situacao=aguardando`,
    empresa: `/empresas/${e}`,
  };
}

function textoDoPortal(l: LinhaDaCarteira): string {
  if (l.acessosAoPortal === 0) return "sem acesso";
  return l.ultimoAcessoPortal ? formatInstantDate(l.ultimoAcessoPortal) : "nunca";
}

function LinhaDaEmpresa({ l, hojeKey, links }: { l: LinhaDaCarteira; hojeKey: string; links: Links }) {
  const h = hrefs(l.companyId);
  const dias = diasSemExtrato(l, hojeKey);
  const contagem = (n: number, href: string, pode: boolean, tom: string) =>
    n === 0 ? <span className="text-fg-muted">0</span> : <Numero valor={n} href={href} pode={pode} tom={tom} />;
  return (
    <tr className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
      <td className="py-2.5 pr-3">
        <Link href={h.empresa} className="font-medium text-brand hover:underline">
          {l.nome}
        </Link>
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <Vencidos soma={l.vencidosPagar} href={h.pagar} pode={links.pagar} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <Vencidos soma={l.vencidosReceber} href={h.receber} pode={links.receber} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
        {dias === null ? (
          <span className="text-fg-muted">{textoDosDiasSemExtrato(dias)}</span>
        ) : (
          <Numero valor={textoDosDiasSemExtrato(dias)} href={h.conciliacao} pode={links.conciliacao} tom={TOM_DO_EXTRATO[tomDosDiasSemExtrato(dias)]} />
        )}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{contagem(l.linhasAConciliar, h.conciliacao, links.conciliacao, "text-warning-fg")}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {contagem(l.contasComSaldoDivergente, h.conciliacao, links.conciliacao, "text-danger")}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{contagem(l.pendenciasAbertas, h.pendencias, links.pendencias, "text-warning-fg")}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {contagem(l.aprovacoesAguardando, h.aprovacoes, links.aprovacoes, "text-warning-fg")}
      </td>
      <td className={`py-2.5 pr-3 tabular-nums whitespace-nowrap ${l.ultimoAcessoPortal ? "" : "text-fg-muted"}`}>{textoDoPortal(l)}</td>
      <td className="py-2.5 pr-3 text-fg-secondary">{l.analistaNome ?? <span className="text-fg-muted">—</span>}</td>
    </tr>
  );
}

function CartaoDaEmpresa({ l, hojeKey, links }: { l: LinhaDaCarteira; hojeKey: string; links: Links }) {
  const h = hrefs(l.companyId);
  const dias = diasSemExtrato(l, hojeKey);
  const itens: ReactNode[] = [];
  if (l.vencidosPagar.n > 0)
    itens.push(<Numero key="p" valor={`${moeda(l.vencidosPagar.centavos)} vencido a pagar`} href={h.pagar} pode={links.pagar} tom="text-danger" />);
  if (l.vencidosReceber.n > 0)
    itens.push(
      <Numero key="r" valor={`${moeda(l.vencidosReceber.centavos)} vencido a receber`} href={h.receber} pode={links.receber} tom="text-danger" />
    );
  if (l.linhasAConciliar > 0)
    itens.push(<Numero key="c" valor={contarItens(l.linhasAConciliar, "linha a conciliar", "linhas a conciliar")} href={h.conciliacao} pode={links.conciliacao} tom="text-warning-fg" />);
  if (l.contasComSaldoDivergente > 0)
    itens.push(
      <Numero
        key="s"
        valor={contarItens(l.contasComSaldoDivergente, "conta com saldo que não bate", "contas com saldo que não bate")}
        href={h.conciliacao}
        pode={links.conciliacao}
        tom="text-danger"
      />
    );
  if (l.pendenciasAbertas > 0)
    itens.push(<Numero key="pe" valor={contarItens(l.pendenciasAbertas, "pendência aberta", "pendências abertas")} href={h.pendencias} pode={links.pendencias} tom="text-warning-fg" />);
  if (l.aprovacoesAguardando > 0)
    itens.push(
      <Numero key="a" valor={contarItens(l.aprovacoesAguardando, "aprovação aguardando", "aprovações aguardando")} href={h.aprovacoes} pode={links.aprovacoes} tom="text-warning-fg" />
    );
  return (
    <Cartao>
      <TopoDoCartao
        nome={
          <Link href={h.empresa} className="text-brand hover:underline">
            {l.nome}
          </Link>
        }
      />
      {itens.map((item, i) => (
        <InfoDoCartao key={i} className="tabular-nums">
          {item}
        </InfoDoCartao>
      ))}
      <InfoDoCartao className="mt-1">
        extrato: <span className={TOM_DO_EXTRATO[tomDosDiasSemExtrato(dias)]}>{dias === null || dias === Number.POSITIVE_INFINITY || dias === 0 ? textoDosDiasSemExtrato(dias) : `há ${textoDosDiasSemExtrato(dias)}`}</span> ·
        portal: {textoDoPortal(l)}
        {l.analistaNome ? ` · ${l.analistaNome}` : ""}
      </InfoDoCartao>
    </Cartao>
  );
}
