import Link from "next/link";
import { headers } from "next/headers";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, TIPOS, enderecoDoItem, hojeEmSaoPaulo } from "@/lib/tech-interno/regras";
import { PERIODOS_DO_RESUMO, deslocarPeriodo, ehPeriodoDoResumo, resumoEmTexto, type ItemParaResumo, type PeriodoDoResumo } from "@/lib/tech-interno/resumo";
import { resumoTech } from "@/lib/tech-interno/servidor";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Selo } from "@/components/ui/Selo";
import { CopiarResumo } from "@/components/tech-interno/CopiarResumo";

export const dynamic = "force-dynamic";

// O resumo do período do Controle interno (06/11/2026, pedido de 05/11): o que
// foi concluído, o que está em andamento e o que está planejado, no dia, na
// semana, no mês ou no ano. O mesmo resumo que a IA lê pelo MCP e pela API
// (`resumo_do_periodo`); aqui, com o texto pronto para colar num canal.

const NOME_DO_PERIODO: Record<PeriodoDoResumo, string> = { dia: "Dia", semana: "Semana", mes: "Mês", ano: "Ano" };
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Linha({ item, detalhe }: { item: ItemParaResumo; detalhe: React.ReactNode }) {
  const contexto = [TIPOS[item.type], item.systemName, item.assigneeName ?? "Sem responsável"].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <Link href={enderecoDoItem(item)} className="text-fg font-medium underline-offset-2 hover:text-brand hover:underline break-words">
          {item.title}
        </Link>
        <p className="text-helper text-fg-secondary">{contexto}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-helper text-fg-secondary sm:justify-end sm:text-right">{detalhe}</div>
    </li>
  );
}

function Secao({ id, titulo, vazio, children, quantos }: { id: string; titulo: string; vazio: string; quantos: number; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-20">
      <h2 id={`${id}-titulo`} className="text-card-title font-semibold text-fg">{titulo} <span className="text-fg-muted font-normal">({quantos})</span></h2>
      {quantos === 0 ? <p className="py-3 text-ui text-fg-muted">{vazio}</p> : <ul className="divide-y divide-border">{children}</ul>}
    </section>
  );
}

export default async function ResumoTechPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), params = await searchParams;
  const periodo: PeriodoDoResumo = ehPeriodoDoResumo(params.periodo) ? params.periodo : "semana";
  const hoje = hojeEmSaoPaulo();
  const pedida = typeof params.data === "string" && DATA.test(params.data) ? params.data : hoje;
  const dataIso = new Date(`${pedida}T00:00:00Z`).toISOString().slice(0, 10) === pedida ? pedida : hoje;
  const r = await resumoTech(ctx, periodo, dataIso);

  const href = (p: PeriodoDoResumo, d: string) => `${ROTA_TECH_INTERNO}/resumo?periodo=${p}${d === hoje ? "" : `&data=${d}`}`;
  const contemHoje = r.primeiroDia <= hoje && hoje <= r.ultimoDia;
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "";
  const base = host ? `${h.get("x-forwarded-proto")?.split(",")[0]?.trim() === "http" ? "http" : "https"}://${host}` : "";
  const texto = resumoEmTexto(`${NOME_DO_PERIODO[periodo]} de ${r.rotulo}`, r, (item) => `${base}${enderecoDoItem(item)}`);
  const nada = !r.concluidos.length && !r.emAndamento.length && !r.planejados.length && !r.cancelados.length;

  return (
    <PageContainer>
      <PageHeader
        title="Resumo do Controle interno"
        subtitle="O que a equipe Tech concluiu, tem em andamento e planejou no período. Concluídos e cancelados contam pela data da mudança de situação; em andamento é a situação de agora."
        action={
          <div className="flex flex-wrap gap-2">
            {!nada && <CopiarResumo texto={texto} />}
            <Button href={ROTA_TECH_INTERNO} variant="secondary">Controle interno</Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl label="Período" active={periodo} items={PERIODOS_DO_RESUMO.map((p) => ({ key: p.chave, label: p.rotulo, href: href(p.chave, dataIso) }))} />
        <nav aria-label="Outro período" className="flex items-center gap-1">
          <Button href={href(periodo, deslocarPeriodo(periodo, dataIso, -1))} variant="ghost" size="sm" aria-label={`${NOME_DO_PERIODO[periodo]} anterior`}>
            <ChevronLeft size={14} aria-hidden />
          </Button>
          <span className="min-w-36 text-center text-ui font-medium text-fg" aria-live="polite">{r.rotulo}</span>
          <Button href={href(periodo, deslocarPeriodo(periodo, dataIso, 1))} variant="ghost" size="sm" aria-label={`${NOME_DO_PERIODO[periodo]} seguinte`}>
            <ChevronRight size={14} aria-hidden />
          </Button>
          {!contemHoje && <Button href={href(periodo, hoje)} variant="ghost" size="sm">Hoje</Button>}
        </nav>
      </div>

      {nada ? (
        <Card>
          <EmptyState icon={<CalendarRange />} title="Nada neste período" description="Nenhum item foi concluído, cancelado ou planejado aqui, e não há item em andamento." />
        </Card>
      ) : (
        <>
          <FaixaDeTotais
            itens={[
              { rotulo: "Concluídos", valor: String(r.concluidos.length), tom: "text-success-fg", href: "#concluidos" },
              { rotulo: "Em andamento", valor: String(r.emAndamento.length), tom: "text-brand", href: "#em-andamento" },
              { rotulo: "Planejados", valor: String(r.planejados.length), href: "#planejados" },
              { rotulo: "Cancelados", valor: String(r.cancelados.length), tom: "text-fg-muted", href: "#cancelados" },
            ]}
          />
          <Card className="mt-5 flex flex-col gap-6 p-5">
            <Secao id="concluidos" titulo="Concluídos no período" quantos={r.concluidos.length} vazio="Nenhum item concluído neste período.">
              {r.concluidos.map((i) => (
                <Linha key={i.id} item={i} detalhe={<>
                  <span>Concluído em {formatInstantDate(i.em)}</span>
                  {i.prUrl && <a href={i.prUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-brand hover:underline">PR</a>}
                </>} />
              ))}
            </Secao>
            <Secao id="em-andamento" titulo="Em andamento agora" quantos={r.emAndamento.length} vazio="Nenhum item em andamento.">
              {r.emAndamento.map((i) => (
                <Linha key={i.id} item={i} detalhe={<>
                  <Selo tom={i.status === "VALIDATION" ? "atencao" : "marca"}>{i.status === "VALIDATION" ? "Em validação" : "Em andamento"}</Selo>
                  {!i.mexidoNoPeriodo && <span>sem alteração no período</span>}
                  {i.dueDate && <span>prazo {dataBr(i.dueDate)}</span>}
                </>} />
              ))}
            </Secao>
            <Secao id="planejados" titulo="Planejados" quantos={r.planejados.length} vazio="Nenhum item pendente entrou ou vence neste período.">
              {r.planejados.map((i) => (
                <Linha key={i.id} item={i} detalhe={<>
                  {i.entrouNoPeriodo && <span>entrou em {formatInstantDate(i.createdAt)}</span>}
                  {i.dueDate && <span>prazo {dataBr(i.dueDate)}</span>}
                </>} />
              ))}
            </Secao>
            <Secao id="cancelados" titulo="Cancelados no período" quantos={r.cancelados.length} vazio="Nenhum item cancelado neste período.">
              {r.cancelados.map((i) => <Linha key={i.id} item={i} detalhe={<span>Cancelado em {formatInstantDate(i.em)}</span>} />)}
            </Secao>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
