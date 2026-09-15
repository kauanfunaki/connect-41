import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate } from "@/lib/format";
import { saoPauloParts, addDaysToKey, mondayOfWeek, firstOfMonth, monthYearLabel } from "@/lib/agenda";
import {
  agruparAgenda,
  fimDoDia,
  lerVisaoDaAgenda,
  ultimoDiaDaAgenda,
  JANELA_DA_AGENDA,
  type VisaoDaAgenda,
} from "@/lib/societario/prazos";
import { itensDePrazo } from "@/lib/societario/painel-data";
import { AbasDePrazos } from "@/components/societario/AbasDePrazos";
import { ListaDePrazos } from "@/components/societario/ListaDePrazos";

const MODULE = "societario_prazos";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

const VISOES: { chave: VisaoDaAgenda; rotulo: string }[] = [
  { chave: "semana", rotulo: "Por semana" },
  { chave: "mes", rotulo: "Por mês" },
];

// A chave vira data ao meio-dia UTC para formatar: é o mesmo dia civil em São
// Paulo, e `formatInstantDate` não o empurra para a véspera.
const diaDaChave = (chave: string) => new Date(`${chave}T12:00:00Z`);

export default async function AgendaDePrazosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const visao = lerVisaoDaAgenda(params.visao);
  const responsaveis = await getSectorUsers(ctx.tenantId, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const responsavelFiltro = responsaveis.some((r) => r.id === params.responsavel) ? params.responsavel : undefined;

  const agora = new Date();
  const hojeChave = saoPauloParts(agora).dateKey;
  const ate = fimDoDia(ultimoDiaDaAgenda(visao, agora));

  const itens = await itensDePrazo(ctx.tenantId, {
    responsavelId: responsavelFiltro,
    ate,
    licencasAte: ate,
  });
  const grupos = agruparAgenda(itens, (i) => i.data!, visao, agora);
  const grupoAtual = visao === "semana" ? mondayOfWeek(hojeChave) : firstOfMonth(hojeChave);

  const tituloDoGrupo = (chave: string) => {
    if (chave === "vencidos") return "Vencidos";
    if (visao === "mes") return monthYearLabel(chave);
    return `Semana de ${formatInstantDate(diaDaChave(chave), { day: "2-digit", month: "2-digit" })} a ${formatInstantDate(
      diaDaChave(addDaysToKey(chave, 6)),
      { day: "2-digit", month: "2-digit" }
    )}`;
  };

  const hrefDaVisao = (chave: VisaoDaAgenda) => {
    const q = new URLSearchParams();
    if (chave !== "semana") q.set("visao", chave);
    if (responsavelFiltro) q.set("responsavel", responsavelFiltro);
    const s = q.toString();
    return s ? `/societario/agenda?${s}` : "/societario/agenda";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Exigências e prazos"
        subtitle={`Prazo do órgão, vencimento de taxa, validade de licença e prazo combinado com o cliente — numa linha do tempo só. ${
          visao === "semana" ? `Próximas ${JANELA_DA_AGENDA.semana} semanas` : `Próximos ${JANELA_DA_AGENDA.mes} meses`
        }, e tudo o que já venceu.`}
      />
      <AbasDePrazos ativa="agenda" />

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {VISOES.map((v) => (
            <Link
              key={v.chave}
              href={hrefDaVisao(v.chave)}
              aria-current={v.chave === visao ? "page" : undefined}
              className={
                v.chave === visao
                  ? "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                  : "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
              }
            >
              {v.rotulo}
            </Link>
          ))}
        </div>

        <form method="get" action="/societario/agenda" className="flex flex-wrap items-end gap-2">
          {visao !== "semana" && <input type="hidden" name="visao" value={visao} />}
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-responsavel" className="text-[11px] text-fg-muted">
              Responsável do processo
            </label>
            <Select id="filtro-responsavel" name="responsavel" defaultValue={responsavelFiltro ?? ""} compact>
              <option value="">Todos</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Filtrar
          </Button>
        </form>
      </div>

      {grupos.length === 0 ? (
        <EmptyState
          title="Nenhum prazo no período"
          description="Exigência com prazo do órgão, taxa com vencimento, licença com validade e processo com prazo combinado aparecem aqui."
          icon={<CalendarDays />}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map((g) => (
            <section
              key={g.chave}
              className={g.vencido ? "rounded-lg border border-danger/30 bg-danger-bg/40 px-3 pt-2" : undefined}
            >
              <h2
                className={`text-[13px] font-semibold mb-1 ${
                  g.vencido ? "text-danger" : g.chave === grupoAtual ? "text-brand" : "text-fg-secondary"
                }`}
              >
                {tituloDoGrupo(g.chave)}
                {g.chave === grupoAtual && (visao === "semana" ? " · esta semana" : " · este mês")}{" "}
                <span className="tabular-nums text-fg-muted font-normal">{g.itens.length}</span>
              </h2>
              <ListaDePrazos itens={g.itens} hoje={agora} mostrarResponsavel />
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
