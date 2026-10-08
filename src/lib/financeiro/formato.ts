// Formatação de dinheiro e percentual para as telas do financeiro e da DRE.
//
// Existe separado porque `ContasTable` também exportava `moeda`, mas importa as
// server actions de baixa — e o portal, que é só leitura, não pode puxar essas
// actions para dentro da árvore dele por causa de uma função de formatar.
//
// Dinheiro e número saem dos helpers de `lib/format` desde 08/10/2026, o
// formato único do app; `moeda` e `dias` ficam como nomes do financeiro, sem
// formatador próprio.

import { formatarNumero, formatarReaisDeCentavos } from "@/lib/format";

const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function moeda(centavos: number): string {
  return formatarReaisDeCentavos(centavos);
}

/** Fração de 0 a 1. `null` vira travessão: "não dá para calcular" não é zero. */
export function percentual(fracao: number | null): string {
  return fracao === null ? "—" : PCT.format(fracao);
}

export function dias(valor: number | null): string {
  return valor === null ? "—" : `${formatarNumero(valor, 1)} dias`;
}

/** Classe de cor para um valor com sinal. */
export function tomDoValor(centavos: number): string {
  return centavos < 0 ? "text-danger" : centavos > 0 ? "text-success-fg" : "text-fg-muted";
}
