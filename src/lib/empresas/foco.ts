// Uma empresa por vez no BPO (15/10/2026) — a regra, sem banco nem cookie.
//
// Pedido do dono (estudo de 13/10, confirmado em 15/10): o BPO tinha medo de
// lançar na empresa errada. Como na "base" do Omie, a pessoa escolhe uma
// empresa ("Trabalhar nesta empresa", na ficha) e as telas do BPO mostram e
// gravam só dela, até trocar ou sair.
//
// - O foco cobre a **matriz e as filiais juntas** (decisão do dono: a BLD é
//   uma base só no Omie, com 21 filiais). O grupo é a matriz da empresa
//   escolhida e todas as filiais dessa matriz.
// - A escolha mora num cookie do navegador (decisão do dono: ninguém no BPO
//   precisa de duas empresas abertas ao mesmo tempo) — sem tabela. O cookie
//   leva o escritório e a pessoa, e só vale para os dois; a empresa é
//   conferida no banco a cada leitura (`focoServidor.ts`).
// - Foco só tira, nunca dá: ele filtra as telas e recusa gravação fora dele,
//   mas não abre empresa nem tela que a pessoa já não pudesse abrir.

export const COOKIE_DO_FOCO = "c41_foco";

/** Um mês, como a memória do escritório e do setor (`components/shell/contexto.ts`). */
export const VALIDADE_DO_FOCO_EM_SEGUNDOS = 60 * 60 * 24 * 30;

/**
 * As telas que seguem o foco: as que lançam dinheiro e as de leitura da
 * família da DRE e do Fluxo de caixa. A faixa do topo só aparece nelas — numa
 * tela que não segue o foco ela diria uma coisa que a tela não faz.
 */
export const TELAS_DO_FOCO = [
  "/lancamentos",
  "/pagar",
  "/receber",
  "/conciliacao",
  "/fornecedores-e-sacados",
  "/cobranca",
  "/emitir-nfse",
  "/fluxo-de-caixa",
  "/tabela-dinamica",
  "/dre",
  "/dre/economica",
  "/dre/analises",
  "/dre/orcamento",
] as const;

/** Os módulos dessas telas: quem vê o setor de um deles pode trabalhar numa empresa por vez. */
export const MODULOS_DO_FOCO: ReadonlySet<string> = new Set([
  "bpo_lancamentos",
  "bpo_contas_pagar",
  "bpo_contas_receber",
  "bpo_conciliacao",
  "bpo_cadastros",
  "bpo_cobranca",
  "bpo_emitir_nfse",
  "bpo_fluxo_caixa",
  "bpo_tabela_dinamica",
  "bpo_dre",
  "dre_economica",
  "dre_analises",
  "dre_orcamento",
]);

/**
 * A tela do foco em que o endereço está — a raiz dela, sem o resto do
 * caminho (`/cobranca/abc` → `/cobranca`) —, ou `null` fora delas.
 */
export function telaDoFoco(caminho: string): string | null {
  let achada: string | null = null;
  for (const tela of TELAS_DO_FOCO) {
    const dentro = caminho === tela || caminho.startsWith(`${tela}/`);
    if (dentro && (achada === null || tela.length > achada.length)) achada = tela;
  }
  return achada;
}

// ─── O cookie ───────────────────────────────────────────────────────────────

export type CookieDoFoco = { tenantId: string; userId: string; companyId: string };

// Os ids do Connect são UUID; o ponto separa as três partes e não aparece neles.
const PARTE = /^[A-Za-z0-9_-]{1,191}$/;

export function valorDoCookieDoFoco(c: CookieDoFoco): string {
  return `${c.tenantId}.${c.userId}.${c.companyId}`;
}

/** O cookie lido, ou `null` quando falta ou veio mexido. */
export function lerCookieDoFoco(bruto: string | null | undefined): CookieDoFoco | null {
  if (!bruto) return null;
  const partes = bruto.split(".");
  if (partes.length !== 3 || !partes.every((p) => PARTE.test(p))) return null;
  const [tenantId, userId, companyId] = partes as [string, string, string];
  return { tenantId, userId, companyId };
}

/**
 * A empresa do cookie, se ele for deste escritório e desta pessoa. O de outro
 * escritório (quem troca de escritório) e o de outra pessoa (computador
 * dividido) não valem — e não são apagados: só deixam de mandar.
 */
export function empresaDoCookie(c: CookieDoFoco | null, sessao: { tenantId: string; userId: string }): string | null {
  if (!c || !sessao.tenantId || !sessao.userId) return null;
  return c.tenantId === sessao.tenantId && c.userId === sessao.userId ? c.companyId : null;
}

// ─── A empresa em foco ──────────────────────────────────────────────────────

/** Só empresa em atividade entra em foco: ativa ou prospecto, a régua de Contas a pagar. */
export const SITUACOES_DO_FOCO = ["ACTIVE", "PROSPECT"] as const;

export function situacaoAceitaNoFoco(status: string): boolean {
  return (SITUACOES_DO_FOCO as readonly string[]).includes(status);
}

/** A matriz da base: a matriz da filial, ou a própria empresa. */
export function matrizDoFoco(empresa: { id: string; parentCompanyId: string | null }): string {
  return empresa.parentCompanyId ?? empresa.id;
}

export type EmpresaEmFoco = {
  /** A empresa escolhida — a que a faixa mostra e em que as telas abrem. */
  companyId: string;
  nome: string;
  logoUrl: string | null;
  /** A matriz da base (a própria empresa, quando não é filial). */
  matrizId: string;
  /** A matriz e todas as filiais dela, com a escolhida. */
  grupo: string[];
};

/** A empresa está no foco. Sem foco, tudo está. */
export function dentroDoFoco(foco: Pick<EmpresaEmFoco, "grupo"> | null, companyId: string): boolean {
  return foco === null || foco.grupo.includes(companyId);
}

function filiais(n: number): string {
  return n === 1 ? "1 filial" : `${n} filiais`;
}

/**
 * O resto da base, em frase: "com 21 filiais" (a escolhida é a matriz), "com
 * a matriz e 20 filiais" (é uma filial), ou `null` para empresa sozinha.
 */
export function alcanceDoFoco(foco: Pick<EmpresaEmFoco, "companyId" | "matrizId" | "grupo">): string | null {
  const outras = foco.grupo.filter((id) => id !== foco.companyId).length;
  if (outras === 0) return null;
  if (foco.companyId === foco.matrizId) return `com ${filiais(outras)}`;
  return outras === 1 ? "com a matriz" : `com a matriz e ${filiais(outras - 1)}`;
}

/** "BLD MOGI (com a matriz e 20 filiais)", ou só o nome. */
export function descricaoDoFoco(foco: EmpresaEmFoco): string {
  const alcance = alcanceDoFoco(foco);
  return alcance ? `${foco.nome} (${alcance})` : foco.nome;
}

/**
 * Por que a gravação é recusada, ou `null` quando pode gravar: sem foco, ou
 * com todas as empresas da gravação dentro dele. É a regra que toda action
 * de dinheiro das telas do foco aplica, por `recusaDoFoco`.
 */
export function motivoForaDoFoco(
  foco: EmpresaEmFoco | null,
  companyIds: readonly string[],
  /** `exportar` (21/10/2026): a mesma trava, na exportação — nada é gravado, nada sai. */
  oQue: "gravar" | "exportar" = "gravar"
): string | null {
  if (companyIds.every((id) => dentroDoFoco(foco, id))) return null;
  const onde = descricaoDoFoco(foco!);
  if (oQue === "exportar") {
    return `Nada foi exportado: você está trabalhando só em ${onde}, e isto é de outra empresa. Para exportar dela, use “Trocar empresa” ou “Sair”, na faixa do topo.`;
  }
  return `Nada foi gravado: você está trabalhando só em ${onde}, e isto é de outra empresa. Para gravar nela, use “Trocar empresa” ou “Sair”, na faixa do topo.`;
}
