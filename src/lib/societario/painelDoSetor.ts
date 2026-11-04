// O painel do Societário (04/11/2026, lote D dos ajustes de 03/11 — escolha A
// da página de opções): seis números e a fila "O que fazer hoje". Este arquivo
// é a regra da fila, pura e testada; a leitura do banco está em
// ./painelDoSetorServidor.ts.

export type TipoDoItem = "parado" | "exigencia" | "estourado" | "licenca" | "certidao";

export type ItemDaFila = {
  chave: string;
  tipo: TipoDoItem;
  titulo: string;
  detalhe: string;
  /** O selo da linha. */
  selo: string;
  tom: "perigo" | "atencao";
  href: string;
  /** Quanto pesa dentro do tipo: dias parado, dias de atraso, dias até vencer (negativo = vencido). */
  peso: number;
  /** O protocolo, para o "Registrar cobrança" na linha. */
  protocoloId?: string;
  /** Vencido ou vence hoje: sobe para o topo do tipo. */
  urgente?: boolean;
};

/**
 * A ordem da fila (combinada no desenho A): o que está parado no órgão e a
 * exigência que vence hoje ou já venceu primeiro; depois o processo estourado,
 * a exigência da semana, a licença vencida, a certidão positiva e a licença a
 * renovar. Dentro de cada grupo, o mais grave primeiro.
 */
export function ordenarFila(itens: ItemDaFila[]): ItemDaFila[] {
  const grupo = (i: ItemDaFila): number => {
    if (i.tipo === "parado") return 0;
    if (i.tipo === "exigencia") return i.urgente ? 1 : 3;
    if (i.tipo === "estourado") return 2;
    if (i.tipo === "licenca") return i.urgente ? 4 : 6;
    return 5;
  };
  // Parado e estourado: mais dias, antes. Prazo (exigência, licença): vence antes, antes.
  const porPeso = (i: ItemDaFila) => (i.tipo === "parado" || i.tipo === "estourado" ? -i.peso : i.peso);
  return [...itens].sort((a, b) => grupo(a) - grupo(b) || porPeso(a) - porPeso(b) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** "vence em 3 dias", "vence hoje", "venceu há 2 dias". */
export function textoDoPrazoEmDias(dias: number): string {
  if (dias === 0) return "vence hoje";
  if (dias < 0) return `venceu há ${-dias} ${dias === -1 ? "dia" : "dias"}`;
  return `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}
