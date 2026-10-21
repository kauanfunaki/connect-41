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
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { FaixaDeTotais, type ItemDeTotal } from "@/components/ui/FaixaDeTotais";
import { getIndicadoresRH, type IndicadorCard } from "@/lib/indicadoresRH";
import { AVISO_DAS_FERIAS_DIAS } from "@/lib/home/paineis";
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
  "Turnover (30 dias)": <Repeat size={15} />,
  "Absenteísmo (30 dias)": <Stethoscope size={15} />,
  "Horas extras (30 dias)": <Clock size={15} />,
  "Férias vencidas": <Palmtree size={15} />,
  [`Férias a vencer (${AVISO_DAS_FERIAS_DIAS} dias)`]: <CalendarClock size={15} />,
  "Vagas abertas": <Briefcase size={15} />,
  "Candidatos por vaga": <UsersRound size={15} />,
  "Taxa de aprovação": <ThumbsUp size={15} />,
  "Taxa de reprovação": <ThumbsDown size={15} />,
  "Tempo médio de contratação": <Timer size={15} />,
  "Treinamentos realizados (90 dias)": <GraduationCap size={15} />,
  "Desempenho médio": <Star size={15} />,
  "Custo de folha (mês atual)": <Wallet size={15} />,
  "Custo de benefícios (ativos)": <Gift size={15} />,
};

/**
 * Aonde cada indicador leva (15/10/2026, decisão D6 do Kauan: os Indicadores
 * no modelo do Início — todo número é atalho). `modulo` é o que a tela de
 * destino pede: sem acesso a ele, o cartão fica sem link, em vez de levar a um
 * 404. Os relatórios desta área (`/indicadores-rh/...`) não pedem nada além
 * desta tela. As telas do DP mostram o que está em andamento, e não os
 * últimos 30 dias: o atalho é para o assunto do número, não para um recorte
 * que elas não têm.
 */
type Destino = { href: string; modulo?: string };

const DESTINO_DO_INDICADOR: Record<string, Destino> = {
  Headcount: { href: "/colaboradores-clientes", modulo: "recrutamento_colaboradores_clientes" },
  "Admissões (30 dias)": { href: "/admissoes", modulo: "dp_colaboradores" },
  "Demissões (30 dias)": { href: "/desligamentos", modulo: "dp_colaboradores" },
  "Turnover (30 dias)": { href: "/desligamentos", modulo: "dp_colaboradores" },
  "Absenteísmo (30 dias)": { href: "/afastamentos", modulo: "dp_afastamentos" },
  "Horas extras (30 dias)": { href: "/horas-extras", modulo: "dp_horas_extras" },
  "Férias vencidas": { href: "/indicadores-rh/ferias" },
  [`Férias a vencer (${AVISO_DAS_FERIAS_DIAS} dias)`]: { href: "/indicadores-rh/ferias" },
  "Vagas abertas": { href: "/vagas?status=ABERTA", modulo: "recrutamento_vagas" },
  "Candidatos por vaga": { href: "/candidatos", modulo: "recrutamento_candidatos" },
  "Taxa de aprovação": { href: "/vagas", modulo: "recrutamento_vagas" },
  "Taxa de reprovação": { href: "/vagas", modulo: "recrutamento_vagas" },
  "Tempo médio de contratação": { href: "/vagas", modulo: "recrutamento_vagas" },
  "Treinamentos realizados (90 dias)": { href: "/indicadores-rh/treinamentos" },
  "Desempenho médio": { href: "/avaliacoes", modulo: "dp_avaliacoes" },
  // A folha e os benefícios moram na ficha de cada empresa; nenhuma tela soma
  // os de todas. O mais perto é Cargos e salários, para a folha; os
  // benefícios ficam sem atalho.
  "Custo de folha (mês atual)": { href: "/cargos-salarios", modulo: "gestao_cargos_salarios" },
};

/**
 * Os números em grupos, como os painéis do Início: o quadro de pessoal no
 * topo — o Headcount é o número principal, em azul cheio — e o resto por
 * assunto. Rótulo novo que `getIndicadoresRH` passar a devolver sem grupo
 * aqui cai em "Outros" em vez de sumir.
 */
const GRUPOS: { titulo: string | null; rotulos: string[] }[] = [
  { titulo: null, rotulos: ["Headcount", "Admissões (30 dias)", "Demissões (30 dias)", "Turnover (30 dias)"] },
  {
    titulo: "Férias e jornada",
    rotulos: ["Férias vencidas", `Férias a vencer (${AVISO_DAS_FERIAS_DIAS} dias)`, "Absenteísmo (30 dias)", "Horas extras (30 dias)"],
  },
  {
    titulo: "Recrutamento",
    rotulos: ["Vagas abertas", "Candidatos por vaga", "Taxa de aprovação", "Taxa de reprovação", "Tempo médio de contratação"],
  },
  { titulo: "Desenvolvimento", rotulos: ["Treinamentos realizados (90 dias)", "Desempenho médio"] },
  { titulo: "Custos", rotulos: ["Custo de folha (mês atual)", "Custo de benefícios (ativos)"] },
];

/** O módulo de cada destino que a pessoa alcança — uma consulta por módulo. */
async function modulosAlcancados(ctx: AuthContext): Promise<Set<string>> {
  const modulos = [...new Set(Object.values(DESTINO_DO_INDICADOR).flatMap((d) => (d.modulo ? [d.modulo] : [])))];
  const pode = await Promise.all(modulos.map((m) => podeNoModulo(ctx, m, "ver")));
  return new Set(modulos.filter((_, i) => pode[i]));
}

function itemDoIndicador(c: IndicadorCard, alcancados: Set<string>): ItemDeTotal {
  const destino = DESTINO_DO_INDICADOR[c.label];
  const comLink = destino && (!destino.modulo || alcancados.has(destino.modulo));
  return {
    rotulo: c.label,
    valor: c.value,
    detalhe: c.hint,
    icone: ICONE_DO_INDICADOR[c.label] ?? <BarChart3 size={15} />,
    href: comLink ? destino.href : undefined,
    // Férias vencida é passivo consumado — o único número que pede
    // atenção. Vermelho, como na Home e em /ferias (era âmbar).
    tom: c.label === "Férias vencidas" && c.value !== "0" ? "text-danger" : undefined,
  };
}

export default async function IndicadoresRhPage() {
  const { ctx } = await abrirTelaDoModulo("gestao_indicadores_rh");
  const [cards, canViewSalary, alcancados] = await Promise.all([
    getIndicadoresRH(ctx),
    canViewSensitiveField(ctx, "SALARIO"),
    modulosAlcancados(ctx),
  ]);
  const relatorios = RELATORIOS.filter((r) => !r.sensitive || canViewSalary);
  const porRotulo = new Map(cards.map((c) => [c.label, c]));
  const agrupados = new Set(GRUPOS.flatMap((g) => g.rotulos));
  const grupos = [
    ...GRUPOS.map((g) => ({ titulo: g.titulo, cards: g.rotulos.flatMap((r) => porRotulo.get(r) ?? []) })),
    { titulo: "Outros", cards: cards.filter((c) => !agrupados.has(c.label)) },
  ].filter((g) => g.cards.length > 0);

  return (
    <PageContainer>
      {/* Subtítulo e exportação iam num cabeçalho montado à mão (até 30/09). */}
      <PageHeader
        title="Indicadores de RH"
        subtitle="Consequência dos dados operacionais lançados nos módulos de RH/DP e Recrutamento."
        action={<ExportIndicadoresButtons />}
      />

      {/* No modelo do Início (15/10/2026, decisão D6): eram 17 cartões soltos
          numa grade, sem link e sem número principal. Agora cada número leva
          à tela do assunto, o quadro de pessoal abre a tela com o Headcount
          em azul cheio, e o resto vem em faixas por assunto — só a primeira
          faixa tem o cartão azul, um por tela. */}
      <div className="flex flex-col gap-6">
        {grupos.map((g, i) => (
          <section key={g.titulo ?? "principal"} aria-label={g.titulo ?? "Quadro de pessoal"}>
            {g.titulo && <h2 className="text-card-title font-semibold text-fg mb-3">{g.titulo}</h2>}
            <FaixaDeTotais
              className=""
              destaque={i === 0}
              rotulosInteiros
              itens={g.cards.map((c) => itemDoIndicador(c, alcancados))}
            />
          </section>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-section font-semibold text-fg mb-3">Relatórios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {relatorios.map((r) => (
            // O cartão-atalho do app (`Card href`): borda azul, sobe 2px.
            <Card key={r.href} href={r.href} className="group p-4">
              <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center bg-brand/10 text-brand mb-3">
                {r.icon}
              </span>
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
