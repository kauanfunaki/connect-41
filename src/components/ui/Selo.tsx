// Selo pequeno: a situação de uma linha de tabela, de um cartão ou de uma ficha
// ("Programada", "Vencida", "Em análise"). 11px, sempre o mesmo desenho — antes
// eram pílulas de 10, 11 e 12px montadas à mão em cada tela (02/10/2026).
//
// O `Badge` continua para categoria em destaque (24px); o `Selo` é o miúdo.
//
// `tom` cobre as cinco cores de situação. Os mapas de cor que as telas já têm
// (situação → classes) entram por `cor`, sem precisar virar `tom`.

export type TomDoSelo = "neutro" | "marca" | "atencao" | "perigo" | "sucesso";

export const COR_DO_TOM: Record<TomDoSelo, string> = {
  neutro: "bg-surface-2 text-fg-muted border-border",
  marca: "bg-brand/10 text-brand border-brand/25",
  atencao: "bg-warning/10 text-warning border-warning/25",
  perigo: "bg-danger/10 text-danger border-danger/25",
  sucesso: "bg-success/10 text-success border-success/25",
};

/**
 * O tom do Selo para uma variante do Badge (07/10/2026). As telas têm mapas
 * situação → variante do Badge (`SITUACAO_VARIANTE` e afins); com isto passam a
 * `<Selo tom={tomDaVariante(MAPA[s])}>` sem reescrever cada mapa.
 */
export function tomDaVariante(variante: "success" | "warning" | "danger" | "info" | "neutral"): TomDoSelo {
  switch (variante) {
    case "success": return "sucesso";
    case "warning": return "atencao";
    case "danger": return "perigo";
    case "info": return "marca";
    case "neutral": return "neutro";
  }
}

type Props = {
  children: React.ReactNode;
  tom?: TomDoSelo;
  /** Classes de cor prontas, de um mapa da tela. Vale quando não há `tom`. */
  cor?: string;
  className?: string;
};

export function Selo({ children, tom, cor, className = "" }: Props) {
  const cores = tom ? COR_DO_TOM[tom] : (cor ?? COR_DO_TOM.neutro);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium leading-4 border whitespace-nowrap ${cores} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
