// Regras do agrupador de cliente (`ClientGroup`), separadas do acesso ao
// banco para poderem ser testadas sem subir Prisma. Quem usa: o backfill em
// `scripts/backfill-client-groups.ts` e, adiante, a tela de cadastro de
// empresa.

/** Empresa, no mínimo que estas regras precisam enxergar. */
export type EmpresaParaAgrupar = {
  id: string;
  name: string;
  cnpj: string | null;
};

/**
 * Raiz do CNPJ: os 8 primeiros dígitos, que identificam a pessoa jurídica.
 * Os 4 seguintes são a ordem do estabelecimento (matriz `0001`, filiais
 * `0002`…) e os 2 últimos são verificadores.
 *
 * Aceita com ou sem máscara porque `Company.cnpj` é `VarChar(18)` livre — a
 * base tem os dois formatos. Devolve `null` para qualquer coisa que não tenha
 * exatamente 14 dígitos, incluindo CPF (11) e campo vazio: raiz errada agrupa
 * empresas que não são do mesmo cliente, o que é pior do que não agrupar.
 */
export function cnpjRoot(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  return digitos.slice(0, 8);
}

export type GrupoPlanejado = {
  /** Nome sugerido para o grupo. */
  name: string;
  /** Preenchido só quando o grupo veio de uma raiz de CNPJ compartilhada. */
  cnpjRoot: string | null;
  /** Empresas que entram nele. */
  empresas: EmpresaParaAgrupar[];
};

/**
 * Monta os grupos a partir das empresas de UM tenant.
 *
 * Duas passadas, na ordem:
 *
 * 1. Empresas que dividem a raiz do CNPJ viram um grupo só — é o caso BLD (5
 *    estabelecimentos sob a raiz 17122471).
 * 2. Todo o resto vira um grupo 1:1 com o nome da própria empresa.
 *
 * A passada 2 parece burocracia e é o que faz a coisa valer: com 100% das
 * empresas vinculadas, a consulta do portal é `where clientGroupId = X` e
 * pronto, sem `OR company.id in (...)` espalhado por toda tela. É também como
 * o protótipo opera — lá empresa sem cliente não existe.
 *
 * Determinístico: a ordem de entrada não muda o resultado, e o nome do grupo
 * de uma raiz compartilhada é o da empresa de nome mais curto (tende a ser a
 * matriz, "Grupo Aurora" em vez de "Grupo Aurora Comércio Filial São José"),
 * com empate desfeito por ordem alfabética para não depender do banco.
 */
export function planejarGrupos(empresas: EmpresaParaAgrupar[]): GrupoPlanejado[] {
  const porRaiz = new Map<string, EmpresaParaAgrupar[]>();
  const soltas: EmpresaParaAgrupar[] = [];

  for (const e of empresas) {
    const raiz = cnpjRoot(e.cnpj);
    if (raiz === null) {
      soltas.push(e);
      continue;
    }
    const atual = porRaiz.get(raiz);
    if (atual) atual.push(e);
    else porRaiz.set(raiz, [e]);
  }

  const grupos: GrupoPlanejado[] = [];

  for (const [raiz, membros] of porRaiz) {
    if (membros.length === 1) {
      // Raiz com uma empresa só não é grupo: é 1:1 como qualquer outra. Ainda
      // assim guarda a raiz — se a filial for cadastrada depois, o campo já
      // diz a qual grupo ela pertence.
      grupos.push({ name: membros[0].name, cnpjRoot: raiz, empresas: membros });
      continue;
    }
    grupos.push({ name: nomeDoGrupo(membros), cnpjRoot: raiz, empresas: membros });
  }

  for (const e of soltas) {
    grupos.push({ name: e.name, cnpjRoot: null, empresas: [e] });
  }

  return grupos.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function nomeDoGrupo(membros: EmpresaParaAgrupar[]): string {
  return [...membros].sort(
    (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, "pt-BR")
  )[0].name;
}

/**
 * Um `ClientGroup` e uma `Company` precisam ser do mesmo tenant.
 *
 * O Prisma não expressa isso como constraint (seria uma FK composta contra
 * duas colunas de tabelas diferentes), então é guarda de runtime. Sem ela,
 * uma empresa entrando num grupo de outro tenant faz o grupo atravessar a
 * fronteira de acesso — e tenant é fronteira de acesso, não agrupamento.
 */
export function mesmoTenant(
  grupo: { tenantId: string },
  empresa: { tenantId: string }
): boolean {
  return grupo.tenantId === empresa.tenantId;
}
