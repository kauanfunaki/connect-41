// Helpers de leitura de FormData usados pelas Server Actions. Centralizados aqui
// para não repetir `pick`/`pickDate`/`pickBool` em cada actions.ts (antes havia
// ~10 cópias divergentes).

export function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

export function pickDate(form: FormData, key: string): Date | null {
  const raw = pick(form, key);
  return raw ? new Date(raw) : null;
}

export function pickBool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "true" || v === "on";
}

export function pickInt(form: FormData, key: string, fallback: number): number {
  const raw = pick(form, key);
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}
