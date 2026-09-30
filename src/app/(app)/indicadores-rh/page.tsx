import Link from "next/link";
import {
  ArrowRight,
  Palmtree,
  GraduationCap,
  ClipboardList,
  Scale,
  Users,
  UserPlus,
  UserMinus,
  Repeat,
  Stethoscope,
  Clock,
  CalendarClock,
  Briefcase,
  UsersRound,
  ThumbsUp,
  ThumbsDown,
  Timer,
  Star,
  Wallet,
  Gift,
  BarChart3,
} from "lucide-react";
import { getAuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { getIndicadoresRH } from "@/lib/indicadoresRH";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { PageContainer } from "@/components/shared/PageContainer";
import { ExportIndicadoresButtons } from "@/components/indicadoresRH/ExportIndicadoresButtons";

// Os cards acima são o retrato agregado; estes relatórios são a lista
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

// O ícone de cada indicador, pelo rótulo que `getIndicadoresRH` devolve. Os
// cartões eram só texto (até 30/09); com 17 números na tela, o ícone é o que
// deixa achar "Turnover" sem ler um por um. Rótulo novo sem ícone aqui cai no
// gráfico genérico em vez de quebrar.
const ICONE_DO_INDICADOR: Record<string, React.ReactNode> = {
  Headcount: <Users size={15} />,
  "Admissões (30 dias)": <UserPlus size={15} />,
  "Demissões (30 dias)": <UserMinus size={15} />,
  Turnover: <Repeat size={15} />,
  "Absenteísmo (30 dias)": <Stethoscope size={15} />,
  "Horas Extras (30 dias)": <Clock size={15} />,
  "Férias Vencidas": <Palmtree size={15} />,
  "Férias a Vencer": <CalendarClock size={15} />,
  "Vagas Abertas": <Briefcase size={15} />,
  "Candidatos por Vaga": <UsersRound size={15} />,
  "Taxa de Aprovação": <ThumbsUp size={15} />,
  "Taxa de Reprovação": <ThumbsDown size={15} />,
  "Tempo Médio de Contratação": <Timer size={15} />,
  "Treinamentos Realizados (90 dias)": <GraduationCap size={15} />,
  "Desempenho Médio": <Star size={15} />,
  "Custo de Folha (mês atual)": <Wallet size={15} />,
  "Custo de Benefícios (ativos)": <Gift size={15} />,
};

export default async function IndicadoresRhPage() {
  const ctx = await getAuthContext();
  const [cards, canViewSalary] = await Promise.all([
    getIndicadoresRH(ctx),
    canViewSensitiveField(ctx, "SALARIO"),
  ]);
  const relatorios = RELATORIOS.filter((r) => !r.sensitive || canViewSalary);

  return (
    <PageContainer>
      {/* Subtítulo e exportação iam num cabeçalho montado à mão (até 30/09). */}
      <PageHeader
        title="Indicadores de RH"
        subtitle="Consequência dos dados operacionais lançados nos módulos de RH/DP e Recrutamento."
        action={<ExportIndicadoresButtons />}
      />

      {/* Quatro por linha só em telas largas: com a sidebar, o custo de folha em
          reais não cabe num cartão de um quarto a 1024px (o MetricCard não corta). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <MetricCard
            key={c.label}
            label={c.label}
            value={c.value}
            sub={c.hint}
            icon={ICONE_DO_INDICADOR[c.label] ?? <BarChart3 size={15} />}
            // Férias vencida é passivo consumado — o único número que pede atenção.
            highlight={c.label === "Férias Vencidas" && c.value !== "0"}
            delay={i * 20}
          />
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-[13px] font-semibold text-fg mb-3">Relatórios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {relatorios.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-4 hover:border-border-strong hover:bg-surface-hover transition-colors"
            >
              <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center bg-brand/10 text-brand mb-3">
                {r.icon}
              </span>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-fg">{r.label}</p>
                <ArrowRight
                  size={14}
                  className="text-fg-muted flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
                />
              </div>
              <p className="text-[12px] text-fg-muted mt-1 leading-relaxed">{r.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
