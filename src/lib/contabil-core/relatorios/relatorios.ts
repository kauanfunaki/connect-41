// Os relatórios do Contábil Core (Bloco D, Fase D2, 26/11/2026), sem banco: porte de `RelatoriosService`
// (`src/domain/relatorios/service.py`): a DRE, o Balancete de Verificação e o Livro Caixa, COMO ESTÃO no
// original (decisão do Angelo: não é o DRE do Connect, `src/lib/dre`, que calcula de outra forma). O servidor
// (`servidor/relatorios.ts`) lê e soma no banco; aqui se monta a resposta.
//
// O que o original faz, e o porte repete:
// - DRE e Balancete somam as partidas vivas (`deletedAt` nulo: a partida cancelada e a de uma importação
//   desfeita não entram) da empresa no período, por conta e D/C, sem olhar a conta bancária;
// - a conta de cada linha é a do plano DESTA empresa; a partida numa conta que não é dela não aparece;
// - NÃO há hierarquia: a sintética não soma as analíticas. Cada conta mostra só o próprio movimento (o
//   Balancete leva o `nivel`, o número de partes do código, só para o recuo da tela);
// - a DRE só leva receita (C − D), custo (D − C) e despesa (D − C), mesmo de conta apagada (o legado);
// - o Balancete leva toda conta viva (com ou sem movimento) e a apagada que teve movimento no período;
// - o Livro Caixa percorre as TRANSAÇÕES do extrato (não as partidas) das contas bancárias vivas, ativas e
//   inativas: o saldo inicial é o que veio antes de `de`, e o acumulado segue a data e, no mesmo dia, o id.
//
// Fidelidade conferida pelo gabarito (`relatorios/gabarito/`, gerado por `scripts/contabil-core/gabarito_relatorios.py`).
// As divergências deliberadas (a ordem dos empates e a das contas bancárias) estão em docs/CONTABIL-CORE.md
// ("Fase D2") e são contadas no teste.

import { compara, dec, fixo, oposto, soma, subtrai, type Dec } from "../motor/decimal";
import { descricaoDaAgencia } from "../exportacao/arquivos";

const ZERO = dec("0.00");
const dinheiro = (d: Dec) => fixo(d, 2);

/** Comparação de texto do Python (por ponto de código; o `<` do JavaScript compara unidades UTF-16). */
export function comparaPy(a: string, b: string): number {
  if (a === b) return 0;
  const x = Array.from(a, (c) => c.codePointAt(0)!);
  const y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

// ─── O período ────────────────────────────────────────────────────────────

/** O período do relatório: datas "AAAA-MM-DD", inclusivas; nula é "sem limite". */
export type Periodo = { de: string | null; ate: string | null };

/**
 * Os instantes do período nas partidas (DRE e Balancete): do começo de `de` ao último milissegundo de `ate`, em
 * UTC. É o que a tela do original mandava (`data_de` à meia-noite e `data_ate` às 23:59:59.999, lidos como UTC
 * pelo servidor da produção) e é o dia em que a partida é gravada: a data do lançamento é a data da transação,
 * à meia-noite UTC.
 */
export function instantesDoPeriodo(p: Periodo): { inicio: Date | null; fim: Date | null } {
  return {
    inicio: p.de ? new Date(`${p.de}T00:00:00.000Z`) : null,
    fim: p.ate ? new Date(`${p.ate}T23:59:59.999Z`) : null,
  };
}

// ─── DRE e Balancete ──────────────────────────────────────────────────────

/** Uma conta do plano da empresa (viva ou apagada). */
export type ContaDoRelatorio = { id: string; codigo: string; descricao: string; tipo: string; apagada: boolean };
/** A soma das partidas vivas do período de uma conta num lado (o `GROUP BY conta_id, dc` do original). */
export type TotalDaConta = { contaId: string; dc: string; total: Dec };

type Movimento = { d: Dec; c: Dec };

/** As somas por conta, na ordem em que chegaram (o dicionário `totais` do original). */
function porConta(totais: readonly TotalDaConta[]): Map<string, Movimento> {
  const m = new Map<string, Movimento>();
  for (const t of totais) {
    const mov = m.get(t.contaId) ?? { d: ZERO, c: ZERO };
    if (t.dc === "D") mov.d = soma(mov.d, t.total);
    else if (t.dc === "C") mov.c = soma(mov.c, t.total);
    m.set(t.contaId, mov);
  }
  return m;
}

/** Pelo código (o `sort` do Python); o original não desempata, aqui o id desempata (ver as divergências). */
const peloCodigo = (a: { codigo: string; contaId: string }, b: { codigo: string; contaId: string }) =>
  comparaPy(a.codigo, b.codigo) || comparaPy(a.contaId, b.contaId);

export type LinhaDaDre = { contaId: string; codigo: string; descricao: string; tipo: string; debitos: string; creditos: string; saldo: string };
export type GrupoDaDre = { tipo: string; label: string; linhas: LinhaDaDre[]; total: string };
export type Dre = {
  dataDe: string | null;
  dataAte: string | null;
  grupos: GrupoDaDre[];
  totalReceitas: string;
  totalCustos: string;
  totalDespesas: string;
  resultadoLiquido: string;
};

/** `_TIPO_LABEL`, `_TIPO_ORDEM` e `_DRE_NATUREZA` do original. */
const DRE_GRUPOS: Record<string, { label: string; ordem: number; natureza: "C" | "D" }> = {
  receita: { label: "Receitas", ordem: 0, natureza: "C" },
  custo: { label: "Custos", ordem: 1, natureza: "D" },
  despesa: { label: "Despesas", ordem: 2, natureza: "D" },
};

/** `RelatoriosService.dre` depois da soma: `contas` são todas as do plano da empresa, vivas e apagadas. */
export function montarDre(totais: readonly TotalDaConta[], contas: readonly ContaDoRelatorio[], periodo: Periodo): Dre {
  const doPlano = new Map(contas.map((c) => [c.id, c]));
  const grupos = new Map<string, { linha: LinhaDaDre; saldo: Dec }[]>();
  for (const [contaId, { d, c }] of porConta(totais)) {
    const conta = doPlano.get(contaId);
    const grupo = conta ? DRE_GRUPOS[conta.tipo] : undefined;
    if (!conta || !grupo) continue;
    const saldo = grupo.natureza === "C" ? subtrai(c, d) : subtrai(d, c);
    const linha = { contaId, codigo: conta.codigo, descricao: conta.descricao, tipo: conta.tipo, debitos: dinheiro(d), creditos: dinheiro(c), saldo: dinheiro(saldo) };
    grupos.set(conta.tipo, [...(grupos.get(conta.tipo) ?? []), { linha, saldo }]);
  }
  const lista = [...grupos.entries()]
    .map(([tipo, linhas]) => {
      linhas.sort((a, b) => peloCodigo(a.linha, b.linha));
      const total = linhas.reduce((s, l) => soma(s, l.saldo), ZERO);
      return { tipo, label: DRE_GRUPOS[tipo].label, linhas: linhas.map((l) => l.linha), total };
    })
    .sort((a, b) => DRE_GRUPOS[a.tipo].ordem - DRE_GRUPOS[b.tipo].ordem);
  const total = (tipo: string) => lista.find((g) => g.tipo === tipo)?.total ?? ZERO;
  const [receitas, custos, despesas] = [total("receita"), total("custo"), total("despesa")];
  return {
    dataDe: periodo.de,
    dataAte: periodo.ate,
    grupos: lista.map((g) => ({ ...g, total: dinheiro(g.total) })),
    totalReceitas: dinheiro(receitas),
    totalCustos: dinheiro(custos),
    totalDespesas: dinheiro(despesas),
    resultadoLiquido: dinheiro(subtrai(subtrai(receitas, custos), despesas)),
  };
}

export type LinhaDoBalancete = {
  contaId: string; codigo: string; descricao: string; tipo: string; nivel: number;
  debitos: string; creditos: string; saldoDevedor: string; saldoCredor: string;
};
export type Balancete = {
  dataDe: string | null;
  dataAte: string | null;
  linhas: LinhaDoBalancete[];
  totalDebitos: string;
  totalCreditos: string;
  totalSaldoDevedor: string;
  totalSaldoCredor: string;
};

/** `PlanoConta.nivel`: a profundidade pelo código ("1.1.2" é nível 3). */
export const nivelDoCodigo = (codigo: string) => codigo.split(".").length;

/**
 * `RelatoriosService.balancete` depois da soma: a conta viva sempre entra (com ou sem movimento) e a apagada só
 * se teve movimento no período (o legado de antes da trava). Os totais somam só as linhas do relatório.
 */
export function montarBalancete(totais: readonly TotalDaConta[], contas: readonly ContaDoRelatorio[], periodo: Periodo): Balancete {
  const mov = porConta(totais);
  let [totalD, totalC, totalDevedor, totalCredor] = [ZERO, ZERO, ZERO, ZERO];
  const linhas = contas
    .filter((c) => !c.apagada || mov.has(c.id))
    .map((c) => ({ ...c, contaId: c.id }))
    .sort(peloCodigo)
    .map((conta): LinhaDoBalancete => {
      const { d, c } = mov.get(conta.id) ?? { d: ZERO, c: ZERO };
      const diff = subtrai(d, c);
      const devedor = compara(diff, ZERO) > 0 ? diff : ZERO;
      const credor = compara(diff, ZERO) < 0 ? oposto(diff) : ZERO;
      totalD = soma(totalD, d);
      totalC = soma(totalC, c);
      totalDevedor = soma(totalDevedor, devedor);
      totalCredor = soma(totalCredor, credor);
      return {
        contaId: conta.id, codigo: conta.codigo, descricao: conta.descricao, tipo: conta.tipo, nivel: nivelDoCodigo(conta.codigo),
        debitos: dinheiro(d), creditos: dinheiro(c), saldoDevedor: dinheiro(devedor), saldoCredor: dinheiro(credor),
      };
    });
  return {
    dataDe: periodo.de,
    dataAte: periodo.ate,
    linhas,
    totalDebitos: dinheiro(totalD),
    totalCreditos: dinheiro(totalC),
    totalSaldoDevedor: dinheiro(totalDevedor),
    totalSaldoCredor: dinheiro(totalCredor),
  };
}

// ─── Livro Caixa ──────────────────────────────────────────────────────────

/** Uma conta bancária viva da empresa (ativa ou inativa). */
export type AgenciaDoLivro = { id: string; bancoSigla: string; agencia: string; numero: string; digito: string | null };
/** A soma das transações vivas de uma conta bancária num lado, antes de `de`. */
export type TotalDaAgencia = { agenciaId: string; dc: string; total: Dec };
/** Uma transação viva do período numa conta bancária viva da empresa. */
export type TransacaoDoLivro = { id: string; agenciaId: string; data: string; historico: string; dc: string; valor: Dec };

export type LancamentoDoLivro = { data: string; historico: string; dc: string; valor: string; saldoAcumulado: string };
export type AgenciaNoLivro = {
  agenciaId: string;
  descricao: string;
  saldoInicial: string;
  lancamentos: LancamentoDoLivro[];
  saldoFinal: string;
  totalDebitos: string;
  totalCreditos: string;
};
export type LivroCaixa = { dataDe: string | null; dataAte: string | null; agencias: AgenciaNoLivro[] };

/**
 * `RelatoriosService.livro_caixa` depois da leitura. `anteriores` é nulo sem `de` (o saldo inicial é zero). O
 * crédito soma e o resto (o débito) subtrai, como no original.
 */
export function montarLivroCaixa(
  agencias: readonly AgenciaDoLivro[],
  anteriores: readonly TotalDaAgencia[] | null,
  transacoes: readonly TransacaoDoLivro[],
  periodo: Periodo,
): LivroCaixa {
  const ids = new Set(agencias.map((a) => a.id));
  const iniciais = new Map(agencias.map((a) => [a.id, ZERO]));
  for (const t of anteriores ?? []) {
    if (!ids.has(t.agenciaId)) continue;
    iniciais.set(t.agenciaId, soma(iniciais.get(t.agenciaId)!, t.dc === "C" ? t.total : oposto(t.total)));
  }
  // `ORDER BY agencia_id, data, id`: no mesmo dia, a ordem é a do id da transação (o UUID), não a do extrato.
  const ordenadas = [...transacoes].filter((t) => ids.has(t.agenciaId)).sort((a, b) => comparaPy(a.data, b.data) || comparaPy(a.id, b.id));
  // O original não ordena as contas bancárias (a ordem é a do plano do banco); aqui, banco, agência, número e id.
  const contas = [...agencias].sort(
    (a, b) => comparaPy(a.bancoSigla, b.bancoSigla) || comparaPy(a.agencia, b.agencia) || comparaPy(a.numero, b.numero) || comparaPy(a.id, b.id),
  );
  return {
    dataDe: periodo.de,
    dataAte: periodo.ate,
    agencias: contas.map((a): AgenciaNoLivro => {
      const inicial = iniciais.get(a.id)!;
      let saldo = inicial;
      let [debitos, creditos] = [ZERO, ZERO];
      const lancamentos = ordenadas
        .filter((t) => t.agenciaId === a.id)
        .map((t): LancamentoDoLivro => {
          if (t.dc === "C") {
            saldo = soma(saldo, t.valor);
            creditos = soma(creditos, t.valor);
          } else {
            saldo = subtrai(saldo, t.valor);
            debitos = soma(debitos, t.valor);
          }
          return { data: t.data, historico: t.historico, dc: t.dc, valor: dinheiro(t.valor), saldoAcumulado: dinheiro(saldo) };
        });
      return {
        agenciaId: a.id,
        // `AgenciaBancaria.descricao`: "ITAU 1234 56789 0" (o dígito só se houver).
        descricao: descricaoDaAgencia(a),
        saldoInicial: dinheiro(inicial),
        lancamentos,
        saldoFinal: dinheiro(saldo),
        totalDebitos: dinheiro(debitos),
        totalCreditos: dinheiro(creditos),
      };
    }),
  };
}
