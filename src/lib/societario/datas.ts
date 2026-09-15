// Datas de calendário que chegam de `<input type="date">` nas telas do Societário.
//
// ─── Por que ao MEIO-DIA UTC, e não à meia-noite ────────────────────────────
//
// O resto do projeto grava data de calendário à meia-noite UTC e formata com
// `timeZone: "UTC"` (ver `src/lib/format.ts`). O Societário não pode: a fila de
// licenças e o prazo dos processos contam dias no fuso de São Paulo (`diasAte`)
// e formatam com `formatInstantDate`. Meia-noite UTC, em São Paulo, ainda é o
// dia anterior — a licença que vence dia 10 apareceria vencendo dia 9, e
// "vence hoje" viraria "venceu ontem".
//
// Meio-dia UTC é o mesmo dia civil em qualquer fuso do Brasil, então os dois
// formatadores e a contagem de dias concordam sobre a data que a pessoa digitou.

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

export type LeituraDeData = { ok: true; data: Date | null } | { ok: false };

/** Lê o valor de um `<input type="date">`. Vazio é `null`, não erro. */
export function lerDataDoCampo(valor: unknown): LeituraDeData {
  if (valor === null || valor === undefined) return { ok: true, data: null };
  const texto = String(valor).trim();
  if (!texto) return { ok: true, data: null };

  const m = FORMATO.exec(texto);
  if (!m) return { ok: false };
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 1900 || ano > 2200) return { ok: false };

  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
  // `Date.UTC` aceita 30/02 e devolve 02/03 em silêncio: conferir de volta é o
  // que recusa a data que não existe.
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return { ok: false };
  }
  return { ok: true, data };
}

/**
 * O valor para preencher um `<input type="date">` a partir de uma data gravada.
 *
 * Usa o dia civil em São Paulo — o mesmo que a tela mostra ao lado —, então vale
 * tanto para o que foi gravado ao meio-dia UTC quanto para datas antigas.
 */
export function campoDaData(data: Date | null): string {
  if (!data) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}
