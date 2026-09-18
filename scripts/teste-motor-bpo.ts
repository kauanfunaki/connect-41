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
import {
  podeEnviarParaAprovacao,
  podeDecidir,
  motivoDoBloqueioDeBaixa,
  validarMotivo,
  dentroDoTeto,
  statusInicialDeAprovacao,
} from "@/lib/financeiro/aprovacao/regras";
import { contextoDeEntrada } from "@/lib/financeiro/aprovacao/servidor";
import { transicao, situacaoDoPrazo } from "@/lib/financeiro/pendencias/regras";
import { avaliarLembrete, PASSOS_DO_LEMBRETE } from "@/lib/financeiro/pendencias/lembrete";
import { avaliarRegua, passoDevido, PASSOS_PADRAO } from "@/lib/financeiro/cobranca/regua";
import { validarSelecaoDoAcordo, validarTermosDoAcordo, gerarParcelas } from "@/lib/financeiro/cobranca/acordo";
import { lerOfx } from "@/lib/financeiro/conciliacao/ofx";
import { rankearCandidatos, sugestaoDaTransacao, tipoCompativel } from "@/lib/financeiro/conciliacao/casamento";

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
    () => prisma.clientRequestReminder.deleteMany({ where: { tenantId } }),
    () => prisma.clientRequest.deleteMany({ where: { tenantId } }),
    () => prisma.bankTransactionMatch.deleteMany({ where: { transaction: { tenantId } } }),
    () => prisma.bankTransaction.deleteMany({ where: { tenantId } }),
    () => prisma.bankStatementImport.deleteMany({ where: { tenantId } }),
    () => prisma.financeApprovalEvent.deleteMany({ where: { entry: { tenantId } } }),
    () => prisma.portalApprovalLimit.deleteMany({ where: { tenantId } }),
    () => prisma.portalUser.deleteMany({ where: { tenantId } }),
    () => prisma.financeEntry.updateMany({ where: { tenantId }, data: { agreementId: null, renegotiatedAgreementId: null } }),
    () => prisma.collectionAgreement.deleteMany({ where: { tenantId } }),
    () => prisma.financeEntry.deleteMany({ where: { tenantId } }),
    () => prisma.financeCounterparty.deleteMany({ where: { tenantId } }),
    () => prisma.costCenter.deleteMany({ where: { tenantId } }),
    () => prisma.bankAccount.deleteMany({ where: { tenantId } }),
    () => prisma.financeCategory.deleteMany({ where: { tenantId } }),
    () => prisma.clientGroup.deleteMany({ where: { tenantId } }),
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

// ─── A5 · alçada e aprovação ────────────────────────────────────────────────

const TETO_DA_ALCADA = 100000; // R$ 1.000,00

async function a5(tenantId: string, c: Cadastros) {
  titulo("A5 · alçada e aprovação pelo portal");
  const prisma = getPrisma();

  const grupo = await prisma.clientGroup.create({
    data: { tenantId, name: `${MARCA} Grupo ACME` },
    select: { id: true },
  });
  await prisma.company.update({ where: { id: c.empresa.id }, data: { clientGroupId: grupo.id } });
  const cliente = await prisma.portalUser.create({
    data: {
      tenantId,
      clientGroupId: grupo.id,
      name: `${MARCA} Aprovador`,
      email: `bancada+${Date.now()}@exemplo.invalido`,
      passwordHash: "x".repeat(60),
    },
    select: { id: true },
  });
  const alcada = await prisma.portalApprovalLimit.create({
    data: { tenantId, companyId: c.empresa.id, portalUserId: cliente.id, maxAmount: "1000.00" },
    select: { id: true },
  });
  ok(!!alcada.id, "alçada criada para o usuário do portal, com teto de R$ 1.000,00");

  // Com alçada ativa, conta a pagar em aberto nasce aguardando — é o que muda o
  // comportamento da empresa inteira, e é decidido na entrada.
  const ctx = await contextoDeEntrada(tenantId, [c.empresa.id]);
  igual(ctx.statusInicial(c.empresa.id, "PAGAR", "CONFERIDO"), "AGUARDANDO", "conta a pagar em aberto nasce aguardando aprovação");
  igual(ctx.statusInicial(c.empresa.id, "PAGAR", "PAGO"), "NAO_REQUER", "conta que já nasce paga não entra em aprovação");
  igual(ctx.statusInicial(c.empresa.id, "RECEBER", "CONFERIDO"), "NAO_REQUER", "conta a receber não passa por aprovação");
  igual(
    statusInicialDeAprovacao({ kind: "PAGAR", status: "CONFERIDO", moduloLigado: true, empresaTemAlcadaAtiva: false }),
    "NAO_REQUER",
    "empresa sem alçada não manda nada para aprovação"
  );

  const dentro = await prisma.financeEntry.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "PAGAR",
      status: "CONFERIDO",
      approvalStatus: "AGUARDANDO",
      counterpartyId: c.fornecedor.id,
      categoryId: c.despesa.id,
      competence: COMPETENCIA,
      dueDate: instanteDaData(diasAFrente(15)),
      amount: decimalDeCentavos(50000),
      description: "Dentro do teto",
    },
    select: { id: true },
  });
  const acima = await prisma.financeEntry.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "PAGAR",
      status: "CONFERIDO",
      approvalStatus: "AGUARDANDO",
      counterpartyId: c.fornecedor.id,
      categoryId: c.despesa.id,
      competence: COMPETENCIA,
      // Vencida ontem de propósito: é a data da transação do extrato no A8, e
      // "conta vencida travada na aprovação" é justamente o caso que dói.
      dueDate: instanteDaData(diasAFrente(-1)),
      amount: decimalDeCentavos(500000),
      description: "Acima do teto",
    },
    select: { id: true },
  });

  const noPortal = { tipo: "PORTAL" as const, tetoCentavos: TETO_DA_ALCADA };
  ok(
    podeDecidir({ status: "CONFERIDO", approvalStatus: "AGUARDANDO", valorCentavos: 50000, createdById: null }, noPortal, "APROVAR").pode,
    "o cliente aprova a conta que cabe no teto dele"
  );
  const foraDoTeto = podeDecidir(
    { status: "CONFERIDO", approvalStatus: "AGUARDANDO", valorCentavos: 500000, createdById: null },
    noPortal,
    "APROVAR"
  );
  ok(!foraDoTeto.pode, "o cliente não aprova acima do teto", foraDoTeto.pode ? "" : foraDoTeto.motivo);
  ok(dentroDoTeto(TETO_DA_ALCADA, 100000), "o teto é inclusivo: o valor exato do teto passa");
  ok(!dentroDoTeto(TETO_DA_ALCADA, 100001), "um centavo acima do teto não passa");
  ok(!dentroDoTeto(null, 1), "sem alçada não se aprova nada");

  // Reprovar sem dizer por quê deixa a equipe sem o que corrigir.
  ok(!validarMotivo("  ").ok, "reprovação sem motivo é recusada");
  ok(!validarMotivo("ab").ok, "motivo curto demais é recusado");
  ok(validarMotivo("Nota divergente do pedido").ok, "motivo com texto é aceito");
  const semMotivo = podeDecidir(
    { status: "CONFERIDO", approvalStatus: "AGUARDANDO", valorCentavos: 50000, createdById: null },
    noPortal,
    "REPROVAR",
    null
  );
  ok(!semMotivo.pode, "reprovar sem motivo é recusado também na decisão");

  // A trava: aguardando aprovação impede a baixa.
  const bloqueio = motivoDoBloqueioDeBaixa({ approvalStatus: "AGUARDANDO" });
  ok(!!bloqueio, "conta aguardando aprovação tem motivo de bloqueio de baixa", bloqueio ?? "veio nulo");
  igual(motivoDoBloqueioDeBaixa({ approvalStatus: "APROVADO" }), null, "conta aprovada não tem bloqueio");

  // Aprova de verdade e confere que a trava saiu.
  await prisma.$transaction(async (tx) => {
    await tx.financeEntry.update({
      where: { id: dentro.id },
      data: { approvalStatus: "APROVADO", approvedAt: new Date() },
    });
    await tx.financeApprovalEvent.create({
      data: { entryId: dentro.id, decision: "APROVADO", actorPortalUserId: cliente.id },
    });
  });
  const aprovada = await prisma.financeEntry.findUniqueOrThrow({
    where: { id: dentro.id },
    select: { approvalStatus: true, approvalEvents: { select: { decision: true, actorPortalUserId: true } } },
  });
  igual(aprovada.approvalStatus, "APROVADO", "a conta ficou aprovada");
  igual(aprovada.approvalEvents.length, 1, "a decisão ficou registrada no histórico");
  igual(aprovada.approvalEvents[0]?.actorPortalUserId, cliente.id, "e o histórico guarda que foi o cliente quem decidiu");
  igual(motivoDoBloqueioDeBaixa({ approvalStatus: "APROVADO" }), null, "depois de aprovada, a baixa está liberada");

  // Reenvio e não-reenvio.
  const jaAguardando = podeEnviarParaAprovacao({ kind: "PAGAR", status: "CONFERIDO", paidAt: null, approvalStatus: "AGUARDANDO" });
  ok(!jaAguardando.pode, "conta já aguardando não é enviada de novo");
  const contaAReceber = podeEnviarParaAprovacao({ kind: "RECEBER", status: "CONFERIDO", paidAt: null, approvalStatus: "NAO_REQUER" });
  ok(!contaAReceber.pode, "conta a receber nunca é enviada para aprovação");
  const reprovadaVolta = podeEnviarParaAprovacao({ kind: "PAGAR", status: "CONFERIDO", paidAt: null, approvalStatus: "REPROVADO" });
  ok(reprovadaVolta.pode, "conta reprovada pode ser reenviada depois de corrigida");

  return { cliente, acima };
}

// ─── A6 · pendência e a régua de lembrete ───────────────────────────────────

async function a6(tenantId: string, c: Cadastros) {
  titulo("A6 · pendência: transições, prazo e régua de lembrete");
  const prisma = getPrisma();

  const vencida = await prisma.clientRequest.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "DOCUMENTO",
      title: `${MARCA} Enviar o extrato de ${COMPETENCIA}`,
      description: "Precisamos do extrato para conciliar.",
      dueDate: instanteDaData(diasAFrente(-3)),
    },
    select: { id: true, status: true, dueDate: true },
  });
  igual(vencida.status, "ABERTA", "pendência nasce aberta");
  igual(situacaoDoPrazo(vencida.dueDate, AGORA), "VENCIDA", "prazo de três dias atrás é prazo vencido");
  igual(situacaoDoPrazo(instanteDaData(HOJE), AGORA), "VENCE_HOJE", "prazo de hoje ainda não está vencido");
  igual(situacaoDoPrazo(null, AGORA), "SEM_PRAZO", "pendência sem prazo não tem situação de prazo");

  // As transições, incluindo as que não existem.
  const clienteResponde = transicao("ABERTA", "CLIENTE", "RESPONDER");
  ok(clienteResponde.ok && clienteResponde.novo === "RESPONDIDA", "cliente respondendo leva a pendência para RESPONDIDA");
  const equipeResolve = transicao("RESPONDIDA", "EQUIPE", "RESOLVER");
  ok(equipeResolve.ok && equipeResolve.novo === "RESOLVIDA", "equipe resolve a pendência respondida");
  ok(!transicao("RESOLVIDA", "CLIENTE", "RESPONDER").ok, "pendência resolvida não aceita resposta do cliente");
  ok(!transicao("RESOLVIDA", "CLIENTE", "REABRIR").ok, "cliente não reabre pendência");
  ok(transicao("RESOLVIDA", "EQUIPE", "REABRIR").ok, "a equipe reabre");

  // A régua: passos 1, 3, 7 e 15 dias de atraso.
  igual(PASSOS_DO_LEMBRETE, [1, 3, 7, 15], "os passos do lembrete são 1, 3, 7 e 15 dias");
  const semPrazo = avaliarLembrete({ status: "ABERTA", prazoKey: null, enviados: [] }, HOJE);
  ok(semPrazo.enviar === null && semPrazo.motivo === "SEM_PRAZO", "pendência sem prazo não recebe lembrete");
  const noPrazo = avaliarLembrete({ status: "ABERTA", prazoKey: HOJE, enviados: [] }, HOJE);
  ok(noPrazo.enviar === null && noPrazo.motivo === "NO_PRAZO", "quem vence hoje ainda não recebe lembrete");
  const respondida = avaliarLembrete({ status: "RESPONDIDA", prazoKey: diasAFrente(-5), enviados: [] }, HOJE);
  ok(respondida.enviar === null && respondida.motivo === "NAO_AGUARDA_CLIENTE", "pendência já respondida não é cobrada");

  const primeiroDia = avaliarLembrete({ status: "ABERTA", prazoKey: diasAFrente(-1), enviados: [] }, HOJE);
  igual(primeiroDia.enviar, 1, "um dia de atraso dispara o passo 1");
  const jaMandou = avaliarLembrete({ status: "ABERTA", prazoKey: diasAFrente(-1), enviados: [1] }, HOJE);
  ok(jaMandou.enviar === null && jaMandou.motivo === "SEM_PASSO_HOJE", "o passo 1 não é mandado duas vezes");
  const terceiroDia = avaliarLembrete({ status: "ABERTA", prazoKey: diasAFrente(-3), enviados: [1] }, HOJE);
  igual(terceiroDia.enviar, 3, "três dias de atraso dispara o passo 3");

  // A reserva no banco: é ela que impede o cron de mandar duas vezes se rodar
  // duas vezes no mesmo dia.
  await prisma.clientRequestReminder.create({
    data: { tenantId, requestId: vencida.id, step: 3, recipients: 1, ok: true },
  });
  const repetiu = await prisma.clientRequestReminder
    .create({ data: { tenantId, requestId: vencida.id, step: 3, recipients: 1, ok: true } })
    .then(() => true)
    .catch(() => false);
  ok(!repetiu, "o banco recusa o mesmo passo duas vezes na mesma pendência (índice por pendência + passo)");
}

// ─── A7 · cobrança, régua de e-mail e acordo ────────────────────────────────

async function a7(tenantId: string, c: Cadastros) {
  titulo("A7 · cobrança: régua de e-mail e acordo em parcelas");
  const prisma = getPrisma();

  const sacado = await prisma.financeCounterparty.create({
    data: { tenantId, companyId: c.empresa.id, name: `${MARCA} CLIENTE INADIMPLENTE`, document: "77888999000155" },
    select: { id: true },
  });

  const vencido = await prisma.financeEntry.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "RECEBER",
      status: "CONFERIDO",
      counterpartyId: sacado.id,
      categoryId: c.receita.id,
      competence: COMPETENCIA,
      dueDate: instanteDaData(diasAFrente(-8)),
      amount: decimalDeCentavos(100000),
      description: "Honorários em atraso",
    },
    select: { id: true },
  });

  // A régua de e-mail: os passos e as pausas.
  igual(PASSOS_PADRAO, [1, 7, 15, 30], "os passos padrão da régua são 1, 7, 15 e 30 dias");
  igual(passoDevido(8, PASSOS_PADRAO, [], 30), 7, "oito dias de atraso cai no passo de 7");
  igual(passoDevido(8, PASSOS_PADRAO, [7], 30), null, "o passo de 7 não se repete");
  igual(passoDevido(0, PASSOS_PADRAO, [], 30), null, "sem atraso não há passo");

  const ligada = { ligada: true, passos: PASSOS_PADRAO };
  const base = {
    situacao: "EM_COBRANCA" as const,
    vencimentoKey: diasAFrente(-8),
    ultimoContato: null,
    email: "sacado@exemplo.invalido",
    empresaForaDaRegua: false,
    enviados: [] as number[],
  };

  const normal = avaliarRegua(base, ligada, HOJE);
  igual(normal.enviar, 7, "com e-mail e oito dias de atraso, manda o passo de 7");

  const semEmail = avaliarRegua({ ...base, email: null }, ligada, HOJE);
  ok(semEmail.enviar === null && semEmail.motivo === "SEM_EMAIL", "sacado sem e-mail fica fora da régua");

  const desligada = avaliarRegua(base, { ligada: false, passos: PASSOS_PADRAO }, HOJE);
  ok(desligada.enviar === null && desligada.motivo === "REGUA_DESLIGADA", "régua desligada não manda nada");

  const foraDaRegua = avaliarRegua({ ...base, empresaForaDaRegua: true }, ligada, HOJE);
  ok(foraDaRegua.enviar === null && foraDaRegua.motivo === "EMPRESA_FORA", "empresa que cobra os próprios sacados fica fora da régua");

  const comAcordo = avaliarRegua({ ...base, situacao: "EM_ACORDO" }, ligada, HOJE);
  ok(comAcordo.enviar === null && comAcordo.motivo === "EM_ACORDO", "título em acordo não é cobrado: atropelaria o que foi combinado");

  // Contestação: mandar "você está devendo" para quem disse que não deve é o
  // que transforma contestação em reclamação.
  const contestou = avaliarRegua(
    { ...base, ultimoContato: { resultado: "CONTESTOU", contatoKey: diasAFrente(-1), proximaAcaoKey: null } },
    ligada,
    HOJE
  );
  ok(contestou.enviar === null, "quem contestou não recebe cobrança automática");

  const jaMandou = avaliarRegua({ ...base, enviados: [7] }, ligada, HOJE);
  ok(jaMandou.enviar === null, "o passo já enviado não se repete");

  // O acordo: a seleção, os termos e as parcelas.
  const titulo1 = {
    id: vencido.id,
    kind: "RECEBER" as const,
    status: "CONFERIDO" as const,
    closeReason: null,
    paidAt: null,
    companyId: c.empresa.id,
    counterpartyId: sacado.id,
    vencimentoKey: diasAFrente(-8),
    valorCentavos: 100000,
    statusDoAcordo: null,
  };
  const selecao = validarSelecaoDoAcordo([titulo1], HOJE);
  ok(selecao.ok, "título vencido e em aberto pode virar acordo", selecao.ok ? "" : selecao.erro);

  const emDia = validarSelecaoDoAcordo([{ ...titulo1, vencimentoKey: diasAFrente(5) }], HOJE);
  ok(!emDia.ok, "título em dia não entra em acordo — não está em cobrança");

  const outroSacado = validarSelecaoDoAcordo([titulo1, { ...titulo1, id: "outro", counterpartyId: "sacado-2" }], HOJE);
  ok(!outroSacado.ok, "não se mistura sacado no mesmo acordo");

  const repetido = validarSelecaoDoAcordo([titulo1, titulo1], HOJE);
  ok(!repetido.ok, "título repetido na seleção é recusado");

  const termos = validarTermosDoAcordo(
    { valor: "900,00", parcelas: "3", primeiroVencimento: diasAFrente(30), notas: null },
    HOJE
  );
  ok(termos.ok, "termos válidos: R$ 900,00 em 3 parcelas", termos.ok ? "" : termos.erro);

  const parcelas = gerarParcelas({ totalCentavos: 100000, parcelas: 3, primeiroVencimentoKey: diasAFrente(30) });
  igual(
    parcelas.map((p) => p.valorCentavos),
    [33333, 33333, 33334],
    "R$ 1.000,00 em 3 vira 333,33 + 333,33 + 333,34 — a sobra fica na última"
  );
  igual(
    parcelas.reduce((t, p) => t + p.valorCentavos, 0),
    100000,
    "a soma das parcelas é exatamente o total, sem centavo a mais nem a menos"
  );

  // Grava o acordo como a action faz: originais renegociados, parcelas novas.
  const acordo = await prisma.$transaction(async (tx) => {
    const a = await tx.collectionAgreement.create({
      data: {
        tenantId,
        companyId: c.empresa.id,
        counterpartyId: sacado.id,
        originalAmount: decimalDeCentavos(100000),
        agreedAmount: decimalDeCentavos(90000),
        installments: 3,
        firstDueDate: instanteDaData(diasAFrente(30)),
        agreedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.financeEntry.update({
      where: { id: vencido.id },
      data: {
        status: "CANCELADO",
        closeReason: "RENEGOCIADO",
        statusBeforeClose: "CONFERIDO",
        renegotiatedAgreementId: a.id,
      },
    });
    for (const p of gerarParcelas({ totalCentavos: 90000, parcelas: 3, primeiroVencimentoKey: diasAFrente(30) })) {
      await tx.financeEntry.create({
        data: {
          tenantId,
          companyId: c.empresa.id,
          kind: "RECEBER",
          status: "CONFERIDO",
          counterpartyId: sacado.id,
          categoryId: c.receita.id,
          competence: p.vencimentoKey.slice(0, 7),
          dueDate: instanteDaData(p.vencimentoKey),
          amount: decimalDeCentavos(p.valorCentavos),
          description: `Parcela ${p.numero}/3 do acordo`,
          agreementId: a.id,
        },
      });
    }
    return a;
  });

  const original = await prisma.financeEntry.findUniqueOrThrow({
    where: { id: vencido.id },
    select: { closeReason: true, renegotiatedAgreementId: true },
  });
  igual(original.closeReason, "RENEGOCIADO", "o título original fica marcado como renegociado, e não simplesmente cancelado");
  igual(original.renegotiatedAgreementId, acordo.id, "e aponta para o acordo que o substituiu");

  const doAcordo = await prisma.financeEntry.findMany({
    where: { tenantId, agreementId: acordo.id },
    select: { amount: true },
  });
  igual(doAcordo.length, 3, "nasceram as três parcelas");
  igual(
    doAcordo.reduce((t, p) => t + centavosDeDecimal(p.amount), 0),
    90000,
    "a soma das parcelas no banco é o valor acordado"
  );

  // Parcela de acordo ativo não se renegocia de novo.
  const parcelaDeAtivo = validarSelecaoDoAcordo([{ ...titulo1, id: "parcela", statusDoAcordo: "ATIVO" }], HOJE);
  ok(!parcelaDeAtivo.ok, "parcela de acordo ativo não entra em outro acordo — quebra-se o atual antes");
}

// ─── A8 · conciliação de extrato ────────────────────────────────────────────

/**
 * Um OFX montado aqui, no formato SGML que o internet banking brasileiro usa.
 *
 * **É sintético, e isso é um limite conhecido** — é o item B1 do plano de
 * testes. Ele prova que o leitor entende o formato; não prova que entende o
 * arquivo do Itaú. Um extrato de verdade pode trazer acento em latin1, FITID
 * ausente, tag fechada de outro jeito.
 */
function ofxSintetico(transacoes: { fitId: string; data: string; valor: string; memo: string }[]): Uint8Array {
  const semTraco = (k: string) => k.replace(/-/g, "");
  const linhas = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<BANKMSGSRSV1>",
    "<STMTTRNRS>",
    "<STMTRS>",
    "<CURDEF>BRL",
    "<BANKACCTFROM>",
    "<BANKID>0341",
    "<BRANCHID>1234",
    "<ACCTID>56789-0",
    "<ACCTTYPE>CHECKING",
    "</BANKACCTFROM>",
    "<BANKTRANLIST>",
    `<DTSTART>${semTraco(diasAFrente(-30))}000000[-3:BRT]`,
    `<DTEND>${semTraco(HOJE)}000000[-3:BRT]`,
    ...transacoes.flatMap((t) => [
      "<STMTTRN>",
      `<TRNTYPE>${t.valor.startsWith("-") ? "DEBIT" : "CREDIT"}`,
      `<DTPOSTED>${semTraco(t.data)}000000[-3:BRT]`,
      `<TRNAMT>${t.valor}`,
      `<FITID>${t.fitId}`,
      `<MEMO>${t.memo}`,
      "</STMTTRN>",
    ]),
    "</BANKTRANLIST>",
    "<LEDGERBAL>",
    "<BALAMT>1500.00",
    `<DTASOF>${semTraco(HOJE)}000000[-3:BRT]`,
    "</LEDGERBAL>",
    "</STMTRS>",
    "</STMTTRNRS>",
    "</BANKMSGSRSV1>",
    "</OFX>",
  ];
  return new TextEncoder().encode(linhas.join("\n"));
}

async function a8(tenantId: string, c: Cadastros, travada: { id: string }) {
  titulo("A8 · conciliação: leitura do extrato e casamento");
  const prisma = getPrisma();

  igual(tipoCompativel(-1000), "PAGAR", "débito no extrato casa com conta a pagar");
  igual(tipoCompativel(1000), "RECEBER", "crédito no extrato casa com conta a receber");
  igual(tipoCompativel(0), null, "transação de valor zero não casa com nada");

  const bytes = ofxSintetico([
    { fitId: "TX-001", data: diasAFrente(-2), valor: "-250.00", memo: "PAGTO ENERGISA" },
    { fitId: "TX-002", data: diasAFrente(-1), valor: "-5000.00", memo: "PAGTO FORNECEDOR" },
  ]);
  const leitura = lerOfx(bytes);
  ok(leitura.ok, "o leitor entendeu o OFX", leitura.ok ? "" : leitura.erro);
  if (!leitura.ok) return;

  igual(leitura.extrato.transacoes.length, 2, "duas transações lidas");
  igual(leitura.extrato.transacoes[0]?.centavos, -25000, "o valor vem em centavos, com sinal");
  igual(leitura.extrato.saldo?.centavos, 150000, "o saldo do extrato foi lido");

  const importacao = await prisma.bankStatementImport.create({
    data: {
      tenantId,
      bankAccountId: c.banco.id,
      fileName: "bancada.ofx",
      transactionsRead: leitura.extrato.transacoes.length,
      transactionsNew: leitura.extrato.transacoes.length,
      ledgerBalance: decimalDeCentavos(leitura.extrato.saldo!.centavos),
      ledgerBalanceAt: instanteDaData(leitura.extrato.saldo!.dataKey!),
    },
    select: { id: true },
  });
  for (const t of leitura.extrato.transacoes) {
    await prisma.bankTransaction.create({
      data: {
        tenantId,
        bankAccountId: c.banco.id,
        importId: importacao.id,
        fitId: t.fitId,
        postedAt: instanteDaData(t.dataKey),
        amount: decimalDeCentavos(t.centavos),
        memo: t.memo,
      },
    });
  }
  const gravadas = await prisma.bankTransaction.count({ where: { tenantId, bankAccountId: c.banco.id } });
  igual(gravadas, 2, "as transações foram gravadas");

  // Reimportar o mesmo extrato não duplica: o FITID é único por conta.
  const duplicou = await prisma.bankTransaction
    .create({
      data: {
        tenantId,
        bankAccountId: c.banco.id,
        importId: importacao.id,
        fitId: "TX-001",
        postedAt: instanteDaData(HOJE),
        amount: decimalDeCentavos(-25000),
      },
    })
    .then(() => true)
    .catch(() => false);
  ok(!duplicou, "reimportar o mesmo extrato não duplica transação (FITID é único por conta)");

  // Uma conta que vence **no dia** da transação. A do A3 tem o mesmo valor e o
  // mesmo fornecedor, mas vence daqui a 20 dias: é o par que prova que a data
  // decide quando o nome empata.
  const energisa = await prisma.financeCounterparty.findFirstOrThrow({
    where: { tenantId, name: { contains: "ENERGISA" } },
    select: { id: true },
  });
  const doDia = await prisma.financeEntry.create({
    data: {
      tenantId,
      companyId: c.empresa.id,
      kind: "PAGAR",
      status: "CONFERIDO",
      counterpartyId: energisa.id,
      categoryId: c.despesa.id,
      competence: COMPETENCIA,
      dueDate: instanteDaData(diasAFrente(-2)),
      amount: decimalDeCentavos(25000),
      description: "Luz vencida no dia do extrato",
    },
    select: { id: true },
  });

  // O casamento.
  const candidatas = await prisma.financeEntry.findMany({
    where: { tenantId, kind: "PAGAR", status: { in: ["CONFERIDO", "PROVISORIO"] } },
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      dueDate: true,
      paidAt: true,
      approvalStatus: true,
      counterparty: { select: { name: true, document: true } },
    },
  });
  const paraCasar = candidatas.map((l) => ({
    id: l.id,
    kind: l.kind,
    status: l.status,
    centavos: centavosDeDecimal(l.amount),
    vencimentoKey: l.dueDate.toISOString().slice(0, 10),
    pagoEmKey: l.paidAt ? l.paidAt.toISOString().slice(0, 10) : null,
    contraparteNome: l.counterparty.name,
    contraparteDocumento: l.counterparty.document,
    conciliado: false,
    bloqueioDeBaixa: motivoDoBloqueioDeBaixa({ approvalStatus: l.approvalStatus }),
  }));

  const daLuz = { centavos: -25000, dataKey: diasAFrente(-2), memo: "PAGTO ENERGISA", nome: null };
  const ranking = rankearCandidatos(daLuz, paraCasar);
  igual(ranking.length, 2, "duas contas de R$ 250,00 entram no ranking — mesmo valor, mesmo fornecedor");
  igual(ranking[0]?.lancamento.id, doDia.id, "ganha a que vence no dia do extrato, não a que vence em 20 dias");
  ok(ranking[0]!.naJanela, "a primeira está dentro da janela de data");
  ok(!ranking[1]!.naJanela, "a segunda está fora da janela, e por isso não pontua por data");

  const sugestao = sugestaoDaTransacao(ranking);
  ok(!!sugestao, "e virou sugestão forte");
  igual(sugestao?.candidato.lancamento.id, doDia.id, "a sugestão é a conta certa");
  igual(sugestao?.bloqueio, null, "a sugestão não está travada: dá para confirmar");

  // A trava que o A5 criou: a conta de R$ 5.000,00 está aguardando aprovação.
  // Ela **continua no ranking** — tirá-la promoveria o segundo colocado, que é
  // outra conta, de outro valor.
  const doFornecedor = { centavos: -500000, dataKey: diasAFrente(-1), memo: "PAGTO FORNECEDOR", nome: null };
  const rankingTravado = rankearCandidatos(doFornecedor, paraCasar);
  igual(rankingTravado[0]?.lancamento.id, travada.id, "a conta travada continua em primeiro no ranking");
  const sugestaoTravada = sugestaoDaTransacao(rankingTravado);
  ok(
    !!sugestaoTravada?.bloqueio,
    "a sugestão vem com o motivo do bloqueio, em vez de sumir",
    sugestaoTravada?.bloqueio ?? "veio nula"
  );
  igual(sugestaoTravada?.candidato.lancamento.id, travada.id, "e é a conta travada, não a segunda colocada");
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
    const aprovacao = await a5(tenant.id, cadastros);
    await a6(tenant.id, cadastros);
    await a7(tenant.id, cadastros);
    await a8(tenant.id, cadastros, aprovacao.acima);
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
