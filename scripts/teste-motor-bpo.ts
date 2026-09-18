// Bancada de teste do motor do BPO, ponta a ponta, num tenant de sandbox.
//
//   npx tsx --env-file=.env scripts/teste-motor-bpo.ts           # roda os testes
//   npx tsx --env-file=.env scripts/teste-motor-bpo.ts --limpar  # apaga o que criou
//
// ─── Por que isto existe ────────────────────────────────────────────────────
//
// O motor do BPO tem sete fatias no ar e mais de mil testes de unidade, e em
// 18/09/2026 **nunca tinha processado um lançamento em produção**: zero contas,
// zero extratos, zero pendências. Teste de unidade prova a regra com dados
// inventados em memória; não prova que a regra, o Prisma, o schema e as
// consultas das telas concordam entre si.
//
// Esta bancada roda o caminho de verdade — as mesmas funções puras que as
// telas usam para decidir, as mesmas gravações que as actions fazem, e as
// mesmas consultas que as telas usam para ler de volta.
//
// ─── O que ela NÃO prova ────────────────────────────────────────────────────
//
// Que o número está **contabilmente certo**. Ela prova coerência: o que entrou
// sai, os totais fecham, e as recusas recusam. Se o conceito estiver errado,
// ela fecha errado com precisão. Isso é conversa com o setor, não script.
//
// Também não passa pelas actions: elas exigem sessão (`getAuthContext`), e
// sessão exige login. Permissão, escopo por setor e `revalidatePath` ficam de
// fora — são o bloco D do plano de testes, na tela.
//
// ─── Onde ela roda ──────────────────────────────────────────────────────────
//
// No tenant de slug `teste`, que existe e está vazio. **Nenhuma escrita sai
// dele**: todo `where` leva o `tenantId` do sandbox, e `--limpar` apaga na
// ordem das dependências. Se o tenant não existir, o script para — criar
// tenant não é trabalho de bancada de teste.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { instanteDaData } from "@/lib/financeiro/periodo";
import {
  validarCamposDoLancamento,
  statusInicialDoManual,
  podeCancelarManual,
  decimalDeCentavos,
  centavosDeTexto,
} from "@/lib/financeiro/manual";
import { prepararImportacao, chaveDeDuplicidade, MAXIMO_DE_LINHAS } from "@/lib/financeiro/importacaoCsv";
import { podeMarcarPago, podeConferir, centavosDeDecimal, situacaoDaConta } from "@/lib/financeiro/contas";
import { listarContas } from "@/lib/financeiro/data";

const SLUG_DO_SANDBOX = "teste";
const limpar = process.argv.includes("--limpar");

// ─── Placar ─────────────────────────────────────────────────────────────────

let passou = 0;
let falhou = 0;
const falhas: string[] = [];

function ok(condicao: boolean, o_que: string, detalhe?: string) {
  if (condicao) {
    passou++;
    console.log(`  ✓ ${o_que}`);
  } else {
    falhou++;
    falhas.push(o_que);
    console.log(`  ✗ ${o_que}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function igual(recebido: unknown, esperado: unknown, o_que: string) {
  ok(
    JSON.stringify(recebido) === JSON.stringify(esperado),
    o_que,
    `esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(recebido)}`
  );
}

function titulo(t: string) {
  console.log(`\n${t}\n${"─".repeat(t.length)}`);
}

// ─── Sandbox ────────────────────────────────────────────────────────────────

const MARCA = "[bancada]";
const AGORA = new Date();
const HOJE = saoPauloParts(AGORA).dateKey;
const COMPETENCIA = HOJE.slice(0, 7);

function diasAFrente(dias: number): string {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function tenantDoSandbox() {
  const prisma = getPrisma();
  const t = await prisma.tenant.findFirst({ where: { slug: SLUG_DO_SANDBOX }, select: { id: true, name: true } });
  if (!t) throw new Error(`tenant de sandbox "${SLUG_DO_SANDBOX}" não existe — a bancada não cria tenant`);
  return t;
}

/**
 * Apaga na ordem das dependências.
 *
 * Um `deleteMany` por tabela, sempre com o `tenantId` do sandbox: mesmo se
 * alguém rodar isto distraído com outra `DATABASE_URL`, o alcance é um tenant
 * que só tem lixo de teste dentro.
 */
async function limparSandbox(tenantId: string) {
  const prisma = getPrisma();
  const ordem = [
    () => prisma.financeEntry.deleteMany({ where: { tenantId } }),
    () => prisma.financeCounterparty.deleteMany({ where: { tenantId } }),
    () => prisma.costCenter.deleteMany({ where: { tenantId } }),
    () => prisma.bankAccount.deleteMany({ where: { tenantId } }),
    () => prisma.financeCategory.deleteMany({ where: { tenantId } }),
    () => prisma.company.deleteMany({ where: { tenantId } }),
  ];
  let total = 0;
  for (const passo of ordem) total += (await passo()).count;
  return total;
}

// ─── A1 · cadastros ─────────────────────────────────────────────────────────

async function a1(tenantId: string) {
  titulo("A1 · cadastros: empresa, plano de contas, contraparte, centro e banco");
  const prisma = getPrisma();

  const empresa = await prisma.company.create({
    data: {
      tenantId,
      name: `${MARCA} ACME COMERCIO LTDA`,
      cnpj: "11222333000181",
      zipCode: "80010-010",
      addressStreet: "R XV DE NOVEMBRO",
      addressNumber: "1000",
      city: "CURITIBA",
      stateCode: "PR",
    },
    select: { id: true, name: true },
  });
  ok(!!empresa.id, "empresa criada");

  const [despesa, receita] = await Promise.all([
    prisma.financeCategory.create({
      data: { tenantId, name: `${MARCA} Aluguel`, kind: "PAGAR", dreGroup: "Despesas operacionais" },
      select: { id: true, name: true, kind: true },
    }),
    prisma.financeCategory.create({
      data: { tenantId, name: `${MARCA} Serviços prestados`, kind: "RECEBER", dreGroup: "Receita de serviços" },
      select: { id: true, name: true, kind: true },
    }),
  ]);
  ok(despesa.kind === "PAGAR" && receita.kind === "RECEBER", "plano de contas com uma categoria de cada tipo");

  // O índice único é (tenant, nome, tipo): a mesma palavra nos dois lados do
  // plano é legítima — "Aluguel" que se paga e "Aluguel" que se recebe.
  const mesmoNomeOutroTipo = await prisma.financeCategory
    .create({ data: { tenantId, name: `${MARCA} Aluguel`, kind: "RECEBER" }, select: { id: true } })
    .then(() => true)
    .catch(() => false);
  ok(mesmoNomeOutroTipo, "mesma categoria nos dois tipos é aceita (índice é por nome + tipo)");

  const repetida = await prisma.financeCategory
    .create({ data: { tenantId, name: `${MARCA} Aluguel`, kind: "PAGAR" }, select: { id: true } })
    .then(() => false)
    .catch(() => true);
  ok(repetida, "categoria repetida no mesmo tipo é recusada pelo banco");

  const centro = await prisma.costCenter.create({
    data: { tenantId, companyId: empresa.id, name: `${MARCA} Administrativo`, code: "ADM" },
    select: { id: true },
  });
  ok(!!centro.id, "centro de custo criado");

  const fornecedor = await prisma.financeCounterparty.create({
    data: {
      tenantId,
      companyId: empresa.id,
      name: `${MARCA} IMOBILIARIA CENTRO LTDA`,
      document: "44555666000177",
      defaultCategoryId: despesa.id,
      defaultCostCenterId: centro.id,
    },
    select: { id: true, defaultCategoryId: true, defaultCostCenterId: true },
  });
  ok(
    fornecedor.defaultCategoryId === despesa.id && fornecedor.defaultCostCenterId === centro.id,
    "contraparte guarda categoria e centro padrão"
  );

  const banco = await prisma.bankAccount.create({
    data: {
      tenantId,
      companyId: empresa.id,
      nickname: `${MARCA} Conta movimento`,
      bankCode: "341",
      agency: "1234",
      accountNumber: "56789",
      accountDigits: "56789-0",
      openingBalance: "1000.00",
      openingBalanceDate: instanteDaData(HOJE),
    },
    select: { id: true, openingBalance: true },
  });
  ok(centavosDeDecimal(banco.openingBalance!) === 100000, "conta bancária com saldo de abertura de R$ 1.000,00");

  return { empresa, despesa, receita, centro, fornecedor, banco };
}

// ─── A2 · lançamento manual ─────────────────────────────────────────────────

type Cadastros = Awaited<ReturnType<typeof a1>>;

async function a2(tenantId: string, c: Cadastros) {
  titulo("A2 · lançamento manual a pagar e a receber");
  const prisma = getPrisma();

  // As recusas primeiro: é o que a tela mostra antes de gravar qualquer coisa.
  const semCategoria = validarCamposDoLancamento(
    { kind: "PAGAR", competencia: COMPETENCIA, vencimento: diasAFrente(10), valor: "1.500,00", categoryId: null },
    HOJE
  );
  ok(!semCategoria.ok, "conta a pagar sem categoria é recusada (despesa sem classificação não fecha o DRE)");

  const valorZero = validarCamposDoLancamento(
    { kind: "PAGAR", competencia: COMPETENCIA, vencimento: diasAFrente(10), valor: "0,00", categoryId: c.despesa.id },
    HOJE
  );
  ok(!valorZero.ok, "valor zero é recusado");

  const pagoNoFuturo = validarCamposDoLancamento(
    {
      kind: "PAGAR",
      competencia: COMPETENCIA,
      vencimento: diasAFrente(10),
      valor: "10,00",
      categoryId: c.despesa.id,
      pagoEm: diasAFrente(5),
    },
    HOJE
  );
  ok(!pagoNoFuturo.ok, "baixa com data futura é recusada (isso é agendamento, não baixa)");

  igual(centavosDeTexto("1.500,00"), 150000, "leitura de valor com máscara brasileira");
  igual(centavosDeTexto("1500"), 150000, "leitura de valor sem máscara");

  // Agora o caminho feliz, gravando como a action grava.
  const aPagar = validarCamposDoLancamento(
    {
      kind: "PAGAR",
      competencia: COMPETENCIA,
      vencimento: diasAFrente(10),
      valor: "1.500,00",
      descricao: "Aluguel da sala",
      categoryId: c.despesa.id,
    },
    HOJE
  );
  if (!aPagar.ok) throw new Error(`a pagar não validou: ${aPagar.erro}`);
  igual(statusInicialDoManual(aPagar.dados.pagoEmKey), "CONFERIDO", "lançamento sem data de baixa nasce CONFERIDO");

  const contaAPagar = await prisma.financeEntry.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "PAGAR",
      status: statusInicialDoManual(aPagar.dados.pagoEmKey),
      counterpartyId: c.fornecedor.id,
      categoryId: aPagar.dados.categoryId,
      costCenterId: c.centro.id,
      competence: aPagar.dados.competencia,
      dueDate: instanteDaData(aPagar.dados.vencimentoKey),
      amount: decimalDeCentavos(aPagar.dados.centavos),
      description: aPagar.dados.descricao,
      reviewedAt: new Date(),
    },
    select: { id: true, status: true, amount: true },
  });
  igual(centavosDeDecimal(contaAPagar.amount), 150000, "valor gravado no banco bate com o digitado");

  const jaPago = validarCamposDoLancamento(
    {
      kind: "RECEBER",
      competencia: COMPETENCIA,
      vencimento: diasAFrente(-3),
      valor: "800,00",
      categoryId: c.receita.id,
      pagoEm: HOJE,
    },
    HOJE
  );
  if (!jaPago.ok) throw new Error(`a receber não validou: ${jaPago.erro}`);
  igual(statusInicialDoManual(jaPago.dados.pagoEmKey), "PAGO", "lançamento com data de baixa nasce PAGO");

  const contaAReceber = await prisma.financeEntry.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "RECEBER",
      status: "PAGO",
      counterpartyId: c.fornecedor.id,
      categoryId: jaPago.dados.categoryId,
      competence: jaPago.dados.competencia,
      dueDate: instanteDaData(jaPago.dados.vencimentoKey),
      paidAt: instanteDaData(jaPago.dados.pagoEmKey!),
      amount: decimalDeCentavos(jaPago.dados.centavos),
      reviewedAt: new Date(),
    },
    select: { id: true, status: true },
  });

  // A prova de que a tela leria o que foi gravado: a mesma consulta do /pagar.
  const tela = await listarContas(tenantId, "PAGAR", { competencia: COMPETENCIA }, AGORA);
  const linha = tela.linhas.find((l) => l.id === contaAPagar.id);
  ok(!!linha, "a conta aparece na consulta que a tela /pagar usa");
  igual(linha?.categoriaNome, `${MARCA} Aluguel`, "a tela mostra a categoria");
  igual(linha?.centroDeCustoNome, `${MARCA} Administrativo`, "a tela mostra o centro de custo");
  igual(linha?.situacao, "A_VENCER", "vencimento daqui a 10 dias aparece como a vencer");
  igual(tela.totais.emAberto, 150000, "o total em aberto da tela é o valor da conta");

  return { contaAPagar, contaAReceber };
}

// ─── A3 · importação por CSV ────────────────────────────────────────────────

async function a3(tenantId: string, c: Cadastros) {
  titulo("A3 · importação por CSV: prévia, duplicidade e teto");
  const prisma = getPrisma();

  const categorias = [
    { id: c.despesa.id, nome: `${MARCA} Aluguel`, kind: "PAGAR" as const },
    { id: c.receita.id, nome: `${MARCA} Serviços prestados`, kind: "RECEBER" as const },
  ];
  const centros = [{ id: c.centro.id, nome: `${MARCA} Administrativo`, codigo: "ADM" }];

  const cabecalho = "tipo;contraparte;documento;categoria;vencimento;valor;competencia;descricao;centro_de_custo";
  const csv = [
    cabecalho,
    `pagar;${MARCA} ENERGISA;;${MARCA} Aluguel;${diasAFrente(20)};250,00;${COMPETENCIA};Luz de ${COMPETENCIA};ADM`,
    `receber;${MARCA} CLIENTE ALFA;;${MARCA} Serviços prestados;${diasAFrente(25)};1.200,00;${COMPETENCIA};Honorários;`,
    // Repetida de propósito: mesma chave da primeira linha.
    `pagar;${MARCA} ENERGISA;;${MARCA} Aluguel;${diasAFrente(20)};250,00;${COMPETENCIA};Luz de ${COMPETENCIA};ADM`,
    // Categoria que não existe no plano.
    `pagar;${MARCA} FULANO;;Categoria Inexistente;${diasAFrente(20)};10,00;${COMPETENCIA};;`,
  ].join("\n");

  const previa = prepararImportacao(csv, HOJE, categorias, new Set(), centros);
  ok(previa.ok, "a prévia leu o arquivo", previa.ok ? "" : previa.erro);
  if (!previa.ok) return;

  const validas = previa.linhas.filter((l) => l.situacao === "valida");
  const duplicadas = previa.linhas.filter((l) => l.situacao === "duplicada");
  const erros = previa.linhas.filter((l) => l.situacao === "erro");
  igual(validas.length, 2, "duas linhas válidas");
  igual(duplicadas.length, 1, "a linha repetida é marcada como duplicada dentro do próprio arquivo");
  igual(erros.length, 1, "a linha com categoria inexistente vira erro, e não some");
  ok(
    erros[0]?.situacao === "erro" && erros[0].numero === 5,
    "o erro aponta o número da linha como o Excel mostra",
    `veio linha ${erros[0]?.numero}`
  );

  // Grava só as válidas, como a action faz.
  const criadas: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const l of validas) {
      if (l.situacao !== "valida") continue;
      const contraparte = await tx.financeCounterparty.create({
        data: { tenantId, companyId: c.empresa.id, name: l.dados.contraparteNome },
        select: { id: true },
      });
      const criada = await tx.financeEntry.create({
        data: {
          tenantId,
          companyId: c.empresa.id,
          kind: l.dados.kind,
          status: statusInicialDoManual(l.dados.pagoEmKey),
          counterpartyId: contraparte.id,
          categoryId: l.dados.categoryId,
          costCenterId: l.dados.centroDeCustoId,
          competence: l.dados.competencia,
          dueDate: instanteDaData(l.dados.vencimentoKey),
          amount: decimalDeCentavos(l.dados.centavos),
          description: l.dados.descricao,
          reviewedAt: new Date(),
        },
        select: { id: true },
      });
      criadas.push(criada.id);
    }
  });
  igual(criadas.length, 2, "gravou exatamente as válidas — a duplicada e o erro ficaram de fora");

  const comCentro = await prisma.financeEntry.findFirst({
    where: { tenantId, id: { in: criadas }, kind: "PAGAR" },
    select: { costCenterId: true },
  });
  igual(comCentro?.costCenterId, c.centro.id, "a coluna centro_de_custo casou pelo código");

  // Segunda passada com as chaves já no banco: a mesma linha não entra de novo.
  const existentes = new Set(
    (
      await prisma.financeEntry.findMany({
        where: { tenantId, id: { in: criadas } },
        select: {
          kind: true,
          competence: true,
          dueDate: true,
          amount: true,
          counterparty: { select: { name: true, document: true } },
        },
      })
    ).map((e) =>
      chaveDeDuplicidade({
        kind: e.kind,
        contraparteDocumento: e.counterparty.document,
        contraparteNome: e.counterparty.name,
        competencia: e.competence,
        vencimentoKey: e.dueDate.toISOString().slice(0, 10),
        centavos: centavosDeDecimal(e.amount),
      })
    )
  );
  const segunda = prepararImportacao(csv, HOJE, categorias, existentes, centros);
  if (segunda.ok) {
    const validasDeNovo = segunda.linhas.filter((l) => l.situacao === "valida").length;
    igual(validasDeNovo, 0, "reimportar o mesmo arquivo não cria nada: tudo vira duplicada");
  }

  // Teto de linhas.
  const gigante = [cabecalho, ...Array.from({ length: MAXIMO_DE_LINHAS + 1 }, () => `pagar;X;;${MARCA} Aluguel;${diasAFrente(20)};1,00;${COMPETENCIA};;`)].join("\n");
  const recusado = prepararImportacao(gigante, HOJE, categorias, new Set(), centros);
  ok(!recusado.ok, `arquivo acima de ${MAXIMO_DE_LINHAS} linhas é recusado inteiro`);

  const vazio = prepararImportacao(cabecalho, HOJE, categorias, new Set(), centros);
  ok(!vazio.ok, "arquivo só com cabeçalho é recusado");

  const semColuna = prepararImportacao("tipo;valor\npagar;10", HOJE, categorias, new Set(), centros);
  ok(!semColuna.ok, "arquivo sem as colunas obrigatórias é recusado, dizendo quais faltam");

  return criadas;
}

// ─── A4 · baixa, desfazer e cancelamento ────────────────────────────────────

async function a4(tenantId: string, contas: Awaited<ReturnType<typeof a2>>) {
  titulo("A4 · baixa, desfazer baixa e cancelamento");
  const prisma = getPrisma();

  const antes = await prisma.financeEntry.findUniqueOrThrow({
    where: { id: contas.contaAPagar.id },
    select: { id: true, status: true, kind: true, dueDate: true, paidAt: true, approvalStatus: true, closeReason: true },
  });

  const veredito = podeMarcarPago({ status: antes.status, paidAt: antes.paidAt }, HOJE, HOJE);
  ok(veredito.pode, "conta conferida pode ser baixada", veredito.pode ? "" : veredito.motivo);

  const noFuturo = podeMarcarPago({ status: antes.status, paidAt: antes.paidAt }, diasAFrente(3), HOJE);
  ok(!noFuturo.pode, "baixa com data futura é recusada também aqui");

  await prisma.financeEntry.update({
    where: { id: antes.id },
    data: { status: "PAGO", paidAt: instanteDaData(HOJE) },
  });
  // O recorte padrão da tela é "abertas", e ele **esconde pago e cancelado** de
  // propósito: /pagar é fila de trabalho, não extrato. Vale a pena provar as
  // duas metades — que sumiu da fila, e que continua lá quando se pede tudo.
  const filaDeTrabalho = await listarContas(tenantId, "PAGAR", { competencia: COMPETENCIA }, AGORA);
  ok(
    !filaDeTrabalho.linhas.some((l) => l.id === antes.id),
    "depois da baixa a conta sai da fila de trabalho (recorte padrão esconde pago)"
  );
  // Duas contas a pagar nesta competência: o aluguel do A2 e a luz do A3.
  igual(filaDeTrabalho.totalGeral, 2, "o contador geral ignora o recorte e continua contando as duas");

  const tudo = await listarContas(tenantId, "PAGAR", { competencia: COMPETENCIA, recorte: "todas" }, AGORA);
  const baixada = tudo.linhas.find((l) => l.id === antes.id);
  igual(baixada?.situacao, "PAGA", "pedindo todas, a conta aparece como paga");
  igual(tudo.totais.pago, 150000, "o total pago do recorte inclui a conta");

  // Desfazer devolve ao estado anterior, e não a um estado novo.
  await prisma.financeEntry.update({ where: { id: antes.id }, data: { status: "CONFERIDO", paidAt: null } });
  const desfeita = await prisma.financeEntry.findUniqueOrThrow({
    where: { id: antes.id },
    select: { status: true, paidAt: true },
  });
  ok(desfeita.status === "CONFERIDO" && desfeita.paidAt === null, "desfazer devolve a conta ao estado de antes");

  // Cancelamento: a conta sai dos totais e continua existindo.
  const podeCancelar = podeCancelarManual({ status: "CONFERIDO", paidAt: null, fiscalDocumentId: null, agreementId: null });
  ok(podeCancelar.pode, "lançamento manual conferido pode ser cancelado", podeCancelar.pode ? "" : podeCancelar.motivo);

  const veioDeNota = podeCancelarManual({ status: "CONFERIDO", paidAt: null, fiscalDocumentId: "abc", agreementId: null });
  ok(!veioDeNota.pode, "conta que nasceu de uma nota não é cancelada por aqui");

  await prisma.financeEntry.update({
    where: { id: antes.id },
    data: { status: "CANCELADO", statusBeforeClose: "CONFERIDO" },
  });
  const comCanceladas = await listarContas(tenantId, "PAGAR", { competencia: COMPETENCIA, recorte: "todas" }, AGORA);
  const cancelada = comCanceladas.linhas.find((l) => l.id === antes.id);
  ok(!!cancelada, "a conta cancelada continua na lista quando se pede todas — nada é apagado");
  igual(cancelada?.situacao, "CANCELADA", "e aparece como cancelada");

  const filaDepois = await listarContas(tenantId, "PAGAR", { competencia: COMPETENCIA }, AGORA);
  igual(filaDepois.totais.emAberto, 25000, "o cancelamento tira a conta do em aberto (sobra a do CSV)");
  ok(
    !filaDepois.linhas.some((l) => l.id === antes.id),
    "cancelada também não aparece na fila de trabalho"
  );

  const aindaExiste = await prisma.financeEntry.count({ where: { id: antes.id } });
  igual(aindaExiste, 1, "o registro continua no banco, com o status de antes guardado");

  // Conferir: o passo que antecede a baixa de uma conta provisória.
  ok(podeConferir({ status: "PROVISORIO" }).pode, "conta provisória pode ser conferida");
  ok(!podeConferir({ status: "PAGO" }).pode, "conta paga não volta para conferência");

  // E a situação derivada, que é o que a tela pinta de vermelho.
  const emAberto = { status: "CONFERIDO" as const, dueDate: instanteDaData(HOJE), paidAt: null };
  igual(situacaoDaConta(emAberto, HOJE, diasAFrente(-1)), "VENCIDA", "vencimento de ontem é conta vencida");
  igual(situacaoDaConta(emAberto, HOJE, HOJE), "VENCE_HOJE", "vencimento de hoje é conta que vence hoje");
  igual(situacaoDaConta({ ...emAberto, status: "PAGO", paidAt: new Date() }, HOJE, diasAFrente(-30)), "PAGA", "paga com atraso aparece como paga, e não como vencida");
}

// ─── Execução ───────────────────────────────────────────────────────────────

async function main() {
  const prisma = getPrisma();
  const tenant = await tenantDoSandbox();
  console.log(`sandbox: tenant "${tenant.name}" (${SLUG_DO_SANDBOX})`);

  if (limpar) {
    const n = await limparSandbox(tenant.id);
    console.log(`limpeza: ${n} registro(s) apagado(s).`);
    await prisma.$disconnect();
    return;
  }

  // Sempre parte do zero: teste que depende do estado deixado pelo anterior
  // passa sozinho e falha na suíte, que é o pior tipo de teste.
  const apagados = await limparSandbox(tenant.id);
  if (apagados > 0) console.log(`(limpei ${apagados} registro(s) da rodada anterior)`);

  try {
    const cadastros = await a1(tenant.id);
    const contas = await a2(tenant.id, cadastros);
    await a3(tenant.id, cadastros);
    await a4(tenant.id, contas);
  } finally {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`${passou} passaram · ${falhou} falharam`);
    if (falhou > 0) {
      console.log("\nfalhas:");
      for (const f of falhas) console.log(`  · ${f}`);
    }
    console.log(`\nO sandbox ficou preenchido para inspeção. Para apagar: --limpar`);
    await prisma.$disconnect();
  }
  if (falhou > 0) process.exitCode = 1;
}

main();
