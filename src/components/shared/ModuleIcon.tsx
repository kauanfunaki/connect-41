import {
  AlarmClock,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ChartColumn,
  ChartLine,
  ChartPie,
  CheckCheck,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  GraduationCap,
  HandCoins,
  IdCard,
  KeyRound,
  Landmark,
  LayoutGrid,
  MessageCircle,
  MessageSquareWarning,
  MessagesSquare,
  Network,
  Receipt,
  ReceiptText,
  SquarePen,
  Star,
  Stethoscope,
  Target,
  TrendingUp,
  UserRoundCheck,
  UserSearch,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { getModuleDef, type IconeDeModulo } from "@/lib/module-catalog";

// O único lugar que liga nome de ícone a desenho. `Record<IconeDeModulo, …>`
// obriga o mapa a cobrir a união inteira: nome novo no catálogo sem entrada
// aqui não compila, em vez de aparecer como quadradinho genérico na sidebar.
const DESENHO: Record<IconeDeModulo, LucideIcon> = {
  AlarmClock,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ChartColumn,
  ChartLine,
  ChartPie,
  CheckCheck,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  GraduationCap,
  HandCoins,
  IdCard,
  KeyRound,
  Landmark,
  MessageCircle,
  MessageSquareWarning,
  MessagesSquare,
  Network,
  Receipt,
  ReceiptText,
  SquarePen,
  Star,
  Stethoscope,
  Target,
  TrendingUp,
  UserRoundCheck,
  UserSearch,
  Users,
  Workflow,
};

/** Um ícone pelo nome — serve módulo e grupo (ver `ICONE_DO_GRUPO`). */
export function Icone({ nome, size = 16 }: { nome: IconeDeModulo; size?: number }) {
  const Desenho = DESENHO[nome];
  return <Desenho size={size} />;
}

/**
 * O ícone de um módulo, pelo código.
 *
 * Módulo fora do catálogo desenha o ícone genérico — a sidebar não pode deixar
 * de mostrar um item só porque o catálogo mudou.
 */
export function ModuleIcon({ code, size = 16 }: { code: string; size?: number }) {
  const nome = getModuleDef(code)?.icon;
  const Desenho = nome ? DESENHO[nome] : LayoutGrid;
  return <Desenho size={size} />;
}
