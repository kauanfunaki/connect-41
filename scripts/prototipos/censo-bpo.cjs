// Levantamento do que existe no protótipo do 41 BPO, antes de decidir o que
// migrar para o Connect (contas a pagar e a receber, extrato e conciliação,
// pendências, anexos, mensagens, documentos fiscais).
//
// **Só lê.** Nenhuma escrita. Roda DENTRO do container do protótipo, pelo
// Console do EasyPanel — mesmo caminho de `censo-societario.cjs`. O BPO e o DRE
// dividem o mesmo `bpo.db`; o que o DRE tem a mais (plano gerencial, histórico
// de importação) é contado se o Prisma Client do container conhecer.
//
// A saída é um JSON só. Traz, por empresa, quantidade, soma e o intervalo de
// datas — é o que separa dado de exemplo (tudo criado no mesmo dia, datas
// redondas) de trabalho real. **Nunca** traz chave do Omie, senha, nome de
// usuário, texto de mensagem nem conteúdo de anexo.

"use strict";

const { createRequire } = require("module");

function prismaDoPrototipo() {
  const req = createRequire(process.cwd() + "/");
  const { PrismaClient } = req("@prisma/client");
  return new PrismaClient();
}

const digitos = (s) => (s || "").replace(/\D/g, "");
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const reais = (n) => Math.round(n * 100) / 100;

function contarPor(lista, chave) {
  const r = {};
  for (const x of lista) {
    const k = String(chave(x) ?? "(vazio)");
    r[k] = (r[k] || 0) + 1;
  }
  return r;
}

/** Quantos, soma, datas de criação e se foram criados num dia só. */
function resumo(lista, valor) {
  if (lista.length === 0) return { n: 0 };
  const criados = lista.map((x) => dia(x.createdAt)).filter(Boolean).sort();
  return {
    n: lista.length,
    soma: valor ? reais(lista.reduce((s, x) => s + (valor(x) || 0), 0)) : undefined,
    criadoDe: criados[0] || null,
    criadoAte: criados[criados.length - 1] || null,
    diasDistintosDeCriacao: new Set(criados).size,
    porCriacao: contarPor(lista, (x) => dia(x.createdAt)),
  };
}

async function contar(prisma, modelo) {
  if (!prisma[modelo]) return "ausente no client";
  try {
    return await prisma[modelo].count();
  } catch (e) {
    return "erro: " + e.message.slice(0, 80);
  }
}

async function main() {
  const prisma = prismaDoPrototipo();
  try {
    const contagens = {};
    for (const m of [
      "user", "client", "company", "vendor", "customer", "costCenter", "category", "bankAccount",
      "payable", "receivable", "collectionContact", "paymentAgreement", "bankTransaction",
      "financeComment", "approvalLimit", "pendencia", "attachment", "companyMessage", "office",
      "omieConnection", "omieCategoryMapping", "fiscalDocument",
      // do DRE, no mesmo banco
      "managerialAccount", "accountMapping", "budget", "budgetLine", "importJob", "importRow", "alert",
    ]) {
      contagens[m] = await contar(prisma, m);
    }

    // Rodado no container errado (o do Societário, por exemplo), o Prisma Client
    // não conhece as tabelas do financeiro. Diz isso, em vez de quebrar.
    if (!prisma.payable || !prisma.receivable) {
      console.log(JSON.stringify({ erro: "Este container não é o do BPO: o banco dele não tem contas a pagar/receber. Rode no container do 41 BPO (ou do 41 DRE, que usa o mesmo banco).", contagens }));
      return;
    }

    const empresas = await prisma.company.findMany({ select: { id: true, corporateName: true, cnpj: true } });
    const porId = new Map(empresas.map((e) => [e.id, e]));

    const [pagar, receber, pendencias, anexos, mensagens, contas, fiscais] = await Promise.all([
      prisma.payable.findMany({ select: { companyId: true, amount: true, status: true, paidAt: true, dueDate: true, createdAt: true } }),
      prisma.receivable.findMany({ select: { companyId: true, amount: true, status: true, receivedAt: true, dueDate: true, createdAt: true } }),
      prisma.pendencia.findMany({ select: { companyId: true, status: true, createdAt: true } }),
      prisma.attachment.findMany({ select: { companyId: true, size: true, createdAt: true } }),
      prisma.companyMessage.findMany({ select: { companyId: true, createdAt: true } }),
      prisma.bankAccount.findMany({ select: { id: true, companyId: true } }),
      prisma.fiscalDocument.findMany({ select: { companyId: true, amount: true, origin: true, createdAt: true } }),
    ]);

    const transacoes = await prisma.bankTransaction.findMany({
      select: { bankAccountId: true, amount: true, reconciled: true, importedAt: true },
    });
    const empresaDaConta = new Map(contas.map((c) => [c.id, c.companyId]));

    // Só as empresas com algum movimento — as 400 sem nada não interessam aqui.
    const ids = new Set();
    for (const l of [pagar, receber, pendencias, anexos, mensagens, fiscais]) for (const x of l) ids.add(x.companyId);
    for (const t of transacoes) ids.add(empresaDaConta.get(t.bankAccountId));

    const doGrupo = (lista, id) => lista.filter((x) => x.companyId === id);
    const porEmpresa = [...ids].filter(Boolean).map((id) => {
      const e = porId.get(id);
      const tr = transacoes.filter((t) => empresaDaConta.get(t.bankAccountId) === id).map((t) => ({ ...t, createdAt: t.importedAt }));
      const p = doGrupo(pagar, id);
      const r = doGrupo(receber, id);
      return {
        empresa: e ? e.corporateName : "(sem empresa)",
        cnpj: e ? digitos(e.cnpj) : null,
        pagar: { ...resumo(p, (x) => x.amount), porStatus: contarPor(p, (x) => x.status), vencimentoDe: p.map((x) => dia(x.dueDate)).sort()[0] || null },
        receber: { ...resumo(r, (x) => x.amount), porStatus: contarPor(r, (x) => x.status), vencimentoDe: r.map((x) => dia(x.dueDate)).sort()[0] || null },
        extrato: { ...resumo(tr, (x) => x.amount), conciliadas: tr.filter((t) => t.reconciled).length },
        pendencias: { ...resumo(doGrupo(pendencias, id)), porStatus: contarPor(doGrupo(pendencias, id), (x) => x.status) },
        anexos: resumo(doGrupo(anexos, id)),
        mensagens: resumo(doGrupo(mensagens, id)),
        documentosFiscais: { ...resumo(doGrupo(fiscais, id), (x) => x.amount), porOrigem: contarPor(doGrupo(fiscais, id), (x) => x.origin) },
      };
    });

    console.log(JSON.stringify({ geradoEm: new Date().toISOString(), contagens, porEmpresa }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Falhou:", e.message);
  process.exit(1);
});
