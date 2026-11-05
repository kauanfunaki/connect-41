import { ArrowRight, Palmtree, GraduationCap, ClipboardList, Scale, Users, Repeat, Stethoscope, Briefcase, Wallet, Gift, Lock } from "lucide-react";
import { abrirTelaDoModulo, alcancaModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { FaixaDeTotais, type ItemDeTotal } from "@/components/ui/FaixaDeTotais";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { carregarIndicadoresRH, MESES_DO_HISTORICO, type IndicadoresRH } from "@/lib/indicadoresRH";
import { mesPorExtenso, periodoDosMeses, rotuloDoMes } from "@/lib/indicadoresRHMensal";
import { AVISO_DAS_FERIAS_DIAS } from "@/lib/home/paineis";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { formatarReais } from "@/lib/format";
import { MESES } from "@/lib/datas/calendario";
import { PageContainer } from "@/components/shared/PageContainer";
import { ExportIndicadoresButtons } from "@/components/indicadoresRH/ExportIndicadoresButtons";
import { Colunas, ColunasDeSituacao, Funil, LinhaSobreColunas, Painel, numero } from "@/components/shared/Graficos";

// Indicadores de RH — 05/11/2026, opção A da tela 9 escolhida pelo Kauan ("4
// números e um gráfico por tema"). Eram 17 cartões em 5 faixas e nenhum
// gráfico: a foto de hoje, sem tendência. Agora são os 4 números que
// respondem "como está o quadro" e um gráfico mês a mês por tema. Os números
// que saíram da tela (admissões e demissões de 30 dias, candidatos por vaga,
// taxas, treinamentos, desempenho) continuam na exportação.

// Os cartões abaixo são o retrato agregado; estes relatórios são a lista
// acionável ("quem está vencido", "o que falta") que o painel não dá.
const RELATORIOS = [
  {
    href: "/indicadores-rh/ferias",
    label: "Férias",
    description: "Vencidas, a vencer e programadas, por colaborador",
    icon: <Palmtree size={18} />,
    sensitive: false,
  },
  {
    href: "/indicadores-rh/treinamentos",
    label: "Treinamentos",
    description: "Realizados, vencidos e a vencer, com validade calculada",
    icon: <GraduationCap size={18} />,
    sensitive: false,
  },
  {
    href: "/indicadores-rh/pendencias",
    label: "Pendências",
    description: "Documentos, admissões e exames em aberto",
    icon: <ClipboardList size={18} />,
    sensitive: false,
  },
  {
    href: "/indicadores-rh/distorcoes-salariais",
    label: "Distorções salariais",
    description: "Quem está fora da faixa do próprio cargo",
    icon: <Scale size={18} />,
    sensitive: true,
  },
];

/**
 * Aonde cada número e cada gráfico leva (decisão D6 de 15/10: todo número é
 * atalho). `modulo` é o que a tela de destino pede: sem acesso a ele, fica sem
 * link, em vez de levar a um 404. Os relatórios desta área não pedem nada além
 * desta tela.
 */
const DESTINOS = {
  quadro: { href: "/colaboradores-clientes", modulo: "recrutamento_colaboradores_clientes" },
  turnover: { href: "/desligamentos", modulo: "dp_colaboradores" },
  absenteismo: { href: "/afastamentos", modulo: "dp_afastamentos" },
  vagas: { href: "/vagas?status=ABERTA", modulo: "recrutamento_vagas" },
  ferias: { href: "/indicadores-rh/ferias" },
  horas: { href: "/horas-extras", modulo: "dp_horas_extras" },
  funil: { href: "/vagas", modulo: "recrutamento_vagas" },
} satisfies Record<string, { href: string; modulo?: string }>;

type ChaveDoDestino = keyof typeof DESTINOS;

/**
 * Os atalhos que a pessoa alcança, numa leitura só dos módulos do escritório.
 * Eram 8 `podeNoModulo` em paralelo, cada um com 5 consultas (dono, setores
 * ligados, estados dos módulos com plano e ligados) — ~40 consultas para
 * decidir 8 links. `getTenantModuleStates` traz os setores e o "ligado" de
 * todos de uma vez; a regra (`alcancaModulo`) é a mesma do gate.
 */
async function hrefsAlcancados(ctx: AuthContext): Promise<Record<ChaveDoDestino, string | undefined>> {
  const estados = new Map((await getTenantModuleStates(ctx.tenantId)).map((s) => [s.code, s]));
  const pode = (modulo?: string) => {
    if (!modulo) return true;
    const s = estados.get(modulo);
    return s !== undefined && alcancaModulo(ctx, s.sectorCodes, s.enabled, "ver");
  };
  return Object.fromEntries(
    Object.entries(DESTINOS).map(([chave, d]) => [chave, pode("modulo" in d ? d.modulo : undefined) ? d.href : undefined])
  ) as Record<ChaveDoDestino, string | undefined>;
}

const DECIMAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function porcentagem(n: number | null): string {
  return n === null ? "—" : `${DECIMAL.format(n)}%`;
}

function horas(n: number): string {
  return `${DECIMAL.format(n)} h`;
}

/** "+4 em 6 meses", "−2 em 6 meses", "igual há 6 meses". O sinal por extenso, não só a cor. */
function variacaoEscrita(v: number | null): string | undefined {
  if (v === null) return undefined;
  if (v === 0) return "igual há 6 meses";
  return `${v > 0 ? "+" : "−"}${numero(Math.abs(v))} em 6 meses`;
}

function quatroNumeros(d: IndicadoresRH, hrefs: Record<ChaveDoDestino, string | undefined>): ItemDeTotal[] {
  const saidas = d.quadro.reduce((s, m) => s + m.desligamentos, 0);
  return [
    { rotulo: "Headcount", valor: numero(d.headcount), detalhe: variacaoEscrita(d.variacao6m), icone: <Users size={15} />, href: hrefs.quadro },
    {
      rotulo: "Turnover (12 meses)",
      valor: porcentagem(d.turnover12m),
      detalhe: `${numero(saidas)} ${saidas === 1 ? "desligamento" : "desligamentos"} ÷ headcount médio`,
      icone: <Repeat size={15} />,
      href: hrefs.turnover,
    },
    {
      rotulo: "Absenteísmo (30 dias)",
      valor: porcentagem(d.absenteismo.pct),
      detalhe: `${numero(d.absenteismo.diasPerdidos)} ${d.absenteismo.diasPerdidos === 1 ? "dia perdido" : "dias perdidos"}`,
      icone: <Stethoscope size={15} />,
      href: hrefs.absenteismo,
    },
    {
      rotulo: "Vagas abertas",
      valor: numero(d.vagasAbertas),
      detalhe: d.tempoDeContratacao === null ? "Sem contratação registrada" : `${numero(d.tempoDeContratacao)} dias para contratar, em média`,
      icone: <Briefcase size={15} />,
      href: hrefs.vagas,
    },
  ];
}

/** Lê `?meses=12`; qualquer outro valor é o padrão de 6. */
function mesesEscolhidos(valor: string | string[] | undefined): 6 | 12 {
  return valor === "12" ? 12 : 6;
}

export default async function IndicadoresRhPage({ searchParams }: { searchParams: Promise<{ meses?: string | string[] }> }) {
  const { ctx } = await abrirTelaDoModulo("gestao_indicadores_rh");
  // Uma espera só: a permissão de salário é consultada uma vez (eram duas,
  // aqui e dentro do cálculo) e entra no carregamento como promessa — os custos
  // esperam por ela, o resto não —, e os atalhos correm ao lado dos dados.
  const salario = canViewSensitiveField(ctx, "SALARIO");
  const [veSalario, d, hrefs, params] = await Promise.all([
    salario,
    carregarIndicadoresRH(ctx, { veSalario: salario }),
    hrefsAlcancados(ctx),
    searchParams,
  ]);
  const janela = mesesEscolhidos(params.meses);
  const corte = MESES_DO_HISTORICO - janela;

  const relatorios = RELATORIOS.filter((r) => !r.sensitive || veSalario);
  const quadro = d.quadro.slice(corte);
  const ferias = d.ferias.slice(corte);
  const horasExtras = d.horasExtras.slice(corte);
  const mesAtual = d.meses[d.meses.length - 1];
  const vencidasHoje = d.ferias[d.ferias.length - 1].vencidas;
  const totalDoFunil = d.funil.etapas[0].valor;

  return (
    <PageContainer>
      <PageHeader
        title="Indicadores de RH"
        subtitle="Quadro, férias, jornada e recrutamento da equipe, mês a mês, a partir do que é lançado no DP e no Recrutamento."
        action={<ExportIndicadoresButtons />}
      />

      <section aria-label="Números principais">
        <FaixaDeTotais itens={quatroNumeros(d, hrefs)} className="" rotulosInteiros />
      </section>

      {/* O período vale para os três gráficos mês a mês; o funil é sempre do trimestre. */}
      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-fs-3 text-fg-secondary">
          Gráficos de <span className="font-medium text-fg">{periodoDosMeses(quadro.map((m) => m.mes))}</span>
        </p>
        <SegmentedControl
          label="Período dos gráficos"
          active={String(janela)}
          items={[
            { key: "6", label: "6 meses", href: "/indicadores-rh" },
            { key: "12", label: "12 meses", href: "/indicadores-rh?meses=12" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <Painel setor="Quadro" cor="var(--c41-setor)" titulo="Headcount, admissões e desligamentos" href={hrefs.quadro}>
          <LinhaSobreColunas
            titulo={`Headcount, admissões e desligamentos por mês, ${periodoDosMeses(quadro.map((m) => m.mes))}`}
            serieDaLinha="Headcount"
            seriesDasColunas={["Admissões", "Desligamentos"]}
            vazio="Nenhum colaborador com data de admissão ou desligamento no período."
            meses={quadro.map((m) => ({
              chave: m.mes,
              rotulo: rotuloDoMes(m.mes),
              rotuloLongo: m.mes === mesAtual ? `${mesPorExtenso(m.mes)} (até hoje)` : mesPorExtenso(m.mes),
              linha: m.headcount,
              colunas: [m.admissoes, m.desligamentos],
            }))}
          />
        </Painel>

        <Painel
          setor="Férias"
          cor="var(--c41-setor)"
          titulo="Vencidas e a vencer, no fim de cada mês"
          href={hrefs.ferias}
          destaque={{ valor: numero(vencidasHoje), legenda: vencidasHoje === 1 ? "vencida hoje" : "vencidas hoje", tom: vencidasHoje > 0 ? "critico" : "neutro" }}
          rodape={`"A vencer" é o período concessivo acabando em até ${AVISO_DAS_FERIAS_DIAS} dias.`}
        >
          <ColunasDeSituacao
            titulo={`Férias vencidas e a vencer por mês, ${periodoDosMeses(ferias.map((m) => m.mes))}`}
            vazio="Nenhuma férias vencida ou a vencer no período."
            colunas={ferias.map((m) => ({
              chave: m.mes,
              rotulo: rotuloDoMes(m.mes),
              rotuloLongo: m.mes === mesAtual ? `${mesPorExtenso(m.mes)} (hoje)` : `Fim de ${mesPorExtenso(m.mes)}`,
              segmentos: [
                { chave: "vencidas", rotulo: "Vencidas", valor: m.vencidas, tom: "critico" },
                { chave: "a-vencer", rotulo: "A vencer", valor: m.aVencer, tom: "atencao" },
              ],
            }))}
          />
        </Painel>

        <Painel setor="Jornada" cor="var(--c41-setor)" titulo="Horas extras por mês" href={hrefs.horas}>
          <Colunas
            titulo="Soma das horas extras lançadas"
            vazio="Nenhuma hora extra lançada no período."
            formatar={horas}
            formatarCurto={(n) => numero(Math.round(n))}
            colunas={horasExtras.map((m) => ({
              chave: m.mes,
              rotulo: rotuloDoMes(m.mes),
              valor: m.horas,
              // O mês em andamento, mais claro: ainda vai crescer.
              destaque: m.mes === mesAtual,
              dica: m.mes === mesAtual ? "Mês em andamento" : undefined,
            }))}
          />
        </Painel>

        <Painel
          setor="Recrutamento"
          cor="var(--c41-setor)"
          titulo="Funil do trimestre"
          href={hrefs.funil}
          destaque={{ valor: numero(totalDoFunil), legenda: `${totalDoFunil === 1 ? "candidatura" : "candidaturas"} de ${periodoDosMeses(d.funil.meses)}` }}
          rodape={
            totalDoFunil > 0
              ? `${numero(d.funil.reprovadas)} ${d.funil.reprovadas === 1 ? "reprovada" : "reprovadas"} · ${numero(d.funil.desistentes)} ${d.funil.desistentes === 1 ? "desistente" : "desistentes"}. "Triadas" já saíram da triagem; as outras etapas contam quem chegou a elas.`
              : undefined
          }
        >
          <Funil
            titulo={`Funil das candidaturas de ${periodoDosMeses(d.funil.meses)}`}
            vazio="Nenhuma candidatura no trimestre."
            etapas={d.funil.etapas}
          />
        </Painel>
      </div>

      {d.custos && (
        <section className="mt-8" aria-labelledby="custos-titulo">
          <h2 id="custos-titulo" className="text-section font-semibold text-fg mb-1 flex items-center gap-2">
            <Lock size={16} className="text-fg-muted" aria-hidden />
            Custos
          </h2>
          <p className="text-helper text-fg-muted mb-3">Só aparece para quem tem permissão de ver salários.</p>
          <FaixaDeTotais
            className=""
            destaque={false}
            itens={[
              { rotulo: `Folha de ${MESES[Number(mesAtual.slice(5, 7)) - 1]}`, valor: formatarReais(d.custos.folha), icone: <Wallet size={15} /> },
              { rotulo: "Benefícios ativos", valor: formatarReais(d.custos.beneficios), detalhe: "Parte da empresa, por mês", icone: <Gift size={15} /> },
            ]}
          />
        </section>
      )}

      <div className="mt-8">
        <h2 className="text-section font-semibold text-fg mb-3">Relatórios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {relatorios.map((r) => (
            // O cartão-atalho do app (`Card href`): borda azul, sobe 2px.
            <Card key={r.href} href={r.href} className="group p-4">
              <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center bg-brand/10 text-brand mb-3">{r.icon}</span>
              <div className="flex items-center justify-between gap-2">
                <p className="text-fs-3 font-semibold text-fg">{r.label}</p>
                <ArrowRight
                  size={14}
                  className="text-fg-muted flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
                />
              </div>
              <p className="text-fs-2 text-fg-muted mt-1 leading-relaxed">{r.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
