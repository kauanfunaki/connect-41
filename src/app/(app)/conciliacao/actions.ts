"use server";

// Conciliação bancária: contas, importação de OFX, confirmar e desfazer
// casamento, lançamento a partir da transação, ignorar e reabrir.
//
// Toda escrita que mexe em mais de uma linha roda numa transação e **revalida
// no servidor** o que a tela já validou: a tela pode estar velha (outra pessoa
// conciliou o mesmo lançamento há um minuto), e a action é alcançável por POST
// direto, sem tela nenhuma.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { decimalDeCentavos, digitosDoDocumento, validarCamposDoLancamento } from "@/lib/financeiro/manual";
import { instanteDaData, competenciaDoInstante } from "@/lib/financeiro/periodo";
import { lerOfx } from "@/lib/financeiro/conciliacao/ofx";
import { contaConfere, codigoDoBanco, validarConta } from "@/lib/financeiro/conciliacao/conta";
import { tipoCompativel, validarSelecao } from "@/lib/financeiro/conciliacao/casamento";
import { motivoDoBloqueioDeBaixa } from "@/lib/financeiro/aprovacao/regras";
import { sincronizarAcordos } from "@/lib/financeiro/cobranca/sincronizar";
import { centroNaCriacao } from "@/lib/financeiro/centroDeCustoServidor";

const MODULE = "bpo_conciliacao";

/** Teto do arquivo OFX. Um ano de extrato movimentado fica abaixo de 1 MB; o corpo da action aceita 10 MB. */
const MAXIMO_OFX_BYTES = 5 * 1024 * 1024;

export type Resultado = { error: string } | { ok: true };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão para conciliar." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, userId: ctx.userId || null, prisma: getPrisma() };
}

function revalidar() {
  for (const p of ["/conciliacao", "/pagar", "/receber", "/lancamentos", "/fluxo-de-caixa", "/dre", "/dre/economica", "/dre/analises"]) {
    revalidatePath(p);
  }
  revalidatePath("/cobranca", "layout");
}

function texto(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

// ─── Contas bancárias ───────────────────────────────────────────────────────

/**
 * Cria ou edita uma conta bancária.
 *
 * Banco e número não mudam depois que a conta tem transação: são eles que
 * conferem o extrato, e trocar por baixo faria o histórico importado passar a
 * pertencer a outra conta.
 */
export async function salvarContaBancaria(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const id = texto(formData, "id");
  const companyId = texto(formData, "companyId");
  const v = validarConta({
    nickname: texto(formData, "nickname"),
    bankCode: texto(formData, "bankCode"),
    agency: texto(formData, "agency"),
    accountNumber: texto(formData, "accountNumber"),
    type: texto(formData, "type"),
    openingBalance: texto(formData, "openingBalance"),
    openingBalanceDate: texto(formData, "openingBalanceDate"),
  });
  if (!v.ok) return { error: v.erro };
  const d = v.dados;

  const dados = {
    nickname: d.nickname,
    bankCode: d.bankCode,
    agency: d.agency,
    accountNumber: d.accountNumber,
    accountDigits: d.accountDigits,
    type: d.type,
    openingBalance: d.saldoInicialCentavos === null ? null : decimalDeCentavos(d.saldoInicialCentavos),
    openingBalanceDate: d.saldoInicialKey ? instanteDaData(d.saldoInicialKey) : null,
  };

  try {
    if (id) {
      const atual = await c.prisma.bankAccount.findFirst({
        where: { id, tenantId: c.tenantId },
        select: { id: true, companyId: true, bankCode: true, accountDigits: true, _count: { select: { transactions: true } } },
      });
      if (!atual) return { error: "Conta bancária não encontrada." };
      const trocouIdentidade = atual.bankCode !== d.bankCode || atual.accountDigits !== d.accountDigits;
      if (trocouIdentidade && atual._count.transactions > 0) {
        return { error: "Esta conta já tem extrato importado — banco e número não podem mudar. Cadastre outra conta." };
      }
      await c.prisma.bankAccount.update({ where: { id: atual.id }, data: dados });
      await logAudit({
        tenantId: c.tenantId,
        userId: c.ctx.userId,
        action: "financeiro.bank_account.updated",
        entityType: "BankAccount",
        entityId: atual.id,
        metadata: { companyId: atual.companyId, bankCode: d.bankCode, conta: d.accountNumber, saldoInicial: dados.openingBalance },
      });
    } else {
      const empresa = await c.prisma.company.findFirst({ where: { id: companyId, tenantId: c.tenantId }, select: { id: true } });
      if (!empresa) return { error: "Empresa não encontrada." };
      const criada = await c.prisma.bankAccount.create({
        data: { tenantId: c.tenantId, companyId: empresa.id, ...dados },
        select: { id: true },
      });
      await logAudit({
        tenantId: c.tenantId,
        userId: c.ctx.userId,
        action: "financeiro.bank_account.created",
        entityType: "BankAccount",
        entityId: criada.id,
        metadata: { companyId: empresa.id, bankCode: d.bankCode, conta: d.accountNumber, saldoInicial: dados.openingBalance },
      });
    }
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Esta empresa já tem uma conta com este banco e número." };
    throw err;
  }

  revalidar();
  return { ok: true };
}

/** Inativa ou reativa. Nunca apaga: a conta carrega o histórico de extratos. */
export async function alterarContaAtiva(bankAccountId: string, ativa: boolean): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const conta = await c.prisma.bankAccount.findFirst({ where: { id: bankAccountId, tenantId: c.tenantId }, select: { id: true } });
  if (!conta) return { error: "Conta bancária não encontrada." };
  await c.prisma.bankAccount.update({ where: { id: conta.id }, data: { active: ativa } });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: ativa ? "financeiro.bank_account.reactivated" : "financeiro.bank_account.deactivated",
    entityType: "BankAccount",
    entityId: conta.id,
  });
  revalidar();
  return { ok: true };
}

// ─── Importação do OFX ──────────────────────────────────────────────────────

export type ResumoDaImportacao = {
  lidas: number;
  novas: number;
  repetidas: number;
  zeradas: number;
  inicioKey: string | null;
  fimKey: string | null;
  saldoDoBancoCentavos: number | null;
  saldoDoBancoKey: string | null;
  semFitId: number;
  avisos: string[];
};

export type ResultadoDaImportacao = { error: string } | { ok: true; resumo: ResumoDaImportacao };

/**
 * Importa um OFX para a conta.
 *
 * Idempotente: transação já importada (mesmo FITID na mesma conta) é contada
 * como repetida e pulada, então reimportar o mesmo arquivo — ou um período que
 * se sobrepõe — não duplica nada. A importação fica registrada mesmo sem
 * transação nova, porque o saldo do banco que ela trouxe continua valendo.
 */
export async function importarOfx(formData: FormData): Promise<ResultadoDaImportacao> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const bankAccountId = texto(formData, "bankAccountId");
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha o arquivo OFX." };
  if (arquivo.size > MAXIMO_OFX_BYTES) return { error: "Arquivo maior que 5 MB." };

  const conta = await c.prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: c.tenantId },
    select: { id: true, companyId: true, active: true, bankCode: true, agency: true, accountNumber: true },
  });
  if (!conta) return { error: "Conta bancária não encontrada." };
  if (!conta.active) return { error: "Conta inativa. Reative antes de importar." };

  const leitura = lerOfx(new Uint8Array(await arquivo.arrayBuffer()));
  if (!leitura.ok) return { error: leitura.erro };
  const ex = leitura.extrato;

  if (!contaConfere(ex.contaId, conta)) {
    return {
      error: `O extrato é da conta ${ex.contaId}${ex.agencia ? ` (agência ${ex.agencia})` : ""}, e não da ${conta.accountNumber}. Confira se escolheu a conta certa.`,
    };
  }

  const avisos: string[] = [];
  const bancoDoArquivo = codigoDoBanco(ex.bancoId);
  if (bancoDoArquivo && bancoDoArquivo !== conta.bankCode) {
    // Aviso e não recusa: há banco que exporta o BANKID de outro jeito (o do
    // correspondente, o ISPB). O número da conta, que já bateu, é o que decide.
    avisos.push(`O arquivo informa o banco ${bancoDoArquivo}, e a conta está cadastrada no ${conta.bankCode}.`);
  }
  const semFitId = ex.transacoes.filter((t) => t.fitIdGerado).length;
  if (semFitId > 0) {
    avisos.push(
      `${semFitId} ${semFitId === 1 ? "transação veio" : "transações vieram"} sem identificador do banco (FITID). A reimportação é reconhecida pela data, valor e descrição.`
    );
  }

  const fitIds = ex.transacoes.map((t) => t.fitId);
  let novas = 0;
  let importId: string;
  try {
    importId = await c.prisma.$transaction(
      async (tx) => {
        const existentes = new Set(
          fitIds.length
            ? (
                await tx.bankTransaction.findMany({
                  where: { bankAccountId: conta.id, fitId: { in: fitIds } },
                  select: { fitId: true },
                })
              ).map((t) => t.fitId)
            : []
        );
        const aGravar = ex.transacoes.filter((t) => !existentes.has(t.fitId));
        novas = aGravar.length;

        const imp = await tx.bankStatementImport.create({
          data: {
            tenantId: c.tenantId,
            bankAccountId: conta.id,
            fileName: (arquivo.name || "extrato.ofx").slice(0, 255),
            periodStart: ex.inicioKey ? instanteDaData(ex.inicioKey) : null,
            periodEnd: ex.fimKey ? instanteDaData(ex.fimKey) : null,
            ledgerBalance: ex.saldo ? decimalDeCentavos(ex.saldo.centavos) : null,
            ledgerBalanceAt: ex.saldo?.dataKey ? instanteDaData(ex.saldo.dataKey) : null,
            transactionsRead: ex.transacoes.length,
            transactionsNew: aGravar.length,
            importedById: c.userId,
          },
          select: { id: true },
        });

        if (aGravar.length > 0) {
          await tx.bankTransaction.createMany({
            data: aGravar.map((t) => ({
              tenantId: c.tenantId,
              bankAccountId: conta.id,
              importId: imp.id,
              fitId: t.fitId,
              postedAt: instanteDaData(t.dataKey),
              amount: decimalDeCentavos(t.centavos),
              memo: t.memo,
              payeeName: t.nome,
            })),
          });
        }
        return imp.id;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (err) {
    // Duas importações do mesmo arquivo ao mesmo tempo: a segunda esbarra no
    // unique (conta, FITID). Repetir resolve, porque aí ela vê o que a primeira gravou.
    if (isPrismaUniqueError(err)) return { error: "Outra importação desta conta estava em andamento. Tente de novo." };
    throw err;
  }

  const resumo: ResumoDaImportacao = {
    lidas: ex.transacoes.length,
    novas,
    repetidas: ex.transacoes.length - novas,
    zeradas: ex.zeradas,
    inicioKey: ex.inicioKey,
    fimKey: ex.fimKey,
    saldoDoBancoCentavos: ex.saldo?.centavos ?? null,
    saldoDoBancoKey: ex.saldo?.dataKey ?? null,
    semFitId,
    avisos,
  };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.bank_statement.imported",
    entityType: "BankStatementImport",
    entityId: importId,
    metadata: {
      bankAccountId: conta.id,
      companyId: conta.companyId,
      arquivo: arquivo.name,
      lidas: resumo.lidas,
      novas: resumo.novas,
      repetidas: resumo.repetidas,
      charset: ex.charset,
    },
  });

  revalidar();
  return { ok: true, resumo };
}

// ─── Casamento ──────────────────────────────────────────────────────────────

/** Carrega a transação do tenant com a empresa da conta. */
async function transacaoDoTenant(prisma: Prisma.TransactionClient, transactionId: string, tenantId: string) {
  return prisma.bankTransaction.findFirst({
    where: { id: transactionId, tenantId },
    select: {
      id: true,
      status: true,
      amount: true,
      postedAt: true,
      bankAccountId: true,
      bankAccount: { select: { companyId: true } },
    },
  });
}

/**
 * Confirma que a transação liquida estes lançamentos.
 *
 * Cada lançamento vira `PAGO` com a data do extrato (meio-dia de São Paulo, a
 * convenção da baixa), e o estado anterior fica no vínculo para o desfazer
 * devolver exatamente o que havia. Se um lançamento já estava pago à mão com
 * outra data, a do extrato prevalece — é a data em que o dinheiro de fato saiu.
 */
export async function confirmarConciliacao(transactionId: string, entryIds: string[]): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!Array.isArray(entryIds) || entryIds.length === 0) return { error: "Escolha ao menos um lançamento." };
  if (entryIds.length > 200) return { error: "Lançamentos demais numa só transação." };

  try {
    const resumo = await c.prisma.$transaction(async (tx) => {
      const t = await transacaoDoTenant(tx, transactionId, c.tenantId);
      if (!t) throw new Recusa("Transação não encontrada.");
      if (t.status !== "PENDENTE") throw new Recusa("Esta transação não está mais pendente — atualize a tela.");

      const lancamentos = await tx.financeEntry.findMany({
        where: { id: { in: entryIds }, tenantId: c.tenantId, companyId: t.bankAccount.companyId },
        select: {
          id: true,
          kind: true,
          status: true,
          amount: true,
          paidAt: true,
          approvalStatus: true,
          counterparty: { select: { name: true } },
          bankMatch: { select: { id: true } },
        },
      });
      if (lancamentos.length !== new Set(entryIds).size) {
        throw new Recusa("Algum lançamento escolhido não existe nesta empresa.");
      }

      const centavosDaTransacao = centavosDeDecimal(t.amount);
      const v = validarSelecao(
        { centavos: centavosDaTransacao },
        lancamentos.map((l) => ({
          id: l.id,
          kind: l.kind,
          status: l.status,
          centavos: centavosDeDecimal(l.amount),
          conciliado: l.bankMatch !== null,
          contraparteNome: l.counterparty.name,
          // Conta aguardando ou reprovada na aprovação por alçada não é baixada
          // nem pelo extrato — senão a conciliação viraria o atalho da aprovação.
          bloqueioDeBaixa: motivoDoBloqueioDeBaixa(l),
        }))
      );
      if (!v.ok) throw new Recusa(v.erro);

      const agora = new Date();
      const pagoEm = instanteDaData(saoPauloParts(t.postedAt).dateKey);
      for (const l of lancamentos) {
        await tx.bankTransactionMatch.create({
          data: {
            transactionId: t.id,
            financeEntryId: l.id,
            amount: l.amount,
            entryStatusBefore: l.status,
            entryPaidAtBefore: l.paidAt,
            createdById: c.userId,
          },
        });
        // Condicional na aprovação lida: reenvio para aprovação no meio do
        // caminho derruba a transação inteira em vez de baixar por cima.
        const baixado = await tx.financeEntry.updateMany({
          where: { id: l.id, approvalStatus: { in: ["NAO_REQUER", "APROVADO"] }, status: { not: "CANCELADO" } },
          data: { status: "PAGO", paidAt: pagoEm },
        });
        if (baixado.count !== 1) throw new Recusa(`${l.counterparty.name}: o lançamento acabou de mudar — atualize a tela.`);
      }
      // Parcela de acordo conciliada é baixa como outra qualquer: pode cumprir o acordo.
      await sincronizarAcordos(tx, c.tenantId, lancamentos.map((l) => l.id));

      // Condicional no status: se outra conciliação ganhou a corrida, nada muda
      // aqui e a transação inteira volta.
      const marcada = await tx.bankTransaction.updateMany({
        where: { id: t.id, status: "PENDENTE" },
        data: { status: "CONCILIADA", reconciledAt: agora, reconciledById: c.userId },
      });
      if (marcada.count !== 1) throw new Recusa("Esta transação acabou de ser alterada por outra pessoa — atualize a tela.");

      return { companyId: t.bankAccount.companyId, valor: decimalDeCentavos(centavosDaTransacao), lancamentos: lancamentos.map((l) => l.id) };
    });

    await logAudit({
      tenantId: c.tenantId,
      userId: c.ctx.userId,
      action: "financeiro.bank_transaction.reconciled",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: resumo,
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    if (isPrismaUniqueError(err)) return { error: "Um dos lançamentos acabou de ser conciliado com outra transação — atualize a tela." };
    throw err;
  }

  revalidar();
  return { ok: true };
}

/**
 * Desfaz a conciliação.
 *
 * Devolve cada lançamento ao status e à data de baixa que tinha antes — **se**
 * ele continua como a conciliação o deixou (pago na data do extrato). Se alguém
 * mexeu depois (desfez a baixa em `/pagar`, cancelou), o estado atual é mais
 * novo que o guardado e fica como está: restaurar por cima apagaria a decisão
 * de outra pessoa. O vínculo sai nos dois casos.
 */
export async function desfazerConciliacao(transactionId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  try {
    const resumo = await c.prisma.$transaction(async (tx) => {
      const t = await tx.bankTransaction.findFirst({
        where: { id: transactionId, tenantId: c.tenantId },
        select: {
          id: true,
          status: true,
          postedAt: true,
          matches: {
            select: {
              id: true,
              financeEntryId: true,
              entryStatusBefore: true,
              entryPaidAtBefore: true,
              financeEntry: { select: { status: true, paidAt: true } },
            },
          },
        },
      });
      if (!t) throw new Recusa("Transação não encontrada.");
      if (t.status !== "CONCILIADA") throw new Recusa("Esta transação não está conciliada.");

      const pagoEm = instanteDaData(saoPauloParts(t.postedAt).dateKey).getTime();
      const restaurados: string[] = [];
      const mantidos: string[] = [];
      for (const m of t.matches) {
        const intacto = m.financeEntry.status === "PAGO" && m.financeEntry.paidAt?.getTime() === pagoEm;
        if (intacto) {
          await tx.financeEntry.update({
            where: { id: m.financeEntryId },
            data: { status: m.entryStatusBefore, paidAt: m.entryPaidAtBefore },
          });
          restaurados.push(m.financeEntryId);
        } else {
          mantidos.push(m.financeEntryId);
        }
      }
      await tx.bankTransactionMatch.deleteMany({ where: { transactionId: t.id } });
      await sincronizarAcordos(tx, c.tenantId, restaurados);
      const voltou = await tx.bankTransaction.updateMany({
        where: { id: t.id, status: "CONCILIADA" },
        data: { status: "PENDENTE", reconciledAt: null, reconciledById: null },
      });
      if (voltou.count !== 1) throw new Recusa("Esta transação acabou de ser alterada por outra pessoa — atualize a tela.");
      return { restaurados, mantidos };
    });

    await logAudit({
      tenantId: c.tenantId,
      userId: c.ctx.userId,
      action: "financeiro.bank_transaction.unreconciled",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: resumo,
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  revalidar();
  return { ok: true };
}

/**
 * Cria o lançamento que falta e já o concilia com a transação.
 *
 * Para o que só aparece no extrato: tarifa, IOF, juro, o PIX recebido de um
 * cliente sem título lançado. As regras são as do lançamento manual
 * (`validarCamposDoLancamento`): categoria obrigatória em conta a pagar,
 * competência válida. Tipo, valor, vencimento e data da baixa vêm da transação
 * e não da tela — são o fato que está sendo registrado.
 *
 * O vínculo guarda como estado anterior `CONFERIDO` sem baixa: é como o
 * lançamento manual nasce quando não está pago. Desfazer a conciliação deixa o
 * lançamento em aberto (e candidato a casar de novo), em vez de apagá-lo.
 */
export async function criarLancamentoDaTransacao(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const transactionId = texto(formData, "transactionId");
  const t = await transacaoDoTenant(c.prisma, transactionId, c.tenantId);
  if (!t) return { error: "Transação não encontrada." };
  if (t.status !== "PENDENTE") return { error: "Esta transação não está mais pendente — atualize a tela." };
  const companyId = t.bankAccount.companyId;

  const centavos = centavosDeDecimal(t.amount);
  const kind = tipoCompativel(centavos);
  if (!kind) return { error: "Transação de valor zero não gera lançamento." };
  const dataKey = saoPauloParts(t.postedAt).dateKey;

  const categoryId = texto(formData, "categoryId") || null;
  const v = validarCamposDoLancamento(
    {
      kind,
      competencia: texto(formData, "competencia") || competenciaDoInstante(t.postedAt),
      vencimento: dataKey,
      valor: decimalDeCentavos(Math.abs(centavos)),
      descricao: texto(formData, "descricao"),
      pagoEm: dataKey,
      categoryId,
    },
    saoPauloParts(new Date()).dateKey
  );
  if (!v.ok) return { error: v.erro };
  const d = v.dados;

  if (d.categoryId) {
    const categoria = await c.prisma.financeCategory.findFirst({
      where: { id: d.categoryId, tenantId: c.tenantId, kind: d.kind },
      select: { id: true },
    });
    if (!categoria) return { error: "Categoria não encontrada para este tipo de lançamento." };
  }

  // Contraparte: a mesma resolução do lançamento manual — escolhida da lista,
  // ou nova, reaproveitando a ficha que já tenha o mesmo documento.
  const counterpartyId = texto(formData, "counterpartyId");
  const novoNome = texto(formData, "contraparteNome");
  const novoDocumento = digitosDoDocumento(texto(formData, "contraparteDocumento"));
  if (!counterpartyId && !novoNome) return { error: "Escolha a contraparte ou cadastre uma nova." };
  if (!counterpartyId && novoDocumento && novoDocumento.length !== 11 && novoDocumento.length !== 14) {
    return { error: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
  }
  const existente = counterpartyId
    ? await c.prisma.financeCounterparty.findFirst({
        where: { id: counterpartyId, tenantId: c.tenantId, companyId },
        select: { id: true, defaultCategoryId: true, defaultCostCenterId: true },
      })
    : novoDocumento
      ? await c.prisma.financeCounterparty.findFirst({
          where: { tenantId: c.tenantId, companyId, document: novoDocumento },
          select: { id: true, defaultCategoryId: true, defaultCostCenterId: true },
        })
      : null;
  if (counterpartyId && !existente) return { error: "Contraparte não encontrada nesta empresa." };

  // Mesma herança do lançamento manual: o centro escolhido, senão o padrão da contraparte.
  const centro = await centroNaCriacao({
    tenantId: c.tenantId,
    companyId,
    informadoId: texto(formData, "costCenterId") || null,
    padraoDaContraparteId: existente?.defaultCostCenterId ?? null,
  });
  if (!centro.ok) return { error: centro.erro };

  let entryId: string;
  try {
    entryId = await c.prisma.$transaction(async (tx) => {
      const contraparte =
        existente ??
        (await tx.financeCounterparty.create({
          data: { tenantId: c.tenantId, companyId, name: novoNome.slice(0, 180), document: novoDocumento },
          select: { id: true, defaultCategoryId: true },
        }));

      const pagoEm = instanteDaData(dataKey);
      // Nasce PAGO: é o registro de um dinheiro que já saiu. Não entra em
      // aprovação por alçada (fica no padrão NAO_REQUER).
      const criado = await tx.financeEntry.create({
        data: {
          tenantId: c.tenantId,
          companyId,
          kind: d.kind,
          status: "PAGO",
          counterpartyId: contraparte.id,
          categoryId: d.categoryId,
          costCenterId: centro.centroId,
          competence: d.competencia,
          dueDate: pagoEm,
          paidAt: pagoEm,
          amount: decimalDeCentavos(d.centavos),
          description: d.descricao,
          createdById: c.userId,
          reviewedById: c.userId,
          reviewedAt: new Date(),
        },
        select: { id: true, amount: true },
      });

      if (d.kind === "PAGAR" && d.categoryId && !contraparte.defaultCategoryId) {
        await tx.financeCounterparty.update({ where: { id: contraparte.id }, data: { defaultCategoryId: d.categoryId } });
      }

      await tx.bankTransactionMatch.create({
        data: {
          transactionId: t.id,
          financeEntryId: criado.id,
          amount: criado.amount,
          entryStatusBefore: "CONFERIDO",
          entryPaidAtBefore: null,
          createdById: c.userId,
        },
      });
      const marcada = await tx.bankTransaction.updateMany({
        where: { id: t.id, status: "PENDENTE" },
        data: { status: "CONCILIADA", reconciledAt: new Date(), reconciledById: c.userId },
      });
      if (marcada.count !== 1) throw new Recusa("Esta transação acabou de ser alterada por outra pessoa — atualize a tela.");
      return criado.id;
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.entry.created_from_bank_transaction",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: {
      companyId,
      transactionId: t.id,
      kind: d.kind,
      valor: decimalDeCentavos(d.centavos),
      competencia: d.competencia,
      centroDeCusto: centro.centroId,
    },
  });

  revalidar();
  return { ok: true };
}

// ─── Ignorar e reabrir ──────────────────────────────────────────────────────

/** Ignora uma pendente. Motivo obrigatório: "ignorada" sem motivo é só pendência escondida. */
export async function ignorarTransacao(transactionId: string, motivo: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const razao = (motivo ?? "").trim();
  if (razao.length < 3) return { error: "Diga por que esta transação não é um lançamento." };
  if (razao.length > 255) return { error: "Motivo com mais de 255 caracteres." };

  const r = await c.prisma.bankTransaction.updateMany({
    where: { id: transactionId, tenantId: c.tenantId, status: "PENDENTE" },
    data: { status: "IGNORADA", ignoredReason: razao, reconciledAt: new Date(), reconciledById: c.userId },
  });
  if (r.count !== 1) return { error: "Transação não encontrada ou já não está pendente." };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.bank_transaction.ignored",
    entityType: "BankTransaction",
    entityId: transactionId,
    metadata: { motivo: razao },
  });
  revalidar();
  return { ok: true };
}

export async function reabrirTransacao(transactionId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const r = await c.prisma.bankTransaction.updateMany({
    where: { id: transactionId, tenantId: c.tenantId, status: "IGNORADA" },
    data: { status: "PENDENTE", ignoredReason: null, reconciledAt: null, reconciledById: null },
  });
  if (r.count !== 1) return { error: "Transação não encontrada ou não está ignorada." };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.bank_transaction.reopened",
    entityType: "BankTransaction",
    entityId: transactionId,
  });
  revalidar();
  return { ok: true };
}

// ─── Leitura para a escolha manual ──────────────────────────────────────────

export type LancamentoParaEscolha = {
  id: string;
  contraparteNome: string;
  descricao: string | null;
  centavos: number;
  vencimentoKey: string;
  pagoEmKey: string | null;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  competencia: string;
};

export type ResultadoDaEscolha = { error: string } | { ok: true; lancamentos: LancamentoParaEscolha[]; limitado: boolean };

const LIMITE_DA_ESCOLHA = 200;

/**
 * Os lançamentos que a pessoa pode escolher para uma transação: da empresa da
 * conta, do tipo compatível, não cancelados e sem vínculo — de **qualquer
 * valor**, porque a escolha manual é justamente para quando a soma de vários
 * fecha o valor.
 *
 * Carregada sob demanda (e não junto da tela) porque a empresa pode ter
 * milhares de lançamentos em aberto e a maioria das transações nunca abre esta
 * lista. Sem busca, restringe a vencimentos de 120 dias antes a 60 depois do
 * extrato; com busca, procura pelo nome em qualquer data.
 */
export async function lancamentosParaEscolha(transactionId: string, busca: string): Promise<ResultadoDaEscolha> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const t = await transacaoDoTenant(c.prisma, transactionId, c.tenantId);
  if (!t) return { error: "Transação não encontrada." };
  const kind = tipoCompativel(centavosDeDecimal(t.amount));
  if (!kind) return { ok: true, lancamentos: [], limitado: false };

  const termo = (busca ?? "").trim().slice(0, 80);
  const dia = 86_400_000;
  const linhas = await c.prisma.financeEntry.findMany({
    where: {
      tenantId: c.tenantId,
      companyId: t.bankAccount.companyId,
      kind,
      status: { not: "CANCELADO" },
      bankMatch: { is: null },
      ...(termo
        ? {
            OR: [
              { counterparty: { name: { contains: termo } } },
              { description: { contains: termo } },
            ],
          }
        : { dueDate: { gte: new Date(t.postedAt.getTime() - 120 * dia), lte: new Date(t.postedAt.getTime() + 60 * dia) } }),
    },
    select: {
      id: true,
      status: true,
      amount: true,
      dueDate: true,
      paidAt: true,
      competence: true,
      description: true,
      counterparty: { select: { name: true } },
    },
    orderBy: { dueDate: "desc" },
    take: LIMITE_DA_ESCOLHA + 1,
  });

  const alvo = saoPauloParts(t.postedAt).dateKey;
  const lancamentos = linhas.slice(0, LIMITE_DA_ESCOLHA).map((l) => ({
    id: l.id,
    contraparteNome: l.counterparty.name,
    descricao: l.description,
    centavos: centavosDeDecimal(l.amount),
    vencimentoKey: saoPauloParts(l.dueDate).dateKey,
    pagoEmKey: l.paidAt ? saoPauloParts(l.paidAt).dateKey : null,
    status: l.status,
    competencia: l.competence,
  }));
  // Mais perto da data do extrato primeiro — é onde o que se procura costuma estar.
  const distancia = (k: string) => Math.abs(Date.parse(k) - Date.parse(alvo));
  lancamentos.sort((a, b) => distancia(a.pagoEmKey ?? a.vencimentoKey) - distancia(b.pagoEmKey ?? b.vencimentoKey));

  return { ok: true, lancamentos, limitado: linhas.length > LIMITE_DA_ESCOLHA };
}
