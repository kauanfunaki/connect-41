// Formatos das telas do motor, usáveis em componente de servidor (22/10/2026).
// Os de `components/fiscal/previa/Compartilhados` são de cliente.

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d);
}

export function data(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** String decimal do motor ("1234.56") em reais — só para exibir. */
export function reaisDoMotor(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  return Number.isFinite(n) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n) : valor;
}

export function tamanho(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function cnpjFormatado(cnpj: string): string {
  return /^\d{14}$/.test(cnpj) ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
}

export function duracao(inicio: string | null, fim: string | null, agora = Date.now()): string {
  if (!inicio) return "Não iniciada";
  const ate = fim ? Date.parse(fim) : agora;
  const s = Math.max(0, Math.round((ate - Date.parse(inicio)) / 1000));
  const texto = s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  return fim ? texto : `${texto} em andamento`;
}

/** Alíquota ou percentual do motor ("9.2500") — só para exibir; `null` é "—". */
export function percentualDoMotor(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  return Number.isFinite(n) ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n)}%` : valor;
}

/** Contagem do motor; `null` (não levantado) é "—", nunca 0. */
export function contagemDoMotor(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(valor);
}
