// Carga dos dados do Aditiva Pronto para os Honorários do Connect (F3 da migracao-622).
// Regras puras: casar as empresas pelo CNPJ e decidir o que entra. Quem lê o banco do
// Aditiva e grava no Connect é scripts/honorarios/carga-do-aditiva.ts.

export const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export type EmpresaDoAditiva = { id: string; cnpj: string | null; razao_social: string };
export type EmpresaDoConnect = { id: string; cnpj: string | null };

export type Casamento = {
  /** id da empresa no Aditiva → id no Connect. */
  porId: Map<string, string>;
  /** Empresas do Aditiva sem par no Connect (para o relatório, fora do git). */
  semPar: EmpresaDoAditiva[];
  /** CNPJ que aparece em mais de uma empresa do Connect: não casa sozinho. */
  ambiguas: EmpresaDoAditiva[];
};

/** Casa pelo CNPJ inteiro (14 dígitos): filial é outra empresa, então a raiz não basta. */
export function casarEmpresas(doAditiva: EmpresaDoAditiva[], doConnect: EmpresaDoConnect[]): Casamento {
  const porCnpj = new Map<string, string[]>();
  for (const c of doConnect) {
    const d = digitos(c.cnpj);
    if (d.length === 14) porCnpj.set(d, [...(porCnpj.get(d) ?? []), c.id]);
  }
  const porId = new Map<string, string>();
  const semPar: EmpresaDoAditiva[] = [];
  const ambiguas: EmpresaDoAditiva[] = [];
  for (const a of doAditiva) {
    const ids = porCnpj.get(digitos(a.cnpj)) ?? [];
    if (ids.length === 1) porId.set(a.id, ids[0]!);
    else if (ids.length > 1) ambiguas.push(a);
    else semPar.push(a);
  }
  return { porId, semPar, ambiguas };
}

export type VinculoDoAditiva = { nome_pasta: string; company_id: string | null; tipo: string; vinculado_em: Date };
export type VinculoParaGravar = { nomePasta: string; companyId: string | null; tipo: "auto" | "confirmado" | "ignorado"; vinculadoEm: Date };

/**
 * Vínculo pasta-empresa. O ignorado vem sem empresa; o confirmado ou automático
 * cuja empresa não casou no Connect fica de fora (a pasta volta a aparecer sem
 * vínculo e alguém liga de novo), em vez de entrar apontando para nada.
 */
export function mapearVinculos(v: VinculoDoAditiva[], porId: Map<string, string>) {
  const gravar: VinculoParaGravar[] = [];
  const semEmpresa: VinculoDoAditiva[] = [];
  for (const x of v) {
    const tipo = x.tipo === "auto" || x.tipo === "confirmado" || x.tipo === "ignorado" ? x.tipo : null;
    if (!tipo) continue;
    if (tipo === "ignorado") {
      gravar.push({ nomePasta: x.nome_pasta, companyId: null, tipo, vinculadoEm: x.vinculado_em });
      continue;
    }
    const companyId = x.company_id ? porId.get(x.company_id) : undefined;
    if (!companyId) semEmpresa.push(x);
    else gravar.push({ nomePasta: x.nome_pasta, companyId, tipo, vinculadoEm: x.vinculado_em });
  }
  return { gravar, semEmpresa };
}

/** Nome de quem fez no Aditiva (a conta do setor) como aparece no Connect. */
export function quemNoAditiva(conta: string | null | undefined): string {
  const c = (conta ?? "").trim();
  if (!c) return "Aditiva Pronto";
  const nome = c.toLowerCase() === "societario" ? "Societário" : c.toLowerCase() === "controladoria" ? "Controladoria" : c;
  return `${nome} (Aditiva Pronto)`.slice(0, 150);
}

/**
 * O valor informado à mão no Aditiva só entra se for mais novo que o que já
 * está no Connect: rodar a carga de novo não desfaz o que a equipe informou
 * depois da virada.
 */
export function manualVence(noAditiva: Date, noConnect: Date | null | undefined): boolean {
  return !noConnect || noAditiva.getTime() > noConnect.getTime();
}

/** "AAAA-MM-DD" do DATE do MySQL (o driver pode devolver Date ou texto). */
export function dataSemFuso(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null;
  return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
}

/** JSON que o MySQL pode devolver como texto. */
export function json<T>(v: unknown, padrao: T): T {
  if (v === null || v === undefined) return padrao;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return padrao;
    }
  }
  return v as T;
}
