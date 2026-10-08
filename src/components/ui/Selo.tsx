// Selo pequeno: a situação de uma linha de tabela, de um cartão ou de uma ficha
// ("Programada", "Vencida", "Em análise"). 11px, sempre o mesmo desenho — antes
// eram pílulas de 10, 11 e 12px montadas à mão em cada tela (02/10/2026).
//
// Uma regra por papel (escolha 2A do Kauan, 08/10/2026), para o app todo:
// - SITUAÇÃO de uma linha ou registro ("Vencida", "Cancelada", "Em análise",
//   "Concluída", "Aguardando você") → `Selo`, este aqui;
// - CATEGORIA em destaque (tipo, origem, setor, etiqueta de classificação) →
//   `Badge`;
// - ATIVO/INATIVO de um cadastro (usuário, setor, acesso) → a bolinha,
//   `StatusDot`.
// Situação encerrada — cancelada, encerrada, indeferida, revogada,
// substituída, desligada, inativa — vai em `neutro`: é histórico, não pede
// ação, e não pode ter a cor de quem pede. As exceções decididas por escrito,
// com data, no código (nota fiscal cancelada e vaga cancelada em vermelho)
// continuam valendo.
//
// `tom` cobre as cinco cores de situação. Os mapas de cor que as telas já têm
// (situação → classes) entram por `cor`, sem precisar virar `tom`.
//
// Verde e âmbar na letra pelo tom de letra (`text-success-fg`/`text-warning-fg`,
// escolha 1A do Kauan, 08/10/2026): o tom cheio rendia 3,2:1 sobre a tinta do
// selo. Fundo e borda seguem no tom cheio.

export type TomDoSelo = "neutro" | "marca" | "atencao" | "perigo" | "sucesso";

export const COR_DO_TOM: Record<TomDoSelo, string> = {
  neutro: "bg-surface-2 text-fg-muted border-border",
  marca: "bg-brand/10 text-brand border-brand/25",
  atencao: "bg-warning/10 text-warning-fg border-warning/25",
  perigo: "bg-danger/10 text-danger border-danger/25",
  sucesso: "bg-success/10 text-success-fg border-success/25",
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
