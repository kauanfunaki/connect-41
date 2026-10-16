// O miolo dos scripts que corrigem a linha da DRE de uma categoria já gravada
// no banco (`scripts/dre-impostos-retidos-para-cmv.ts`,
// `scripts/dre-pedagio-para-administrativas.ts`). Cada script diz qual é a
// correção; a regra de o que muda é `src/lib/dre/correcaoDaLinha.ts`, e aqui
// ficam a leitura, o relatório e a gravação — iguais para todas.
//
// Separado em 15/10/2026, quando o Pedágio pediu a mesma correção que os
// Impostos Retidos tinham pedido na véspera.
//
// ─── O que ele procura, em todos os escritórios ─────────────────────────────
//
// A categoria pelo nome (a regra de cada correção):
// - a do plano do escritório (vale para toda empresa sem exceção);
// - a de cada empresa com o mesmo nome (Omie, fila da DRE, criada à mão);
// - a exceção de uma empresa para ela (`DreCategoryMapping`).
//
// Só troca o que está na linha de origem. Já no destino, em outra linha
// (decisão de alguém) ou sem linha gravada: só aparece no relatório. Nomes
// parecidos também só aparecem.
//
// ─── Como grava ─────────────────────────────────────────────────────────────
//
// Numa transação só: cada troca confere que o texto gravado ainda é o que a
// leitura viu (se alguém mudou pela tela no meio, nada é gravado), e cada uma
// ganha a sua linha na auditoria ("corrigiu a linha da DRE da categoria", com o
// "de → para") — dentro da mesma transação, para o `--ensaio` desfazer tudo.
//
// Não há número da DRE guardado para recalcular: a DRE (mensal, anual,
// econômica, exportação) é calculada na hora em que a tela abre, a partir da
// linha de cada categoria. Trocou a linha, o próximo carregamento já mostra.

import { getPrisma } from "../../src/lib/prisma";
import { centavosDeDecimal } from "../../src/lib/dre/data";
import {
  ACAO_DA_CORRECAO,
  deParaDaLinha,
  detalhesDaAuditoria,
  impactoNaDre,
  planejarCorrecao,
  type Achado,
  type CorrecaoDaLinha,
  type ImpactoNoMes,
  type ValorPago,
} from "../../src/lib/dre/correcaoDaLinha";
import { grupoDeTexto } from "../../src/lib/dre/mapeamento";
import { rotuloDoGrupo } from "../../src/lib/dre/estrutura";

export type CorrecaoDoScript = {
  correcao: CorrecaoDaLinha;
  /** A primeira linha do relatório: o nome procurado, e com que variações. */
  descricao: string;
  /**
   * Trechos do nome que pré-filtram, no banco, as linhas dos arquivos do Omie
   * importados — maiúsculo e minúsculo, com e sem acento, porque a colação do
   * banco pode distinguir. O filtro de verdade é `correcao.ehDaCategoria`.
   */
  trechosNoImport: string[];
  /** O que a troca muda na tela, para o relatório do impacto (uma linha cada). */
  efeitoNaTela: string[];
};

const ENSAIO = "ensaio: tudo seria gravado sem erro; a transação foi desfeita";
class Ensaio extends Error {}

type Prisma = ReturnType<typeof getPrisma>;

// ─── Leitura ────────────────────────────────────────────────────────────────

/** O mês em São Paulo — o mesmo recorte de `src/lib/dre/data.ts`. */
function mesEmSaoPaulo(d: Date): { ano: number; mes: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(d);
  return { ano: Number(p.find((x) => x.type === "year")!.value), mes: Number(p.find((x) => x.type === "month")!.value) };
}

/**
 * Os valores que a DRE soma nesta categoria: lançamentos pagos do financeiro e
 * linhas dos arquivos do Omie importados. Mês com arquivo importado ignora o
 * financeiro daquele mês, como a tela.
 */
async function valoresPagos(prisma: Prisma, cfg: CorrecaoDoScript, idsDasCategorias: string[]): Promise<ValorPago[]> {
  const [importados, lancamentos, linhas] = await Promise.all([
    prisma.dreImport.findMany({ select: { companyId: true, ano: true, mes: true } }),
    prisma.financeEntry.findMany({
      where: { categoryId: { in: idsDasCategorias }, paidAt: { not: null } },
      select: { tenantId: true, companyId: true, categoryId: true, kind: true, amount: true, paidAt: true },
    }),
    prisma.dreImportLine.findMany({
      where: { OR: cfg.trechosNoImport.map((t) => ({ categoria: { contains: t } })) },
      select: {
        categoria: true,
        valorCentavos: true,
        dreImport: { select: { tenantId: true, companyId: true, ano: true, mes: true, origem: true } },
      },
    }),
  ]);
  const mesImportado = new Set(importados.map((i) => `${i.companyId}|${i.ano}|${i.mes}`));

  const valores: ValorPago[] = [];
  for (const l of lancamentos) {
    const { ano, mes } = mesEmSaoPaulo(l.paidAt!);
    if (mesImportado.has(`${l.companyId}|${ano}|${mes}`)) continue;
    valores.push({
      tenantId: l.tenantId,
      companyId: l.companyId,
      ano,
      mes,
      categoryId: l.categoryId!,
      centavos: centavosDeDecimal(l.amount) * (l.kind === "PAGAR" ? -1 : 1),
      origem: l.kind === "PAGAR" ? "pagamento" : "recebimento",
    });
  }
  for (const l of linhas) {
    if (!l.categoria || !cfg.correcao.ehDaCategoria(l.categoria)) continue;
    valores.push({
      tenantId: l.dreImport.tenantId,
      companyId: l.dreImport.companyId,
      ano: l.dreImport.ano,
      mes: l.dreImport.mes,
      nome: l.categoria,
      centavos: l.valorCentavos,
      origem: l.dreImport.origem === "PAGAMENTO" ? "pagamento" : "recebimento",
    });
  }
  return valores;
}

// ─── Relatório ──────────────────────────────────────────────────────────────

/** Cabe o nome inteiro da categoria do padrão e o "de → para" inteiro. */
const LARGURA_MAXIMA = 60;

function cortar(texto: string): string {
  return texto.length > LARGURA_MAXIMA ? `${texto.slice(0, LARGURA_MAXIMA - 1)}…` : texto;
}

function tabela(cabecalho: string[], linhas: string[][], alinharDireita: number[] = []): void {
  const todas = [cabecalho, ...linhas].map((l) => l.map(cortar));
  const larguras = cabecalho.map((_, i) => Math.max(...todas.map((l) => l[i]!.length)));
  const formatar = (l: string[]) =>
    "  " + l.map((c, i) => (alinharDireita.includes(i) ? c.padStart(larguras[i]!) : c.padEnd(larguras[i]!))).join("  │  ").trimEnd();
  console.log(formatar(todas[0]!));
  console.log("  " + larguras.map((w) => "─".repeat(w)).join("──┼──"));
  for (const l of todas.slice(1)) console.log(formatar(l));
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => REAIS.format(centavos / 100);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (ano: number, mes: number) => `${MESES[mes - 1]}/${ano}`;

/** A linha da DRE como a tela diz, ou o texto gravado quando a DRE não o reconhece. */
function linhaAtual(valor: string | null): string {
  if (!valor?.trim()) return "sem linha";
  const g = grupoDeTexto(valor);
  return g ? rotuloDoGrupo(g) : `"${valor}" (a DRE não reconhece)`;
}

// ─── Execução ───────────────────────────────────────────────────────────────

export async function corrigirLinhaDaCategoria(cfg: CorrecaoDoScript): Promise<void> {
  try {
    await executar(cfg);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    try {
      await getPrisma().$disconnect();
    } catch {
      // Sem conexão para fechar (faltou DATABASE_URL): o erro já saiu acima.
    }
  }
}

async function executar(cfg: CorrecaoDoScript): Promise<void> {
  const { correcao } = cfg;
  const ensaio = process.argv.includes("--ensaio");
  const aplicar = process.argv.includes("--aplicar");
  const email = process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length).trim() || null;
  const origem = rotuloDoGrupo(correcao.de);
  const destino = rotuloDoGrupo(correcao.para);

  if (ensaio && aplicar) {
    console.log("Use --ensaio ou --aplicar, não os dois.");
    process.exit(1);
  }
  const prisma = getPrisma();

  const [escritorios, todas] = await Promise.all([
    prisma.tenant.findMany({ select: { id: true, name: true } }),
    prisma.financeCategory.findMany({
      select: { id: true, tenantId: true, companyId: true, name: true, kind: true, dreGroup: true },
    }),
  ]);
  const categorias = todas.filter((c) => correcao.ehDaCategoria(c.name));
  const parecidas = todas.filter((c) => correcao.pareceComACategoria(c.name));
  const ids = categorias.map((c) => c.id);
  const excecoes = ids.length
    ? await prisma.dreCategoryMapping.findMany({
        where: { categoryId: { in: ids } },
        select: { id: true, tenantId: true, companyId: true, categoryId: true, grupo: true },
      })
    : [];

  const plano = planejarCorrecao(correcao, categorias, excecoes);
  const impacto = ids.length ? impactoNaDre(correcao, categorias, excecoes, plano, await valoresPagos(prisma, cfg, ids)) : [];

  const idsDeEmpresa = new Set<string>();
  for (const c of [...categorias, ...parecidas]) if (c.companyId) idsDeEmpresa.add(c.companyId);
  for (const e of excecoes) idsDeEmpresa.add(e.companyId);
  for (const i of impacto) idsDeEmpresa.add(i.companyId);
  const empresas = await prisma.company.findMany({
    where: { id: { in: [...idsDeEmpresa] } },
    select: { id: true, name: true, displayName: true },
  });
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.displayName || e.name]));
  const nomeDoEscritorio = new Map(escritorios.map((t) => [t.id, t.name]));
  const escritorio = (id: string) => nomeDoEscritorio.get(id) ?? id;
  const empresa = (id: string | null) => (id ? (nomeDaEmpresa.get(id) ?? id) : "padrão do escritório");
  const ordenar = (lista: Achado[]) =>
    [...lista].sort(
      (a, b) =>
        escritorio(a.tenantId).localeCompare(escritorio(b.tenantId)) ||
        Number(a.companyId !== null) - Number(b.companyId !== null) ||
        empresa(a.companyId).localeCompare(empresa(b.companyId)) ||
        a.onde.localeCompare(b.onde)
    );
  const nomeComLado = (a: { nome: string; kind: string }) => (a.kind === "RECEBER" ? `${a.nome} (a receber)` : a.nome);

  console.log(cfg.descricao);
  console.log(`Achadas em todos os escritórios: ${categorias.length} categoria(s) com o nome e ${excecoes.length} exceção(ões) de empresa para elas.\n`);

  console.log(`─── Passam para ${destino}: ${plano.mudar.length} ───`);
  if (plano.mudar.length) {
    tabela(
      ["Escritório", "Empresa", "Categoria", "Onde está gravada", "De → para"],
      ordenar(plano.mudar).map((a) => [escritorio(a.tenantId), empresa(a.companyId), nomeComLado(a), a.onde, deParaDaLinha(correcao, a)])
    );
  } else console.log("  nenhuma");

  const relatar = (titulo: string, lista: Achado[]) => {
    if (!lista.length) return;
    console.log(`\n─── ${titulo}: ${lista.length} ───`);
    tabela(
      ["Escritório", "Empresa", "Categoria", "Onde está gravada", "Linha da DRE hoje"],
      ordenar(lista).map((a) => [escritorio(a.tenantId), empresa(a.companyId), nomeComLado(a), a.onde, linhaAtual(a.valor)])
    );
  };
  relatar(`Já estão em ${destino} (nada a fazer)`, plano.jaNoDestino);
  relatar("Em outra linha da DRE — alguém escolheu; não mexo", plano.outraLinha);
  relatar(
    "Sem linha da DRE gravada — não mexo (com o mesmo nome do padrão, a DRE segue a linha do padrão; senão, ficam na fila de classificação)",
    plano.semLinha
  );

  if (parecidas.length) {
    console.log(`\n─── Nomes parecidos, mas não são esta categoria — não mexo: ${parecidas.length} ───`);
    tabela(
      ["Escritório", "Empresa", "Categoria", "Linha da DRE hoje"],
      parecidas
        .map((c) => [escritorio(c.tenantId), empresa(c.companyId), nomeComLado({ nome: c.name, kind: c.kind }), linhaAtual(c.dreGroup)])
        .sort((a, b) => a.join("|").localeCompare(b.join("|")))
    );
  }

  console.log(`\n─── O que muda na DRE (o que já foi pago nesta categoria) ───`);
  if (impacto.length) {
    for (const linha of cfg.efeitoNaTela) console.log(`  ${linha}`);
    console.log("");
    tabela(
      ["Escritório", "Empresa", "Mês", `Sai de ${origem} e entra em ${destino}`],
      ordenarImpacto(impacto, escritorio, empresa).map((i) => [escritorio(i.tenantId), empresa(i.companyId), mesAno(i.ano, i.mes), reais(-i.centavos)]),
      [3]
    );
    const porEmpresa = new Map<string, { tenantId: string; companyId: string; centavos: number; meses: number }>();
    for (const i of impacto) {
      const k = `${i.tenantId}|${i.companyId}`;
      const t = porEmpresa.get(k) ?? { tenantId: i.tenantId, companyId: i.companyId, centavos: 0, meses: 0 };
      t.centavos += i.centavos;
      t.meses += 1;
      porEmpresa.set(k, t);
    }
    console.log("\n  Total por empresa:");
    for (const t of [...porEmpresa.values()].sort((a, b) => a.centavos - b.centavos)) {
      console.log(`    ${escritorio(t.tenantId)} · ${empresa(t.companyId)}: ${reais(-t.centavos)} em ${t.meses} mês(es)`);
    }
  } else {
    console.log("  Nenhum valor pago muda de linha (nenhum lançamento pago nem arquivo do Omie nesta categoria, nas linhas que mudam).");
  }

  console.log("\n─── Por escritório ───");
  for (const t of escritorios) {
    const conta = (lista: Achado[]) => lista.filter((a) => a.tenantId === t.id).length;
    const n = [conta(plano.mudar), conta(plano.jaNoDestino), conta(plano.outraLinha), conta(plano.semLinha)];
    if (n.every((x) => x === 0)) continue;
    console.log(`  ${t.name}: ${n[0]} passam para ${destino}, ${n[1]} já lá, ${n[2]} em outra linha, ${n[3]} sem linha`);
  }

  if (!ensaio && !aplicar) {
    console.log("\nSimulação: nada foi gravado.");
    if (plano.mudar.length) {
      console.log("Para gravar e desfazer (prova que grava sem erro): --ensaio --email=<seu e-mail do Connect>");
      console.log("Para gravar de verdade:                           --aplicar --email=<seu e-mail do Connect>");
    }
    return;
  }
  if (plano.mudar.length === 0) {
    console.log("\nNada a mudar.");
    return;
  }

  if (!email) {
    console.log("\nFalta --email=<seu e-mail do Connect>: é o nome que a auditoria mostra em cada troca.");
    process.exit(1);
  }
  const usuarios = await prisma.user.findMany({ where: { email }, select: { id: true, tenantId: true, name: true } });
  if (usuarios.length === 0) {
    console.log(`\nNenhum usuário do Connect com o e-mail ${email}. Nada foi gravado.`);
    process.exit(1);
  }
  // O usuário do próprio escritório quando existe; senão, o mesmo e-mail de outro.
  const atorDo = (tenantId: string) => usuarios.find((u) => u.tenantId === tenantId) ?? usuarios[0]!;
  console.log(`\nNa auditoria, quem fez: ${usuarios[0]!.name}.`);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const a of plano.mudar) {
          // Grava só se o texto ainda for o que a leitura viu.
          const r =
            a.tabela === "categoria"
              ? await tx.financeCategory.updateMany({ where: { id: a.id, dreGroup: a.valor }, data: { dreGroup: correcao.para } })
              : await tx.dreCategoryMapping.updateMany({ where: { id: a.id, grupo: a.valor ?? "" }, data: { grupo: correcao.para } });
          if (r.count !== 1) {
            throw new Error(`"${a.nome}" (${empresa(a.companyId)}, ${a.onde}) mudou desde a leitura. Nada foi gravado — rode a simulação de novo.`);
          }
          const ator = atorDo(a.tenantId);
          await tx.auditLog.create({
            data: {
              tenantId: a.tenantId,
              userId: ator.id,
              actorName: ator.name,
              action: ACAO_DA_CORRECAO,
              entityType: "FinanceCategory",
              entityId: a.categoryId,
              metadata: detalhesDaAuditoria(correcao, a),
            },
          });
        }
        if (ensaio) throw new Ensaio(ENSAIO);
      },
      { maxWait: 15_000, timeout: 120_000 }
    );
  } catch (err) {
    if (err instanceof Ensaio || (err instanceof Error && err.message === ENSAIO)) {
      console.log(`\n${ENSAIO} (${plano.mudar.length} troca(s) e ${plano.mudar.length} linha(s) de auditoria).`);
      return;
    }
    throw err;
  }

  console.log(`\nGravado: ${plano.mudar.length} troca(s) para ${destino}, cada uma com a sua linha na auditoria.`);
  console.log(`Rodar a simulação de novo deve dizer "Passam para ${destino}: 0".`);
}

function ordenarImpacto(
  lista: ImpactoNoMes[],
  escritorio: (id: string) => string,
  empresa: (id: string | null) => string
): ImpactoNoMes[] {
  return [...lista].sort(
    (a, b) =>
      escritorio(a.tenantId).localeCompare(escritorio(b.tenantId)) ||
      empresa(a.companyId).localeCompare(empresa(b.companyId)) ||
      a.ano - b.ano ||
      a.mes - b.mes
  );
}
