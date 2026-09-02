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

/**
 * Sentinela do `<select>` de cliente para "não é nenhum dos existentes, vou
 * digitar o nome de um novo". Não colide com id real: `ClientGroup.id` é uuid.
 */
export const NOVO_CLIENTE = "__novo__";

/** O que o formulário de empresa disse sobre o cliente. */
export type EscolhaDeCliente =
  | { tipo: "existente"; clientGroupId: string }
  | { tipo: "novo"; name: string }
  | { tipo: "ausente" };

/**
 * Lê a dupla de campos do formulário (o select e o nome do novo) e diz o que o
 * usuário quis. Separado da action porque é a regra que decide se o cadastro
 * passa ou não — e desde 2026-09-01 o cliente é OBRIGATÓRIO na empresa, então
 * `ausente` é erro de validação, não um caminho feliz.
 *
 * "Novo" com nome em branco cai em `ausente` de propósito: escolher a opção e
 * não digitar nada é o mesmo que não ter escolhido, e criar um grupo sem nome
 * seria pior que recusar.
 */
export function lerEscolhaDeCliente(
  clientGroupId: string | null | undefined,
  novoNome: string | null | undefined
): EscolhaDeCliente {
  const id = clientGroupId?.trim() ?? "";
  if (id === NOVO_CLIENTE) {
    const name = novoNome?.trim() ?? "";
    // VarChar(180) na coluna — cortar aqui evita P2000 no insert.
    return name ? { tipo: "novo", name: name.slice(0, 180) } : { tipo: "ausente" };
  }
  return id ? { tipo: "existente", clientGroupId: id } : { tipo: "ausente" };
}

/** Empresa já pronta para exibição, no mínimo que o agrupamento da tela precisa. */
export type EmpresaAgrupavel = {
  clientGroupId: string | null;
  clientGroupName: string | null;
};

export type BlocoDeCliente<T> = {
  /** `null` quando as empresas do bloco não têm cliente. */
  clientGroupId: string | null;
  label: string;
  empresas: T[];
  /**
   * Se a tela deve desenhar a faixa com o nome do cliente.
   *
   * Falso para empresa sem cliente: desde 02/09 o cliente é opcional e existe
   * só quando junta empresas de um mesmo dono, então a maioria não tem — e uma
   * faixa "Sem cliente" repetida a cada empresa é ruído, não informação.
   */
  mostrarCabecalho: boolean;
};

/**
 * Quebra a página de empresas em blocos por cliente, **preservando a ordem
 * recebida**.
 *
 * Não ordena de propósito: quem ordena é a consulta, por
 * `[{ clientGroup: { name } }, { name }]`, e reordenar aqui faria a tela
 * discordar da paginação — a página 2 começaria por um cliente que a página 1
 * já mostrou.
 *
 * Um cliente que cai na virada da página aparece nas duas, com o cabeçalho
 * repetido. É o comportamento normal de agrupamento paginado: o alternativo
 * seria paginar por cliente, o que quebraria a contagem, o filtro de status e
 * a seleção em massa, que são todos por empresa.
 */
export function agruparPorCliente<T extends EmpresaAgrupavel>(empresas: T[]): BlocoDeCliente<T>[] {
  const blocos: BlocoDeCliente<T>[] = [];
  for (const e of empresas) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.clientGroupId === e.clientGroupId) {
      ultimo.empresas.push(e);
      continue;
    }
    blocos.push({
      clientGroupId: e.clientGroupId,
      label: e.clientGroupName ?? "",
      empresas: [e],
      mostrarCabecalho: e.clientGroupId !== null,
    });
  }
  return blocos;
}
