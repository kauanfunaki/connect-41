// Rate limit em memória com janela deslizante. Suficiente para 1 instância
// (o deploy atual é single-container no EasyPanel). Se escalar para múltiplas
// réplicas, trocar o Map por Redis/tabela — a interface `allow()` fica igual.
//
// Não persiste entre restarts (aceitável: reiniciar o processo não é um vetor
// prático de brute force, e o custo de um store externo não se justifica hoje).

type Bucket = number[]; // timestamps (ms) das tentativas dentro da janela

const buckets = new Map<string, Bucket>();

// Limpeza preguiçosa: a cada N chamadas, remove buckets vazios/expirados para
// não vazar memória com chaves antigas (ex: e-mails tentados uma vez só).
let callsSinceSweep = 0;
const SWEEP_EVERY = 500;

function sweep(now: number, windowMs: number): void {
  for (const [key, arr] of buckets) {
    const fresh = arr.filter((t) => now - t < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Registra uma tentativa para `key` e diz se ela é permitida.
 * @param key    identificador (ex: `login:email@x.com` ou `login-ip:1.2.3.4`)
 * @param max    máximo de tentativas na janela (default 5)
 * @param windowMs  tamanho da janela em ms (default 15min)
 */
export function hit(key: string, max = 5, windowMs = 15 * 60_000): RateLimitResult {
  const now = Date.now();

  if (++callsSinceSweep >= SWEEP_EVERY) {
    callsSinceSweep = 0;
    sweep(now, windowMs);
  }

  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);

  const allowed = arr.length <= max;
  const oldest = arr[0] ?? now;
  return {
    allowed,
    remaining: Math.max(0, max - arr.length),
    retryAfterMs: allowed ? 0 : windowMs - (now - oldest),
  };
}

// Zera o contador de uma chave — chamar após login bem-sucedido para não punir
// o usuário legítimo que errou a senha algumas vezes antes de acertar.
export function reset(key: string): void {
  buckets.delete(key);
}

// IP do cliente atrás do proxy (nginx/Traefik do EasyPanel seta x-forwarded-for).
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
