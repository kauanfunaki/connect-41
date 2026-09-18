// Dados de demonstração do BPO, numa empresa de teste dentro da produção.
//
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts            # simulação
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --aplicar
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar
//
// ─── Por que isto existe ────────────────────────────────────────────────────
//
// O motor do BPO está inteiro no ar e **nunca processou um lançamento**: em
// 18/09/2026 a produção tinha zero contas, zero extratos, zero pendências. As
// telas abrem vazias, e tela vazia não se testa — nem o cartão do celular, nem
// a fila de trabalho, nem a DRE.
//
// ─── Onde os dados ficam, e por quê ─────────────────────────────────────────
//
// Numa **empresa fictícia dentro do tenant de produção**, escolha do Kauan em
// 18/09 entre três: sandbox separado (invisível para ele, porque o tenant
// `teste` não tem usuário), produção solta (lançamento falso pendurado em
// cliente real) e este meio-termo.
//
// O que o meio-termo aceita, de olhos abertos:
//
// - **nenhum cliente real recebe lançamento falso** — tudo pendura na empresa
//   `[demo]`, e o grupo de cliente dela também é próprio;
// - **mas os totais somam.** A tela de contas a pagar sem filtro de empresa vai
//   incluir esta, e o motor de alertas vai avisar sobre ela — o que, de quebra,
//   é a primeira vez que os alertas financeiros terão o que dizer;
// - **o plano de contas é do tenant**, não da empresa: as três categorias
//   `[demo]` aparecem no seletor de qualquer empresa. É a única poluição que
//   este script não consegue confinar, e some com `--limpar`.
//
// ─── O que este script NÃO faz ──────────────────────────────────────────────
//
// **Não cria senha utilizável.** O usuário do portal nasce com um hash
// aleatório que ninguém conhece, inclusive eu. Para entrar no portal como o
// cliente de demonstração, alguém define a senha pela tela de administração.
// Credencial não passa por aqui nem por chat.
//
// **Não põe e-mail em contraparte nenhuma.** Sacado com e-mail entra na régua
// de cobrança, e a régua manda e-mail de verdade. Endereço inventado viraria
// falha de envio registrada no banco todo dia.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { randomBytes } from "node:crypto";

const MARCA = "[demo]";
const SLUG_DO_TENANT = "41tech";
const aplicar = process.argv.includes("--aplicar");
const limpar = process.argv.includes("--limpar");

// ─── Datas ──────────────────────────────────────────────────────────────────

const HOJE = new Date();
const HOJE_KEY = new Date(HOJE.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const COMPETENCIA = HOJE_KEY.slice(0, 7);

function dia(offset: number): Date {
  const d = new Date(`${HOJE_KEY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return new Date(`${d.toISOString().slice(0, 10)}T03:00:00.000Z`);
}
function chave(offset: number): string {
  const d = new Date(`${HOJE_KEY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
const reais = (v: number) => v.toFixed(2);

// ─── Limpeza ────────────────────────────────────────────────────────────────

/**
 * Apaga só o que tem a marca, na ordem das dependências.
 *
 * Mesmo desenho da bancada de teste, e pelo mesmo motivo: `deleteMany` por
 * tenant, aqui, apagaria a base de 390 clientes.
 */
async function limparDemo(p: PrismaClient, tenantId: string): Promise<string[]> {
  const feito: string[] = [];
  const empresas = await p.company.findMany({ where: { tenantId, name: { startsWith: MARCA } }, select: { id: true } });
  const ids = empresas.map((e) => e.id);
  const conta = (r: { count: number }, o_que: string) => {
    if (r.count > 0) feito.push(`${r.count} ${o_que}`);
  };

  if (ids.length > 0) {
    const daEmpresa = { companyId: { in: ids } };
    conta(await p.companyMessageAttachment.deleteMany({ where: { message: daEmpresa } }), "anexos de mensagem");
    conta(await p.companyMessage.deleteMany({ where: daEmpresa }), "mensagens");
    conta(await p.clientRequestReminder.deleteMany({ where: { request: daEmpresa } }), "lembretes");
    conta(await p.clientRequest.deleteMany({ where: daEmpresa }), "pendências");
    conta(await p.bankTransactionMatch.deleteMany({ where: { transaction: { bankAccount: daEmpresa } } }), "vínculos de conciliação");
    conta(await p.bankTransaction.deleteMany({ where: { bankAccount: daEmpresa } }), "transações bancárias");
    conta(await p.bankStatementImport.deleteMany({ where: { bankAccount: daEmpresa } }), "importações de extrato");
    conta(await p.financeApprovalEvent.deleteMany({ where: { entry: daEmpresa } }), "eventos de aprovação");
    conta(await p.portalApprovalLimit.deleteMany({ where: daEmpresa }), "alçadas");
    conta(await p.budgetLine.deleteMany({ where: { budget: daEmpresa } }), "linhas de orçamento");
    conta(await p.budget.deleteMany({ where: daEmpresa }), "orçamentos");
    await p.financeEntry.updateMany({ where: daEmpresa, data: { agreementId: null, renegotiatedAgreementId: null } });
    conta(await p.collectionAgreement.deleteMany({ where: daEmpresa }), "acordos");
    conta(await p.financeEntry.deleteMany({ where: daEmpresa }), "lançamentos");
    conta(await p.financeCounterparty.deleteMany({ where: daEmpresa }), "contrapartes");
    conta(await p.costCenter.deleteMany({ where: daEmpresa }), "centros de custo");
    conta(await p.bankAccount.deleteMany({ where: daEmpresa }), "contas bancárias");
  }
  const comMarca = { tenantId, name: { startsWith: MARCA } };
  conta(await p.portalUser.deleteMany({ where: comMarca }), "usuários do portal");
  conta(await p.company.deleteMany({ where: comMarca }), "empresas");
  conta(await p.clientGroup.deleteMany({ where: comMarca }), "grupos de cliente");
  conta(await p.financeCategory.deleteMany({ where: comMarca }), "categorias");
  return feito;
}

// ─── Criação ────────────────────────────────────────────────────────────────

async function criar(p: PrismaClient, tenantId: string, autorId: string, outroAutorId: string) {
  const grupo = await p.clientGroup.create({
    data: { tenantId, name: `${MARCA} Grupo Modelo` },
    select: { id: true },
  });

  const empresa = await p.company.create({
    data: {
      tenantId,
      clientGroupId: grupo.id,
      name: `${MARCA} TRANSPORTES MODELO LTDA`,
      displayName: `${MARCA} Transportes Modelo`,
      cnpj: "11222333000181",
      zipCode: "80010-010",
      addressStreet: "R XV DE NOVEMBRO",
      addressNumber: "1000",
      addressComplement: "SALA 5",
      neighborhood: "CENTRO",
      city: "CURITIBA",
      stateCode: "PR",
      taxRegime: "SIMPLES_NACIONAL",
      // Explícito: o default do schema é PROSPECT, e `empresasDoSeletor` só
      // lista ACTIVE. Sem isto a empresa aparece nas listas de contas (que
      // filtram por tenant) e **não** no seletor da conciliação e da DRE — que
      // é exatamente como ela nasceu na primeira rodada.
      status: "ACTIVE",
    },
    select: { id: true, name: true },
  });

  // Senha que ninguém conhece: entrar no portal como este cliente exige que
  // alguém defina uma nova pela tela de administração.
  const clienteDoPortal = await p.portalUser.create({
    data: {
      tenantId,
      clientGroupId: grupo.id,
      name: `${MARCA} Cliente Modelo`,
      email: "cliente.demo@exemplo.invalido",
      passwordHash: randomBytes(32).toString("hex"),
    },
    select: { id: true, email: true },
  });

  const [aluguel, combustivel, fretes] = await Promise.all([
    p.financeCategory.create({
      data: { tenantId, name: `${MARCA} Aluguel e condomínio`, kind: "PAGAR", dreGroup: "administrativas" },
      select: { id: true },
    }),
    p.financeCategory.create({
      data: { tenantId, name: `${MARCA} Combustível`, kind: "PAGAR", dreGroup: "cmv" },
      select: { id: true },
    }),
    p.financeCategory.create({
      data: { tenantId, name: `${MARCA} Fretes prestados`, kind: "RECEBER", dreGroup: "receita_bruta" },
      select: { id: true },
    }),
  ]);

  const centro = await p.costCenter.create({
    data: { tenantId, companyId: empresa.id, name: `${MARCA} Operação`, code: "OPE" },
    select: { id: true },
  });

  // Sem e-mail, de propósito: ver o cabeçalho.
  const contraparte = (nome: string, documento: string, categoriaId: string | null) =>
    p.financeCounterparty.create({
      data: {
        tenantId,
        companyId: empresa.id,
        name: `${MARCA} ${nome}`,
        document: documento,
        defaultCategoryId: categoriaId,
        defaultCostCenterId: centro.id,
      },
      select: { id: true, name: true },
    });

  const [posto, imobiliaria, oficina, clienteA, clienteB, inadimplente] = await Promise.all([
    contraparte("POSTO CENTRAL", "21212936000156", combustivel.id),
    contraparte("IMOBILIARIA CENTRO", "44555666000177", aluguel.id),
    contraparte("OFICINA DO PAULO", "37842038000111", combustivel.id),
    contraparte("INDUSTRIA ALFA", "50716983000135", null),
    contraparte("COMERCIO BETA", "31938024000110", null),
    contraparte("LOGISTICA GAMA", "26967689000111", null),
  ]);

  const banco = await p.bankAccount.create({
    data: {
      tenantId,
      companyId: empresa.id,
      nickname: `${MARCA} Itaú movimento`,
      bankCode: "341",
      agency: "1234",
      accountNumber: "7285122870",
      accountDigits: "7285122870",
      openingBalance: "50000.00",
      openingBalanceDate: dia(-60),
    },
    select: { id: true },
  });

  // ── Contas a pagar: um de cada situação que a tela pinta diferente ────────
  const aPagar = [
    { c: imobiliaria, cat: aluguel.id, v: 850000, venc: -12, pago: null, desc: "Aluguel do galpão" },
    { c: posto, cat: combustivel.id, v: 234550, venc: -5, pago: null, desc: "Abastecimento quinzenal" },
    { c: oficina, cat: combustivel.id, v: 129000, venc: -1, pago: null, desc: "Revisão do cavalo 12" },
    { c: posto, cat: combustivel.id, v: 187600, venc: 0, pago: null, desc: "Abastecimento — vence hoje" },
    { c: imobiliaria, cat: aluguel.id, v: 45000, venc: 3, pago: null, desc: "Condomínio" },
    { c: oficina, cat: combustivel.id, v: 320000, venc: 9, pago: null, desc: "Pneus do conjunto 07" },
    { c: posto, cat: combustivel.id, v: 210000, venc: 18, pago: null, desc: "Arla e lubrificantes" },
    { c: imobiliaria, cat: aluguel.id, v: 850000, venc: -42, pago: -42, desc: "Aluguel do mês passado" },
    { c: posto, cat: combustivel.id, v: 198300, venc: -30, pago: -28, desc: "Abastecimento do mês passado" },
  ];

  const criados: string[] = [];
  for (const l of aPagar) {
    const e = await p.financeEntry.create({
      data: {
        tenantId,
        companyId: empresa.id,
        kind: "PAGAR",
        status: l.pago === null ? "CONFERIDO" : "PAGO",
        counterpartyId: l.c.id,
        categoryId: l.cat,
        costCenterId: centro.id,
        competence: COMPETENCIA,
        dueDate: dia(l.venc),
        paidAt: l.pago === null ? null : dia(l.pago),
        amount: reais(l.v / 100),
        description: l.desc,
        createdById: autorId,
        reviewedById: autorId,
        reviewedAt: new Date(),
      },
      select: { id: true },
    });
    criados.push(e.id);
  }

  // Uma cancelada, para a tela mostrar que nada é apagado.
  await p.financeEntry.create({
    data: {
      tenantId,
      companyId: empresa.id,
      kind: "PAGAR",
      status: "CANCELADO",
      statusBeforeClose: "CONFERIDO",
      closeReason: "CANCELADO",
      counterpartyId: oficina.id,
      categoryId: combustivel.id,
      competence: COMPETENCIA,
      dueDate: dia(6),
      amount: "410.00",
      description: "Serviço cancelado pelo fornecedor",
      createdById: autorId,
    },
  });

  // ── Duas aguardando aprovação, com alçada de R$ 3.000,00 ─────────────────
  await p.portalApprovalLimit.create({
    data: { tenantId, companyId: empresa.id, portalUserId: clienteDoPortal.id, maxAmount: "3000.00" },
  });
  // Autor diferente de propósito: **quem lança não aprova**. Se as contas em
  // aprovação figurarem lançadas por quem está testando, a tela esconde os
  // botões e a regra parece defeito — foi o que aconteceu na primeira rodada.
  for (const a of [
    { v: 156000, venc: 7, desc: "Manutenção preventiva — dentro do teto" },
    { v: 1250000, venc: 11, desc: "Reforma do pátio — acima do teto" },
  ]) {
    const e = await p.financeEntry.create({
      data: {
        tenantId,
        companyId: empresa.id,
        kind: "PAGAR",
        status: "CONFERIDO",
        approvalStatus: "AGUARDANDO",
        counterpartyId: oficina.id,
        categoryId: combustivel.id,
        costCenterId: centro.id,
        competence: COMPETENCIA,
        dueDate: dia(a.venc),
        amount: reais(a.v / 100),
        description: a.desc,
        createdById: outroAutorId,
      },
      select: { id: true },
    });
    await p.financeApprovalEvent.create({ data: { entryId: e.id, decision: "ENVIADO", actorUserId: outroAutorId } });
  }

  // ── Contas a receber ──────────────────────────────────────────────────────
  for (const l of [
    { c: clienteA, v: 1850000, venc: 5, pago: null, desc: "Frete São Paulo — setembro" },
    { c: clienteB, v: 940000, venc: 12, pago: null, desc: "Frete Curitiba — setembro" },
    { c: clienteA, v: 1720000, venc: -35, pago: -33, desc: "Frete de agosto" },
    { c: clienteB, v: 610000, venc: 0, pago: null, desc: "Frete avulso — vence hoje" },
  ]) {
    await p.financeEntry.create({
      data: {
        tenantId,
        companyId: empresa.id,
        kind: "RECEBER",
        status: l.pago === null ? "CONFERIDO" : "PAGO",
        counterpartyId: l.c.id,
        categoryId: fretes.id,
        costCenterId: centro.id,
        competence: COMPETENCIA,
        dueDate: dia(l.venc),
        paidAt: l.pago === null ? null : dia(l.pago),
        amount: reais(l.v / 100),
        description: l.desc,
        createdById: autorId,
      },
    });
  }

  // ── Cobrança: um vencido em aberto e um acordo em três parcelas ───────────
  await p.financeEntry.create({
    data: {
      tenantId,
      companyId: empresa.id,
      kind: "RECEBER",
      status: "CONFERIDO",
      counterpartyId: inadimplente.id,
      categoryId: fretes.id,
      competence: COMPETENCIA,
      dueDate: dia(-22),
      amount: "4300.00",
      description: "Frete de agosto — em atraso",
      createdById: autorId,
    },
  });

  const original = await p.financeEntry.create({
    data: {
      tenantId,
      companyId: empresa.id,
      kind: "RECEBER",
      status: "CONFERIDO",
      counterpartyId: inadimplente.id,
      categoryId: fretes.id,
      competence: COMPETENCIA,
      dueDate: dia(-48),
      amount: "9000.00",
      description: "Frete de julho — renegociado",
      createdById: autorId,
    },
    select: { id: true },
  });
  const acordo = await p.collectionAgreement.create({
    data: {
      tenantId,
      companyId: empresa.id,
      counterpartyId: inadimplente.id,
      originalAmount: "9000.00",
      agreedAmount: "8100.00",
      installments: 3,
      firstDueDate: dia(10),
      agreedAt: dia(-4),
      notes: "Desconto de 10% para quitação em três parcelas.",
      createdById: autorId,
    },
    select: { id: true },
  });
  await p.financeEntry.update({
    where: { id: original.id },
    data: { status: "CANCELADO", closeReason: "RENEGOCIADO", statusBeforeClose: "CONFERIDO", renegotiatedAgreementId: acordo.id },
  });
  for (const [i, valor] of ["2700.00", "2700.00", "2700.00"].entries()) {
    await p.financeEntry.create({
      data: {
        tenantId,
        companyId: empresa.id,
        kind: "RECEBER",
        status: "CONFERIDO",
        counterpartyId: inadimplente.id,
        categoryId: fretes.id,
        competence: COMPETENCIA,
        dueDate: dia(10 + i * 30),
        amount: valor,
        description: `Parcela ${i + 1}/3 do acordo`,
        agreementId: acordo.id,
        createdById: autorId,
      },
    });
  }

  // ── Extrato bancário, no formato que o Itaú entrega ───────────────────────
  const importacao = await p.bankStatementImport.create({
    data: {
      tenantId,
      bankAccountId: banco.id,
      fileName: `${MARCA} extrato-${chave(-1)}.ofx`,
      periodStart: dia(-3),
      periodEnd: dia(-1),
      ledgerBalance: "48250.00",
      ledgerBalanceAt: dia(-1),
      transactionsRead: 5,
      transactionsNew: 5,
      importedById: autorId,
    },
    select: { id: true },
  });
  const transacoes = [
    { v: -2345.5, d: -5, memo: "PAGAMENTOS A FORNECEDORES POSTO CENTRAL 21.212.936/0001-56" },
    { v: -1290.0, d: -1, memo: "PAGAMENTOS A FORNECEDORES OFICINA DO PAULO 37.842.038/0001-11" },
    { v: -8500.0, d: -12, memo: "PAGAMENTOS A FORNECEDORES IMOBILIARIA CENTRO 44.555.666/0001-77" },
    { v: -3.46, d: -1, memo: "TAR/CUSTAS COBRANCA" },
    { v: 17200.0, d: -33, memo: "PIX RECEBIDO INDUSTRIA ALFA 50.716.983/0001-35" },
  ];
  for (const [i, t] of transacoes.entries()) {
    await p.bankTransaction.create({
      data: {
        tenantId,
        bankAccountId: banco.id,
        importId: importacao.id,
        fitId: `DEMO${chave(t.d).replace(/-/g, "")}${String(i + 1).padStart(3, "0")}`,
        postedAt: dia(t.d),
        amount: reais(t.v),
        memo: t.memo,
      },
    });
  }

  // ── Pendências, uma de cada estado ────────────────────────────────────────
  for (const r of [
    { titulo: "Enviar o extrato bancário de setembro", tipo: "DOCUMENTO", prazo: 4, status: "ABERTA" },
    { titulo: "Confirmar o pagamento do aluguel", tipo: "CONFIRMACAO", prazo: -6, status: "ABERTA" },
    { titulo: "Nota fiscal do frete de São Paulo", tipo: "DOCUMENTO", prazo: 1, status: "RESPONDIDA" },
    { titulo: "Endereço de cobrança atualizado", tipo: "INFORMACAO", prazo: -15, status: "RESOLVIDA" },
  ] as const) {
    await p.clientRequest.create({
      data: {
        tenantId,
        companyId: empresa.id,
        kind: r.tipo,
        title: `${MARCA} ${r.titulo}`,
        description: "Pendência de demonstração, criada para encher a tela.",
        dueDate: dia(r.prazo),
        status: r.status,
        createdById: autorId,
        resolvedAt: r.status === "RESOLVIDA" ? dia(-10) : null,
        resolvedById: r.status === "RESOLVIDA" ? autorId : null,
      },
    });
  }

  // ── Conversa com o cliente ────────────────────────────────────────────────
  await p.companyMessage.create({
    data: { tenantId, companyId: empresa.id, authorUserId: autorId, body: "Bom dia! Já recebemos as notas de setembro. Falta só o extrato do Itaú." },
  });
  await p.companyMessage.create({
    data: { tenantId, companyId: empresa.id, authorPortalUserId: clienteDoPortal.id, body: "Bom dia! Vou pedir ao financeiro e mando ainda hoje." },
  });

  // ── Orçamento aprovado do ano ─────────────────────────────────────────────
  const orcamento = await p.budget.create({
    data: {
      tenantId,
      companyId: empresa.id,
      year: Number(COMPETENCIA.slice(0, 4)),
      name: `${MARCA} Orçamento`,
      status: "APROVADO",
      approvedAt: dia(-90),
      approvedById: autorId,
      createdById: autorId,
    },
    select: { id: true },
  });
  const porGrupo: Record<string, number> = { receita_bruta: 300000, cmv: 60000, administrativas: 9000, pessoal: 80000 };
  for (const [groupCode, valor] of Object.entries(porGrupo)) {
    for (let mes = 1; mes <= 12; mes++) {
      await p.budgetLine.create({ data: { budgetId: orcamento.id, groupCode, month: mes, amount: reais(valor) } });
    }
  }

  return { empresa, grupo, clienteDoPortal, banco, acordo };
}

// ─── Execução ───────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const p = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const tenant = await p.tenant.findFirst({ where: { slug: SLUG_DO_TENANT }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`tenant ${SLUG_DO_TENANT} não encontrado`);
  console.log(`tenant: ${tenant.name}`);

  if (limpar) {
    const feito = await limparDemo(p, tenant.id);
    console.log(feito.length === 0 ? "nada de demonstração para apagar." : `apagado: ${feito.join(", ")}.`);
    await p.$disconnect();
    return;
  }

  const existente = await p.company.count({ where: { tenantId: tenant.id, name: { startsWith: MARCA } } });
  if (existente > 0) {
    console.log(`já existe empresa de demonstração. Rode com --limpar antes de recriar.`);
    await p.$disconnect();
    return;
  }

  if (!aplicar) {
    console.log("\n--- simulação: nada foi escrito. O que seria criado no tenant de produção: ---\n");
    console.log("  1 grupo de cliente e 1 empresa, ambos com o prefixo [demo]");
    console.log("  1 usuário do portal, com senha aleatória que ninguém conhece");
    console.log("  3 categorias no plano de contas (aparecem para todas as empresas — ver o cabeçalho)");
    console.log("  1 centro de custo, 6 contrapartes (nenhuma com e-mail), 1 conta bancária");
    console.log("  12 contas a pagar (vencidas, vence hoje, a vencer, pagas, 1 cancelada, 2 aguardando aprovação)");
    console.log("  1 alçada de R$ 3.000,00 para o cliente do portal");
    console.log("  7 contas a receber, entre elas 1 vencida em cobrança e 3 parcelas de acordo");
    console.log("  1 acordo de R$ 9.000,00 renegociado em 3 × R$ 2.700,00");
    console.log("  1 importação de extrato com 5 transações, memos no formato do Itaú");
    console.log("  4 pendências (aberta no prazo, vencida, respondida, resolvida)");
    console.log("  2 mensagens na conversa com o cliente");
    console.log("  1 orçamento aprovado do ano, com as 12 competências");
    console.log("\nRode com --aplicar para escrever, e com --limpar para desfazer.\n");
    await p.$disconnect();
    return;
  }

  // Autor de tudo: quem tiver permissão de escrita no tenant. O campo é só
  // rastro — a tela mostra "lançada por".
  const autor = await p.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, name: true },
  });
  if (!autor) throw new Error("nenhum usuário administrador no tenant para figurar como autor");

  // Um segundo administrador para figurar como quem lançou o que está em
  // aprovação. Sem ele, cai no mesmo — e aí quem testar precisa de outra conta.
  const outro = await p.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ["SUPER_ADMIN", "ADMIN"] }, NOT: { id: autor.id } },
    select: { id: true, name: true },
  });
  if (!outro) console.log("aviso: só há um administrador — as contas em aprovação vão figurar lançadas por ele, e a tela vai esconder os botões de decidir (quem lança não aprova).");

  const r = await criar(p, tenant.id, autor.id, outro?.id ?? autor.id);
  console.log(`\nempresa criada: ${r.empresa.name}`);
  console.log(`autor dos lançamentos: ${autor.name}`);
  console.log(`cliente do portal: ${r.clienteDoPortal.email} — senha aleatória; defina em /admin/portal para entrar`);
  console.log(`\nabra /pagar, /receber, /lancamentos, /conciliacao, /aprovacoes, /pendencias, /cobranca, /dre e /comunicacao`);
  console.log(`filtre por "${r.empresa.name}" para ver só a demonstração.`);
  console.log(`\npara desfazer: npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar`);
  await p.$disconnect();
}

main();
