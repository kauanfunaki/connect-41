import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { CalendarClock, FileSignature, Wallet, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FormularioDoContrato } from "@/components/financeiroInterno/Contratos";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { podeExcluir } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { formatarReaisDeCentavos, formatCalendarDate } from "@/lib/format";
import {
  CATEGORIAS_DE_CONTRATO,
  CICLOS,
  MODULO_CONTRATOS,
  custoMensalEmCentavos,
  diasAteADataDoContrato,
  situacaoDaRenovacao,
  type SituacaoDaRenovacao,
} from "@/lib/financeiroInterno/contratos";
import { cancelarContrato, excluirContrato, salvarContrato } from "./actions";

export const dynamic = "force-dynamic";

const RECORTES = [
  { chave: "ativos", rotulo: "Ativos" },
  { chave: "renovar", rotulo: "A renovar" },
  { chave: "cancelados", rotulo: "Cancelados" },
] as const;

const SITUACAO: Record<SituacaoDaRenovacao, { rotulo: string; tom: TomDoSelo }> = {
  vencida: { rotulo: "Vencido", tom: "perigo" },
  renova_em_breve: { rotulo: "Renova em breve", tom: "atencao" },
  em_dia: { rotulo: "Em dia", tom: "sucesso" },
  sem_data: { rotulo: "Sem data", tom: "neutro" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Os contratos e assinaturas que o escritório paga (05/11/2026, decisão do
 * Kauan, fase 1 do Financeiro): quanto pesam por mês, quando renovam e quem
 * responde por cada um.
 */
export default async function ContratosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_CONTRATOS);
  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "ativos";
  const busca = semAcento((params.q ?? "").trim());
  const prisma = getPrisma();
  const [contratos, podeGerir, pessoas] = await Promise.all([
    prisma.internalContract.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: [{ renewalDate: "asc" }, { name: "asc" }] }),
    podeNoModulo(ctx, MODULO_CONTRATOS, "gerir"),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId!, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const hoje = new Date();
  const comSituacao = contratos.map((c) => ({ ...c, situacao: situacaoDaRenovacao(c, hoje), mensal: custoMensalEmCentavos(c) }));
  const ativos = comSituacao.filter((c) => c.status === "ATIVO");
  const aRenovar = ativos.filter((c) => c.situacao === "vencida" || c.situacao === "renova_em_breve");
  const noRecorte = { ativos, renovar: aRenovar, cancelados: comSituacao.filter((c) => c.status !== "ATIVO") }[recorte];
  const visiveis = busca ? noRecorte.filter((c) => semAcento(`${c.name} ${c.supplier} ${c.ownerName ?? ""}`).includes(busca)) : noRecorte;
  const custoMensal = ativos.reduce((s, c) => s + c.mensal, 0);
  const href = (r: string) => (r === "ativos" ? "/contratos" : `/contratos?recorte=${r}`);
  const quando = (c: (typeof comSituacao)[number]) => {
    if (!c.renewalDate) return "—";
    const dias = diasAteADataDoContrato(c.renewalDate, hoje);
    return `${formatCalendarDate(c.renewalDate)} · ${dias < 0 ? `há ${-dias} dias` : dias === 0 ? "hoje" : `em ${dias} dias`}`;
  };
  const acoes = (c: (typeof comSituacao)[number]) =>
    podeGerir && (
      <span className="flex flex-wrap items-center justify-end gap-1">
        <FormularioDoContrato
          pessoas={pessoas}
          action={salvarContrato.bind(null, c.id)}
          contrato={{
            name: c.name, supplier: c.supplier, category: c.category, amount: (c.amountCents / 100).toFixed(2).replace(".", ","), cycle: c.cycle,
            startDate: dia(c.startDate), endDate: dia(c.endDate), renewalDate: dia(c.renewalDate), autoRenew: c.autoRenew,
            ownerUserId: c.ownerUserId, url: c.url, notes: c.notes,
          }}
        />
        {c.status === "ATIVO" && (
          <ConfirmActionButton action={cancelarContrato.bind(null, c.id)} label="Cancelar" title={`Cancelar “${c.name}”?`} description="Sai do custo por mês e dos avisos de renovação; continua na lista de cancelados." confirmLabel="Cancelar contrato" variant="ghost" size="sm" />
        )}
        {podeExcluir(ctx) && (
          <ConfirmActionButton action={excluirContrato.bind(null, c.id)} label="Excluir" title={`Excluir “${c.name}”?`} description="O contrato sai do Connect. Para parar de contar, use Cancelar." confirmLabel="Excluir" destructive variant="ghost" size="sm" />
        )}
      </span>
    );

  return (
    <PageContainer>
      <PageHeader
        title="Contratos e assinaturas"
        subtitle="O que o escritório paga — softwares, serviços, aluguéis: quanto pesa por mês, quando renova e quem responde."
        action={podeGerir ? <FormularioDoContrato pessoas={pessoas} action={salvarContrato.bind(null, null)} /> : undefined}
      />
      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Custo por mês", valor: formatarReaisDeCentavos(custoMensal), icone: <Wallet />, detalhe: `${ativos.length} ${ativos.length === 1 ? "contrato ativo" : "contratos ativos"}`, href: href("ativos"), ativo: recorte === "ativos" },
          {
            rotulo: "A renovar",
            valor: String(aRenovar.length),
            icone: <CalendarClock />,
            tom: aRenovar.some((c) => c.situacao === "vencida") ? "text-danger" : aRenovar.length > 0 ? "text-warning-fg" : undefined,
            detalhe: "vencidos ou em 30 dias",
            href: href("renovar"),
            ativo: recorte === "renovar",
          },
          { rotulo: "Cancelados", valor: String(comSituacao.length - ativos.length), icone: <XCircle />, tom: "text-fg-muted", href: href("cancelados"), ativo: recorte === "cancelados" },
        ]}
      />
      <CascoDaTabela
        contagem={contarItens(visiveis.length, "contrato", "contratos")}
        busca={
          <FormularioDeFiltro action="/contratos" className="max-w-full">
            {recorte !== "ativos" && <input type="hidden" name="recorte" value={recorte} />}
            <CampoDeBusca compact name="q" defaultValue={params.q ?? ""} placeholder="Buscar por nome, fornecedor ou responsável…" aria-label="Buscar contrato" className="w-80 max-w-full" />
          </FormularioDeFiltro>
        }
        filtros={<FiltrosDaTela naBarra campos={[{ chave: "recorte", rotulo: "Recorte", vazioLabel: "Ativos", opcoes: RECORTES.filter((r) => r.chave !== "ativos").map((r) => ({ value: r.chave, label: r.rotulo })) }]} />}
      >
        {visiveis.length === 0 ? (
          <EmptyState
            icon={<FileSignature />}
            title={contratos.length === 0 ? "Nenhum contrato cadastrado" : busca ? "Nada encontrado" : "Nenhum contrato neste recorte"}
            description={contratos.length === 0 ? (podeGerir ? "Cadastre o primeiro em “Novo contrato”: o software, o serviço ou o aluguel que o escritório paga." : "Os contratos aparecem aqui quando a coordenação do Financeiro cadastrar.") : undefined}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {visiveis.map((c) => (
                <Cartao key={c.id}>
                  <TopoDoCartao nome={c.name} valor={`${formatarReaisDeCentavos(c.mensal)}/mês`} />
                  <InfoDoCartao>
                    {c.supplier} · {CATEGORIAS_DE_CONTRATO[c.category as keyof typeof CATEGORIAS_DE_CONTRATO] ?? c.category}
                  </InfoDoCartao>
                  <InfoDoCartao>Renovação: {quando(c)}</InfoDoCartao>
                  <PeDoCartao>
                    <Selo tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].rotulo}</Selo>
                    {acoes(c)}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium text-left">Contrato</th>
                    <th className="py-2 pr-3 font-medium text-right">Valor</th>
                    <th className="py-2 pr-3 font-medium text-right">Por mês</th>
                    <th className="py-2 pr-3 font-medium text-left">Renovação</th>
                    <th className="py-2 pr-3 font-medium text-left">Responde</th>
                    <th className="py-2 font-medium text-right">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => (
                    <tr key={c.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                      <td className="py-2.5 pr-3">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold text-fg hover:text-brand transition-colors">
                            {c.name}
                          </a>
                        ) : (
                          <span className="font-semibold text-fg">{c.name}</span>
                        )}
                        <span className="block text-micro text-fg-muted">
                          {c.supplier} · {CATEGORIAS_DE_CONTRATO[c.category as keyof typeof CATEGORIAS_DE_CONTRATO] ?? c.category}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {formatarReaisDeCentavos(c.amountCents)}
                        <span className="block text-micro text-fg-muted">{(CICLOS[c.cycle as keyof typeof CICLOS] ?? c.cycle).toLowerCase()}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{c.status === "ATIVO" ? formatarReaisDeCentavos(c.mensal) : "—"}</td>
                      <td className="py-2.5 pr-3">
                        <span className="flex flex-col items-start gap-1">
                          <Selo tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].rotulo}</Selo>
                          <span className="text-micro text-fg-muted tabular-nums">
                            {quando(c)}
                            {c.autoRenew && " · renova sozinho"}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-fg-secondary">{c.ownerName ?? "—"}</td>
                      <td className="py-2.5">{acoes(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
