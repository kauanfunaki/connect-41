// Formatação de dinheiro e percentual para as telas do financeiro e da DRE.
//
// Existe separado porque `ContasTable` também exporta `moeda`, mas importa as
// server actions de baixa — e o portal, que é só leitura, não pode puxar essas
// actions para dentro da árvore dele por causa de uma função de formatar.

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DIAS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function moeda(centavos: number): string {
  return MOEDA.format(centavos / 100);
}

/** Fração de 0 a 1. `null` vira travessão: "não dá para calcular" não é zero. */
export function percentual(fracao: number | null): string {
  return fracao === null ? "—" : PCT.format(fracao);
}

export function dias(valor: number | null): string {
  return valor === null ? "—" : `${DIAS.format(valor)} dias`;
}

/** Classe de cor para um valor com sinal. */
export function tomDoValor(centavos: number): string {
  return centavos < 0 ? "text-danger" : centavos > 0 ? "text-success" : "text-fg-muted";
}
