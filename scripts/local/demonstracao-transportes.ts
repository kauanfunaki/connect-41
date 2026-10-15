// A demonstração antiga do BPO — a "[demo] TRANSPORTES MODELO LTDA" com o
// cliente do portal `cliente.demo@exemplo.invalido` —, só para o banco LOCAL.
//
// Até 15/10/2026 ela era o `scripts/dados-de-demonstracao.ts`. Naquele dia a
// demonstração da produção virou a Padaria Pão de Ouro (src/lib/demonstracao/bpo/),
// mas o Connect local e os vídeos da ajuda foram montados sobre esta: o preparo
// (`preparar-ambiente.ts`) procura o cliente `cliente.demo@`, cria a filial da
// Transportes, e os roteiros (`scripts/videos/`) escolhem a "Transportes Modelo"
// e a conta "Itaú movimento" pelo nome. Trocar aqui seria regravar os vídeos.
//
// Roda pelo `recriar-banco.mjs`, num banco recém-criado — por isso não confere
// se já existe nem tem limpeza. Recusa banco que não seja local.
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/demonstracao-transportes.ts

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { randomBytes } from "node:crypto";
import { camposDoRegime } from "../../src/lib/taxRegime";

const MARCA = "[demo]";
const SLUG_DO_TENANT = "41tech";
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
      ...camposDoRegime("SIMPLES_NACIONAL"),
      // Explícito: o default do schema é PROSPECT, e `empresasDoSeletor` só
      // lista ACTIVE. Sem isto a empresa aparece nas listas de contas (que
      // filtram por tenant) e **não** no seletor da conciliação e da DRE — que
      // é exatamente como ela nasceu na primeira rodada.
      status: "ACTIVE",
    },
    select: { id: true, name: true },
  });

  // Senha que ninguém conhece: entrar no portal como este cliente exige que
  // alguém defina uma nova pela tela de administração. Ligado direto à
  // empresa, sem cliente (portal por empresa, 14/10/2026).
  const clienteDoPortal = await p.portalUser.create({
    data: {
      tenantId,
      name: `${MARCA} Cliente Modelo`,
      email: "cliente.demo@exemplo.invalido",
      passwordHash: randomBytes(32).toString("hex"),
      empresas: { create: [{ tenantId, companyId: empresa.id, incluiFiliais: true }] },
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
  const host = new URL(url.replace(/^mysql:/, "http:")).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Recusado: esta demonstração é só do banco local (a DATABASE_URL não é de 127.0.0.1/localhost).");
  const p = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const tenant = await p.tenant.findFirst({ where: { slug: SLUG_DO_TENANT }, select: { id: true } });
  if (!tenant) throw new Error(`tenant ${SLUG_DO_TENANT} não encontrado`);
  const admins = await p.user.findMany({ where: { tenantId: tenant.id, role: { in: ["SUPER_ADMIN", "ADMIN"] } }, select: { id: true } });
  if (admins.length === 0) throw new Error("nenhum usuário administrador no tenant para figurar como autor");

  const r = await criar(p, tenant.id, admins[0]!.id, (admins[1] ?? admins[0])!.id);
  console.log(`empresa criada: ${r.empresa.name}; cliente do portal: ${r.clienteDoPortal.email}`);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
