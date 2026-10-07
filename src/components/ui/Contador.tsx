export type TomDoContador = "neutro" | "marca" | "cheio" | "alerta";

// Quatro contadores com desenhos diferentes até 07/10/2026: o do sino
// (vermelho, 16px de altura, 10px de fonte), os das abas do sino e da central
// (azul cheio, 16 ou 20px), o da aba por link (azul a 10%, 20px) e o do grupo do
// menu (só texto). Um componente, 11px (`--fs-micro`, o menor degrau da escala).
//   neutro — contagem informativa fora de foco (aba não selecionada)
//   marca  — a mesma contagem na aba selecionada
//   cheio  — o que pede leitura (não lidas): azul 41 com texto branco
//   alerta — o selo do sino, vermelho com texto branco
// Os cheios usam os preenchimentos fixos (`--c41-*-solid`): branco sobre o tom
// do tema escuro reprova AA.
const COR: Record<TomDoContador, string> = {
  neutro: "bg-surface-2 text-fg-muted",
  marca: "bg-brand/10 text-brand",
  cheio: "bg-brand-solid text-on-brand",
  alerta: "bg-danger-solid text-white",
};

type Props = {
  valor: number;
  tom?: TomDoContador;
  /** 16px de altura (sobre um ícone, numa linha densa) ou 20px (padrão, ao lado de rótulo). */
  pequeno?: boolean;
  /** Acima disto vira "N+". Padrão 99. */
  teto?: number;
  className?: string;
};

export function Contador({ valor, tom = "neutro", pequeno = false, teto = 99, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-micro font-semibold leading-none tabular-nums ${
        pequeno ? "min-w-4 h-4 px-1" : "min-w-5 h-5 px-1.5"
      } ${COR[tom]} ${className}`.trim()}
    >
      {valor > teto ? `${teto}+` : valor}
    </span>
  );
}
