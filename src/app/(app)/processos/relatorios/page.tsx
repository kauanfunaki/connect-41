import { notFound } from "next/navigation";
import Link from "next/link";
import { BarChart3, Table2, FolderOpen, AlertTriangle, CheckCircle2, RotateCcw, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BotaoDeExportar } from "@/components/shared/BotaoDeExportar";
import { LinhasDeSituacao, BarrasRanqueadas, ColunasPareadas } from "@/components/shared/Graficos";
import { CartoesNoCelular, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { PERIODOS, lerPeriodo } from "@/lib/societario/relatorios";
import { dadosDosRelatorios, type DadosDosRelatorios } from "@/lib/societario/relatoriosServidor";
import {
  RELATORIOS,
  lerRelatorio,
  lerVisao,
  leituraDoSla,
  leituraDasVoltas,
  leituraDaProdutividade,
  leituraDoCusto,
  type ChaveDoRelatorio,
  type VisaoDoRelatorio,
} from "@/lib/societario/relatoriosNaTela";
import { formatarReaisDeCentavos, formatarNumero } from "@/lib/format";
import { leituraDoTempoPorEtapa } from "@/lib/societario/tempoPorEtapa";

const MODULE = "societario_relatorios";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

const numero = (n: number | null) => (n === null ? "—" : formatarNumero(n, 1));

const faixaPrevista = (min: number | null, max: number | null) =>
  max === null ? "sem previsão" : min !== null && min !== max ? `${min}–${max}` : String(max);

const TH = "py-2 pr-3 font-medium";
const TD = "py-2 pr-3 tabular-nums";
const CABECALHO = "text-fs-1 uppercase tracking-wide text-fg-muted border-b border-border";

/** Quantas linhas a tela mostra nas listas de processos — a exportação leva todas. */
const LINHAS_NA_TELA = 30;

/**
 * Relatórios do Societário, um por vez (escolha do Kauan na página de opções
 * de 04/11/2026 — Relatórios B). Eram quatro tabelas empilhadas, densas e sem
 * exportação. Agora:
 *
 * - a lista dos relatórios à esquerda (no celular, em cima), e o escolhido à
 *   direita;
 * - a troca Gráfico | Tabela no cabeçalho do relatório — o gráfico é o padrão,
 *   e a tabela guarda o número exato;
 * - "Exportar" em Excel ou CSV, do relatório e do período que estão na tela;
 * - uma frase com a leitura do relatório, embaixo.
 *
 * Relatório, visão e período vivem na URL: link direto e voltar do navegador
 * funcionam.
 */
export default async function RelatoriosDoSocietarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const periodo = lerPeriodo(params.periodo);
  const relatorio = lerRelatorio(params.relatorio);
  const visao = lerVisao(params.visao);
  const d = await dadosDosRelatorios(ctx.tenantId, periodo);

  const href = (mudar: { relatorio?: ChaveDoRelatorio; visao?: VisaoDoRelatorio }) => {
    const q = new URLSearchParams();
    if (params.periodo) q.set("periodo", periodo.chave);
    const r = mudar.relatorio ?? relatorio.chave;
    if (r !== RELATORIOS[0].chave) q.set("relatorio", r);
    const v = mudar.visao ?? visao;
    if (v !== "grafico") q.set("visao", v);
    const s = q.toString();
    return s ? `/processos/relatorios?${s}` : "/processos/relatorios";
  };

  const leitura: Record<ChaveDoRelatorio, string> = {
    sla: leituraDoSla(d.sla),
    voltas: leituraDasVoltas(d.voltas, d.maisVoltas),
    produtividade: leituraDaProdutividade(d.produtividade),
    custo: leituraDoCusto(d.custos, d.totais),
    tempo: leituraDoTempoPorEtapa(d.tempoPorEtapa),
  };

  return (
    <PageContainer>
      <PageHeader
        title="Relatórios do Societário"
        subtitle={`Processos abertos agora, mais os concluídos nos últimos ${periodo.rotulo}. Prazo em dias úteis, descontados os feriados do escritório.`}
      />

      <FiltrosDaTela
        className="mb-5"
        campos={[
          {
            chave: "periodo",
            rotulo: "Período",
            vazioLabel: `Últimos ${PERIODOS[1].rotulo}`,
            opcoes: PERIODOS.filter((p) => p !== PERIODOS[1]).map((p) => ({ value: p.chave, label: `Últimos ${p.rotulo}` })),
            sempreVisivel: true,
          },
        ]}
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Abertos agora", valor: formatarNumero(d.abertos, 0), icone: <FolderOpen /> },
          {
            rotulo: "Abertos com prazo estourado",
            valor: formatarNumero(d.estouradosAbertos, 0),
            tom: d.estouradosAbertos > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
          },
          { rotulo: `Concluídos em ${periodo.rotulo}`, valor: formatarNumero(d.concluidos, 0), icone: <CheckCircle2 /> },
          {
            rotulo: "Processos com volta",
            valor: d.voltas.percentualComVolta === null ? "—" : `${d.voltas.percentualComVolta}%`,
            icone: <RotateCcw />,
            detalhe: `${d.voltas.totalDeVoltas} ${d.voltas.totalDeVoltas === 1 ? "volta" : "voltas"}`,
          },
        ]}
      />

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        {/* A lista dos relatórios: navegação, com a página atual marcada. */}
        <nav aria-label="Relatórios">
          <Card className="p-2">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {RELATORIOS.map((r) => {
                const ativo = r.chave === relatorio.chave;
                return (
                  <li key={r.chave} className="shrink-0">
                    <Link
                      href={href({ relatorio: r.chave })}
                      aria-current={ativo ? "page" : undefined}
                      className={`flex min-h-9 items-center rounded-md px-3 py-2 text-ui transition-colors ${
                        ativo ? "bg-brand-subtle font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                      }`}
                    >
                      {r.rotulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </nav>

        <Card as="section" aria-labelledby="relatorio-aberto" className="p-4 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h2 id="relatorio-aberto" className="text-section font-semibold text-fg">
                {relatorio.rotulo}
              </h2>
              <p className="text-fs-2 text-fg-muted max-w-2xl">{relatorio.explicacao}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                label="Ver como"
                active={visao}
                items={[
                  { key: "grafico", label: "Gráfico", icon: <BarChart3 size={14} />, href: href({ visao: "grafico" }) },
                  { key: "tabela", label: "Tabela", icon: <Table2 size={14} />, href: href({ visao: "tabela" }) },
                ]}
              />
              <BotaoDeExportar
                href={`/processos/relatorios/exportar?${new URLSearchParams({ relatorio: relatorio.chave, periodo: periodo.chave })}`}
                dica={`Vai o relatório inteiro do período (últimos ${periodo.rotulo}), mesmo o que a tela não mostra.`}
              />
            </div>
          </div>

          {relatorio.chave === "sla" && <Sla d={d} visao={visao} />}
          {relatorio.chave === "voltas" && <Voltas d={d} visao={visao} />}
          {relatorio.chave === "produtividade" && <Produtividade d={d} visao={visao} periodo={periodo.rotulo} />}
          {relatorio.chave === "custo" && <Custo d={d} visao={visao} />}
          {relatorio.chave === "tempo" && <TempoPorEtapa d={d} visao={visao} />}

          {/* A leitura do relatório numa frase: o que o número quer dizer. */}
          <Aviso tom="neutro" icone={<Lightbulb />}>
            <p className="text-fg">{leitura[relatorio.chave]}</p>
          </Aviso>
        </Card>
      </div>
    </PageContainer>
  );
}

// ─── SLA por tipo ────────────────────────────────────────────────────────────

function Sla({ d, visao }: { d: DadosDosRelatorios; visao: VisaoDoRelatorio }) {
  if (visao === "grafico") {
    return (
      <LinhasDeSituacao
        titulo="SLA por tipo"
        vazio="Nenhum processo no período."
        linhas={d.sla.map((l) => ({
          chave: l.tipoId,
          rotulo: l.tipoNome,
          sublabel: `previsto ${faixaPrevista(l.previstoMin, l.previstoMax)}${l.previstoMax === null ? "" : " dias"}`,
          segmentos:
            l.previstoMax === null
              ? [{ chave: "sem", rotulo: "Sem previsão", valor: l.total, tom: "neutro" as const }]
              : [
                  { chave: "dentro", rotulo: "Dentro", valor: l.dentro, tom: "ok" as const },
                  { chave: "limite", rotulo: "No limite", valor: l.noLimite, tom: "atencao" as const },
                  { chave: "estourado", rotulo: "Estourado", valor: l.estourados, tom: "critico" as const },
                ],
        }))}
      />
    );
  }
  return (
    <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className={CABECALHO}>
            <th className={TH}>Tipo</th>
            <th className={TH}>Previsto</th>
            <th className={TH}>Processos</th>
            <th className={TH}>Dentro</th>
            <th className={TH}>No limite</th>
            <th className={TH}>Estourados</th>
            <th className={TH}>Média de dias</th>
            <th className={TH}>Média de voltas</th>
          </tr>
        </thead>
        <tbody>
          {d.sla.map((l) => (
            <tr key={l.tipoId} className="border-b border-border-soft">
              <td className="py-2 pr-3 font-medium">{l.tipoNome}</td>
              <td className={TD}>{faixaPrevista(l.previstoMin, l.previstoMax)}</td>
              <td className={TD}>
                {l.total}
                <span className="text-fg-muted"> ({l.concluidos} concl.)</span>
              </td>
              {/* Tipo sem previsão (alvará) não tem dentro nem fora: traço em vez de zero. */}
              <td className={TD}>{l.previstoMax === null ? "—" : l.dentro}</td>
              <td className={TD}>{l.previstoMax === null ? "—" : l.noLimite}</td>
              <td className={`${TD} ${l.estourados > 0 ? "text-danger font-medium" : ""}`}>{l.previstoMax === null ? "—" : l.estourados}</td>
              <td className={TD}>{numero(l.mediaDeDias)}</td>
              <td className={TD}>{numero(l.mediaDeVoltas)}</td>
            </tr>
          ))}
          {d.sla.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-fg-muted">
                Nenhum processo no período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Processos que mais voltaram ─────────────────────────────────────────────

function Voltas({ d, visao }: { d: DadosDosRelatorios; visao: VisaoDoRelatorio }) {
  const lista = d.maisVoltas.slice(0, LINHAS_NA_TELA);
  if (lista.length === 0) return <p className="text-fs-3 text-fg-muted">Nenhuma volta de exigência no período.</p>;
  const resto = d.maisVoltas.length - lista.length;
  const nota = resto > 0 && (
    <p className="text-fs-2 text-fg-muted">
      Mostrando os {lista.length} que mais voltaram de {d.maisVoltas.length}; a exportação leva todos.
    </p>
  );

  if (visao === "grafico") {
    return (
      <>
        <BarrasRanqueadas
          titulo="Processos que mais voltaram"
          formatar={(n) => `${n} ${n === 1 ? "volta" : "voltas"}`}
          linhas={lista.map((p) => ({
            chave: p.id,
            rotulo: `${p.tipoNome} — ${p.empresaNome}`,
            sublabel: `${p.prazo.dias} dias úteis · ${p.concluidoEm ? "concluído" : "aberto"}`,
            href: `/processos/${p.id}`,
            segmentos: [{ chave: "voltas", rotulo: "Voltas", valor: p.voltas, tom: "atencao" as const }],
          }))}
        />
        {nota}
      </>
    );
  }
  return (
    <>
      <CartoesNoCelular>
        {lista.map((p) => (
          <Cartao key={p.id}>
            <TopoDoCartao
              nome={
                <Link href={`/processos/${p.id}`} className="text-fg hover:text-brand transition-colors">
                  {p.tipoNome} — {p.empresaNome}
                </Link>
              }
            />
            <InfoDoCartao className="tabular-nums">
              <span className="font-medium text-danger">
                {p.voltas} {p.voltas === 1 ? "volta" : "voltas"}
              </span>{" "}
              · {p.prazo.dias} dias úteis
            </InfoDoCartao>
            <PeDoCartao>{p.concluidoEm ? <Selo tom="sucesso">Concluído</Selo> : <Selo tom="marca">Aberto</Selo>}</PeDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>
      <div className="c41-tabela overflow-x-auto rounded-lg border border-border hidden md:block">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className={CABECALHO}>
              <th className={TH}>Processo</th>
              <th className={TH}>Voltas</th>
              <th className={TH}>Dias úteis</th>
              <th className={TH}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b border-border-soft">
                <td className="py-2 pr-3">
                  <Link href={`/processos/${p.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                    {p.tipoNome} — {p.empresaNome}
                  </Link>
                </td>
                <td className={`${TD} text-danger font-medium`}>{p.voltas}</td>
                <td className={TD}>{p.prazo.dias}</td>
                <td className="py-2 pr-3">{p.concluidoEm ? <Selo tom="sucesso">Concluído</Selo> : <Selo tom="marca">Aberto</Selo>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota}
    </>
  );
}

// ─── Produtividade por responsável ───────────────────────────────────────────

function Produtividade({ d, visao, periodo }: { d: DadosDosRelatorios; visao: VisaoDoRelatorio; periodo: string }) {
  if (d.produtividade.length === 0) return <p className="text-fs-3 text-fg-muted">Nenhum processo no período.</p>;
  if (visao === "grafico") {
    return (
      <ColunasPareadas
        titulo={`Concluídos em ${periodo} e abertos, por responsável`}
        series={["Concluídos", "Abertos"]}
        pares={d.produtividade.map((l) => ({
          chave: l.responsavelId ?? "nenhum",
          rotulo: l.nome,
          valores: [l.concluidosNoPeriodo, l.abertos] as const,
          dica: l.estouradosAbertos > 0 ? `${l.estouradosAbertos} abertos estourados` : undefined,
        }))}
      />
    );
  }
  return (
    <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[680px]">
        <thead>
          <tr className={CABECALHO}>
            <th className={TH}>Responsável</th>
            <th className={TH}>Concluídos</th>
            <th className={TH}>Média de dias</th>
            <th className={TH}>Voltas nos concluídos</th>
            <th className={TH}>Abertos</th>
            <th className={TH}>Abertos estourados</th>
          </tr>
        </thead>
        <tbody>
          {d.produtividade.map((l) => (
            <tr key={l.responsavelId ?? "nenhum"} className="border-b border-border-soft">
              <td className="py-2 pr-3 font-medium">{l.nome}</td>
              <td className={TD}>{l.concluidosNoPeriodo}</td>
              <td className={TD}>{numero(l.mediaDeDiasDosConcluidos)}</td>
              <td className={TD}>{l.voltasDosConcluidos}</td>
              <td className={TD}>{l.abertos}</td>
              <td className={`${TD} ${l.estouradosAbertos > 0 ? "text-danger font-medium" : ""}`}>{l.estouradosAbertos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tempo por etapa ─────────────────────────────────────────────────────────

function TempoPorEtapa({ d, visao }: { d: DadosDosRelatorios; visao: VisaoDoRelatorio }) {
  const linhas = d.tempoPorEtapa;
  if (linhas.length === 0) return <p className="text-fs-3 text-fg-muted">Nenhuma etapa concluída no período com início registrado.</p>;
  if (visao === "grafico") {
    // As 15 mais demoradas, em mediana: é onde o processo espera.
    const lista = [...linhas].sort((a, b) => b.medianaDias - a.medianaDias).slice(0, 15);
    return (
      <BarrasRanqueadas
        titulo="Tempo por etapa"
        formatar={(n) => `${formatarNumero(n, 1)} dias úteis`}
        linhas={lista.map((l) => ({
          chave: l.chave,
          rotulo: l.etapa,
          sublabel: `${l.tipoNome} · ${l.concluidas} ${l.concluidas === 1 ? "concluída" : "concluídas"} · a mais longa com ${l.maximoDias}`,
          segmentos: [{ chave: "mediana", rotulo: "Mediana", valor: l.medianaDias, tom: "proximo" as const }],
        }))}
      />
    );
  }
  return (
    <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className={CABECALHO}>
            <th className={TH}>Tipo</th>
            <th className={TH}>Etapa</th>
            <th className={TH}>Concluídas</th>
            <th className={TH}>Mediana (dias úteis)</th>
            <th className={TH}>Mais longa</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-border-soft">
              <td className="py-2 pr-3 font-medium">{l.tipoNome}</td>
              <td className="py-2 pr-3">{l.etapa}</td>
              <td className={TD}>{l.concluidas}</td>
              <td className={TD}>{formatarNumero(l.medianaDias, 1)}</td>
              <td className={TD}>{l.maximoDias}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Custo em taxas por processo ─────────────────────────────────────────────

function Custo({ d, visao }: { d: DadosDosRelatorios; visao: VisaoDoRelatorio }) {
  const lista = d.custos.slice(0, LINHAS_NA_TELA);
  if (lista.length === 0) return <p className="text-fs-3 text-fg-muted">Nenhuma taxa registrada nos processos do período.</p>;
  const total = (
    <p className="text-fs-3 tabular-nums">
      <strong>{formatarReaisDeCentavos(d.totais.totalCentavos)}</strong>
      {d.totais.custoDasVoltasCentavos > 0 && (
        <span className="text-warning-fg"> · {formatarReaisDeCentavos(d.totais.custoDasVoltasCentavos)} de reapresentação</span>
      )}
    </p>
  );
  const nota = d.custos.length > lista.length && (
    <p className="text-fs-2 text-fg-muted">
      Mostrando os {lista.length} mais caros de {d.custos.length}; o total soma todos, e a exportação leva todos.
    </p>
  );

  if (visao === "grafico") {
    return (
      <>
        {total}
        <BarrasRanqueadas
          titulo="Custo em taxas por processo"
          formatar={formatarReaisDeCentavos}
          linhas={lista.map((l) => ({
            chave: l.id,
            rotulo: `${l.tipoNome} — ${l.empresaNome}`,
            sublabel: `${l.voltas} ${l.voltas === 1 ? "volta" : "voltas"} · ${formatarReaisDeCentavos(l.pagoCentavos)} pagos`,
            href: `/processos/${l.id}`,
            segmentos: [
              { chave: "primeira", rotulo: "Primeira apresentação", valor: l.totalCentavos - l.custoDasVoltasCentavos, tom: "proximo" as const },
              { chave: "voltas", rotulo: "Reapresentação", valor: l.custoDasVoltasCentavos, tom: "atencao" as const },
            ],
          }))}
        />
        {nota}
      </>
    );
  }
  return (
    <>
      {total}
      <CartoesNoCelular>
        {lista.map((l) => (
          <Cartao key={l.id}>
            <TopoDoCartao
              nome={
                <Link href={`/processos/${l.id}`} className="text-fg hover:text-brand transition-colors">
                  {l.tipoNome} — {l.empresaNome}
                </Link>
              }
              valor={formatarReaisDeCentavos(l.totalCentavos)}
            />
            <InfoDoCartao className="tabular-nums">
              {formatarReaisDeCentavos(l.pagoCentavos)} pagos · {l.voltas} {l.voltas === 1 ? "volta" : "voltas"}
            </InfoDoCartao>
            {l.custoDasVoltasCentavos > 0 && (
              <InfoDoCartao className="tabular-nums text-warning-fg">{formatarReaisDeCentavos(l.custoDasVoltasCentavos)} das voltas</InfoDoCartao>
            )}
          </Cartao>
        ))}
      </CartoesNoCelular>
      <div className="c41-tabela overflow-x-auto rounded-lg border border-border hidden md:block">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className={CABECALHO}>
              <th className={TH}>Processo</th>
              <th className={TH}>Voltas</th>
              <th className={TH}>Total</th>
              <th className={TH}>Pago</th>
              <th className={TH}>Das voltas</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => (
              <tr key={l.id} className="border-b border-border-soft">
                <td className="py-2 pr-3">
                  <Link href={`/processos/${l.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                    {l.tipoNome} — {l.empresaNome}
                  </Link>
                </td>
                <td className={TD}>{l.voltas}</td>
                <td className={TD}>{formatarReaisDeCentavos(l.totalCentavos)}</td>
                <td className={TD}>{formatarReaisDeCentavos(l.pagoCentavos)}</td>
                <td className={`${TD} ${l.custoDasVoltasCentavos > 0 ? "text-warning-fg" : ""}`}>{formatarReaisDeCentavos(l.custoDasVoltasCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota}
    </>
  );
}
