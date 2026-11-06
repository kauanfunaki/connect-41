import {
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  ChartColumn,
  FileText,
  Folder,
  Receipt,
  Scale,
  ShieldCheck,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { readableTextOn } from "@/lib/color";
import { inicialDoEspaco, type IconeDoEspaco } from "@/lib/kanban/modelosDeEspaco";

/** O desenho de cada ícone do espaço; o nome é o que fica no banco. */
export const DESENHO_DO_ICONE: Record<IconeDoEspaco, { Icone: LucideIcon; nome: string }> = {
  pasta: { Icone: Folder, nome: "Pasta" },
  calculadora: { Icone: Calculator, nome: "Calculadora" },
  recibo: { Icone: Receipt, nome: "Recibo" },
  grafico: { Icone: ChartColumn, nome: "Gráfico" },
  predio: { Icone: Building2, nome: "Prédio" },
  pessoas: { Icone: Users, nome: "Pessoas" },
  documento: { Icone: FileText, nome: "Documento" },
  calendario: { Icone: CalendarDays, nome: "Calendário" },
  maleta: { Icone: Briefcase, nome: "Maleta" },
  balanca: { Icone: Scale, nome: "Balança" },
  escudo: { Icone: ShieldCheck, nome: "Escudo" },
  estrela: { Icone: Star, nome: "Estrela" },
};

const TAMANHO = {
  sm: { caixa: "size-6 rounded-md text-fs-1", icone: 13 },
  md: { caixa: "size-8 rounded-md text-fs-3", icone: 16 },
  lg: { caixa: "size-10 rounded-lg text-fs-6", icone: 20 },
} as const;

/**
 * O quadrado do espaço (05/11/2026, como no ClickUp): a cor do espaço com o
 * ícone escolhido ou, sem ícone, a inicial do nome. É enfeite — o nome do
 * espaço está sempre ao lado —, então fica fora do leitor de tela.
 */
export function QuadradoDoEspaco({
  nome,
  cor,
  icone,
  tamanho = "md",
}: {
  nome: string;
  cor: string;
  icone: IconeDoEspaco | string | null;
  tamanho?: keyof typeof TAMANHO;
}) {
  const t = TAMANHO[tamanho];
  const desenho = icone ? DESENHO_DO_ICONE[icone as IconeDoEspaco] : undefined;
  return (
    <span
      aria-hidden
      className={`inline-flex flex-shrink-0 items-center justify-center font-semibold leading-none ${t.caixa}`}
      style={{ background: cor, color: readableTextOn(cor) }}
    >
      {desenho ? <desenho.Icone size={t.icone} strokeWidth={2.2} /> : inicialDoEspaco(nome)}
    </span>
  );
}
