// A exportação para a Domínio que se corrige (lote 3, 28/10/2026 — o "M2" do
// comparativo de mercado). Funções puras; quem grava e lê o histórico é
// `servidor.ts`.
//
// Até aqui a planilha era sempre o mês inteiro. Depois que o Contábil importou,
// qualquer mudança no Connect (uma baixa nova, uma baixa estornada, um valor
// corrigido, uma conta do de-para trocada) obrigava a escolher entre importar
// o mês de novo — e duplicar tudo na Domínio — ou corrigir à mão.
//
// Agora cada download guarda o ESTADO do que foi para a Domínio: as linhas de
// cada baixa. A correção compara esse estado com o de agora, baixa a baixa:
//
// - baixa nova (ou que estava pendente e ganhou conta): entram as linhas dela;
// - baixa que saiu (estornada, cancelada, mudou de mês): entra o ESTORNO das
//   linhas que tinham ido — débito e crédito trocados, na mesma data;
// - baixa que mudou: o estorno das linhas antigas e as linhas novas;
// - baixa igual: nada.
//
// O estorno vai na data da linha original, para o mês corrigido fechar na
// Domínio. O complemento começa com "ESTORNO", para o Contábil reconhecer.

import type { LinhaDaDominio } from "./planilha";

/** O que foi para a Domínio, por baixa (o id do pagamento). */
export type EstadoExportado = Record<string, LinhaDaDominio[]>;

export type Correcao = {
  linhas: LinhaDaDominio[];
  novas: number;
  alteradas: number;
  removidas: number;
};

/** Agrupa as linhas por baixa. Linha sem `baixaId` não entra no estado. */
export function estadoDasLinhas(linhas: readonly LinhaDaDominio[]): EstadoExportado {
  const estado: EstadoExportado = {};
  for (const l of linhas) {
    if (!l.baixaId) continue;
    (estado[l.baixaId] ??= []).push(l);
  }
  return estado;
}

/** O que importa da linha para dizer se ela mudou — sem o id da baixa. */
function assinatura(linhas: readonly LinhaDaDominio[]): string {
  return JSON.stringify(linhas.map((l) => [l.dataKey, l.debito, l.credito, l.centavos, l.codigoHistorico, l.complemento, l.codigoFilial]));
}

/** A linha ao contrário, na mesma data. */
export function estorno(l: LinhaDaDominio): LinhaDaDominio {
  return { ...l, debito: l.credito, credito: l.debito, complemento: `ESTORNO ${l.complemento}`.slice(0, 255) };
}

/** As linhas que levam a Domínio do estado `anterior` ao `atual`. */
export function correcaoEntre(anterior: EstadoExportado, atual: EstadoExportado): Correcao {
  const linhas: LinhaDaDominio[] = [];
  let novas = 0;
  let alteradas = 0;
  let removidas = 0;

  for (const [baixaId, antes] of Object.entries(anterior)) {
    const agora = atual[baixaId];
    if (!agora) {
      linhas.push(...antes.map(estorno));
      removidas++;
    } else if (assinatura(antes) !== assinatura(agora)) {
      linhas.push(...antes.map(estorno), ...agora);
      alteradas++;
    }
  }
  for (const [baixaId, agora] of Object.entries(atual)) {
    if (anterior[baixaId]) continue;
    linhas.push(...agora);
    novas++;
  }

  linhas.sort((a, b) => a.dataKey.localeCompare(b.dataKey));
  return { linhas, novas, alteradas, removidas };
}

/** Lê o estado gravado (JSON do banco), descartando o que não tem a forma de linha. */
export function lerEstado(bruto: unknown): EstadoExportado {
  const estado: EstadoExportado = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return estado;
  for (const [baixaId, linhas] of Object.entries(bruto as Record<string, unknown>)) {
    if (!Array.isArray(linhas)) continue;
    const boas = linhas.filter(
      (l): l is LinhaDaDominio =>
        !!l &&
        typeof l === "object" &&
        typeof (l as LinhaDaDominio).dataKey === "string" &&
        typeof (l as LinhaDaDominio).debito === "string" &&
        typeof (l as LinhaDaDominio).credito === "string" &&
        typeof (l as LinhaDaDominio).centavos === "number"
    );
    if (boas.length) estado[baixaId] = boas.map((l) => ({ ...l, baixaId }));
  }
  return estado;
}
