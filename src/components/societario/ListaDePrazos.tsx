import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarClock, Receipt } from "lucide-react";
import { formatInstantDate, formatarReaisDeCentavos } from "@/lib/format";
import {
  faixaDoPrazo,
  textoDoPrazo,
  TIPO_DE_PRAZO_LABEL,
  type ItemDePrazo,
  type TipoDePrazo,
} from "@/lib/societario/prazos";


const ICONE: Record<TipoDePrazo, typeof AlertTriangle> = {
  exigencia: AlertTriangle,
  taxa: Receipt,
  licenca: BadgeCheck,
  processo: CalendarClock,
};

// A cor é da faixa, não do tipo: quem passa o olho procura o que venceu, e
// uma licença vencida precisa chamar tanto quanto uma exigência vencida.
const COR_DA_FAIXA = {
  vencido: "text-danger font-medium",
  hoje: "text-danger font-medium",
  semana: "text-warning-fg",
  depois: "text-fg-muted",
} as const;

type Props = {
  itens: ItemDePrazo[];
  /** Agora, do servidor — os dias contam no fuso de São Paulo. */
  hoje: Date;
  /** Em Minha área tudo é da mesma pessoa, e repetir o nome é ruído. */
  mostrarResponsavel?: boolean;
};

export function ListaDePrazos({ itens, hoje, mostrarResponsavel = false }: Props) {
  return (
    <div className="flex flex-col">
      {itens.map((item) => {
        const Icone = ICONE[item.tipo];
        return (
          <Link
            key={item.chave}
            href={item.href}
            className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-1 py-3 border-b border-border-soft hover:bg-surface-hover transition-colors"
          >
            <div className="min-w-0 flex items-start gap-2">
              <Icone size={16} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-ui font-medium truncate">{item.titulo}</span>
                <span className="text-fs-2 text-fg-muted truncate">
                  {TIPO_DE_PRAZO_LABEL[item.tipo]} · {item.empresaNome}
                  {item.detalhe && ` · ${item.detalhe}`}
                  {mostrarResponsavel && ` · ${item.responsavelNome ?? "sem responsável"}`}
                </span>
              </div>
            </div>
            {/* No celular a data desce e fica alinhada ao título, não ao ícone:
                o recuo é o ícone (16px) mais o espaço (8px). */}
            <div className="flex items-center gap-3 md:justify-end pl-6 md:pl-0">
              {item.valorCentavos !== null && (
                <span className="text-fs-2 tabular-nums text-fg-secondary">{formatarReaisDeCentavos(item.valorCentavos)}</span>
              )}
              {item.data ? (
                <span className={`text-fs-2 whitespace-nowrap ${COR_DA_FAIXA[faixaDoPrazo(item.data, hoje)]}`}>
                  {textoDoPrazo(item.data, hoje)} · {formatInstantDate(item.data)}
                </span>
              ) : (
                <span className="text-fs-2 text-fg-muted whitespace-nowrap">sem data</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
