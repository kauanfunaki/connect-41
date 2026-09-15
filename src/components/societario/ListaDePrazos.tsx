import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarClock, Receipt } from "lucide-react";
import { formatInstantDate } from "@/lib/format";
import {
  faixaDoPrazo,
  textoDoPrazo,
  TIPO_DE_PRAZO_LABEL,
  type ItemDePrazo,
  type TipoDePrazo,
} from "@/lib/societario/prazos";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  semana: "text-warning",
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
            <div className="min-w-0 flex items-start gap-2.5">
              <Icone size={15} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-[13px] font-medium truncate">{item.titulo}</span>
                <span className="text-[12px] text-fg-muted truncate">
                  {TIPO_DE_PRAZO_LABEL[item.tipo]} · {item.empresaNome}
                  {item.detalhe && ` · ${item.detalhe}`}
                  {mostrarResponsavel && ` · ${item.responsavelNome ?? "sem responsável"}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 md:justify-end pl-[25px] md:pl-0">
              {item.valorCentavos !== null && (
                <span className="text-[12px] tabular-nums text-fg-secondary">{MOEDA.format(item.valorCentavos / 100)}</span>
              )}
              {item.data ? (
                <span className={`text-[12px] whitespace-nowrap ${COR_DA_FAIXA[faixaDoPrazo(item.data, hoje)]}`}>
                  {textoDoPrazo(item.data, hoje)} · {formatInstantDate(item.data)}
                </span>
              ) : (
                <span className="text-[12px] text-fg-muted whitespace-nowrap">sem data</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
