// Cliente da API do Omie — o transporte, sem regra de negócio.
//
// A API é toda POST com JSON num formato de chamada remota:
//   POST https://app.omie.com.br/api/v1/{modulo}/
//   { "call": "ListarEmpresas", "app_key": "...", "app_secret": "...", "param": [ { ... } ] }
// Erro volta com HTTP 500 e `{ faultstring, faultcode }` no corpo.
//
// Credencial é **uma por empresa cliente** (cada empresa é uma conta Omie):
// mora em `TenantIntegration` com `instanceKey = "empresa:{companyId}"` — ver
// ./contas.ts. Limites da API (conferidos em 23/09, ajuda.omie.com.br/8112984):
// 4 chamadas simultâneas por chave e método, chamada idêntica repetida bloqueia
// 60 s, 10 erros seguidos bloqueiam 30 min. Quem chama em volume enfileira.

export type CredencialOmie = { appKey: string; appSecret: string };

export class ErroDoOmie extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string | null,
    readonly http: number
  ) {
    super(mensagem);
    this.name = "ErroDoOmie";
  }
}

const BASE = "https://app.omie.com.br/api/v1";

/** O erro que o Omie devolveu, em texto para gente, ou null se o corpo não é erro. */
export function falhaDoOmie(corpo: unknown): { mensagem: string; codigo: string | null } | null {
  if (!corpo || typeof corpo !== "object") return null;
  const o = corpo as Record<string, unknown>;
  if (typeof o.faultstring !== "string") return null;
  return { mensagem: o.faultstring.trim().slice(0, 300), codigo: typeof o.faultcode === "string" ? o.faultcode : null };
}

export async function chamarOmie<T = unknown>(
  cred: CredencialOmie,
  modulo: string,
  call: string,
  param: Record<string, unknown>,
  opcoes: { fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<T> {
  if (!/^[a-z]+(\/[a-z]+)*$/.test(modulo)) throw new Error(`Módulo do Omie inválido: ${modulo}`);
  const f = opcoes.fetch ?? fetch;
  const res = await f(`${BASE}/${modulo}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: cred.appKey, app_secret: cred.appSecret, param: [param] }),
    signal: AbortSignal.timeout(opcoes.timeoutMs ?? 30_000),
  });
  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    // corpo que não é JSON — trata abaixo pelo status
  }
  const falha = falhaDoOmie(corpo);
  if (falha) throw new ErroDoOmie(falha.mensagem, falha.codigo, res.status);
  if (!res.ok) throw new ErroDoOmie(`O Omie respondeu HTTP ${res.status}.`, null, res.status);
  return corpo as T;
}

// ─── Empresa da conta (o "testar conexão") ──────────────────────────────────

export type EmpresaDaConta = { cnpj: string; razaoSocial: string; nomeFantasia: string | null };

/**
 * As empresas cadastradas na conta, da resposta de `geral/empresas`
 * `ListarEmpresas`. Lido de forma defensiva: o nome da lista e dos campos vem
 * da documentação, mas a primeira resposta real ainda não foi observada — um
 * campo com outro nome vira lista vazia, e o teste avisa, em vez de quebrar.
 */
export function empresasDaResposta(corpo: unknown): EmpresaDaConta[] {
  if (!corpo || typeof corpo !== "object") return [];
  const o = corpo as Record<string, unknown>;
  const lista = Array.isArray(o.empresas_cadastro) ? o.empresas_cadastro : [];
  return lista
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      cnpj: String(e.cnpj ?? "").replace(/\D/g, ""),
      razaoSocial: String(e.razao_social ?? "").trim(),
      nomeFantasia: typeof e.nome_fantasia === "string" && e.nome_fantasia.trim() ? e.nome_fantasia.trim() : null,
    }))
    .filter((e) => e.cnpj || e.razaoSocial);
}

export type ResultadoDoTeste =
  | { ok: true; empresa: EmpresaDaConta; confere: true }
  | { ok: true; empresa: EmpresaDaConta | null; confere: false; aviso: string };

/**
 * A chave abre a conta certa? Confere o CNPJ da empresa no Connect com o da
 * conta do Omie. Chave colada na linha da empresa errada é o erro mais
 * provável deste cadastro — e o mais caro depois, quando a nota sai pelo CNPJ
 * errado.
 */
export function conferirEmpresa(empresas: EmpresaDaConta[], cnpjNoConnect: string | null): ResultadoDoTeste {
  const alvo = (cnpjNoConnect ?? "").replace(/\D/g, "");
  const igual = alvo ? empresas.find((e) => e.cnpj === alvo) : undefined;
  if (igual) return { ok: true, empresa: igual, confere: true };
  const primeira = empresas[0] ?? null;
  if (!primeira) return { ok: true, empresa: null, confere: false, aviso: "A chave funcionou, mas o Omie não devolveu empresa nenhuma na conta." };
  if (!alvo) return { ok: true, empresa: primeira, confere: false, aviso: "A empresa no Connect não tem CNPJ para conferir." };
  return {
    ok: true,
    empresa: primeira,
    confere: false,
    aviso: `A conta do Omie é de outro CNPJ (${primeira.cnpj || "sem CNPJ"} — ${primeira.razaoSocial}). Confira se a chave foi colada na empresa certa.`,
  };
}
