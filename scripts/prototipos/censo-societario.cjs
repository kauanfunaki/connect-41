// Levantamento do que existe no protótipo do 41 Societário, antes de decidir o
// que migrar para o Connect (licenças, taxas, processos, protocolos).
//
// **Só lê.** Nenhuma escrita, nenhuma alteração. Roda DENTRO do container do
// protótipo, pelo Console do EasyPanel — mesmo caminho de
// `carregar-empresas.cjs`:
//
//   cat > /tmp/censo.cjs   (colar este arquivo, Ctrl+D)
//   node /tmp/censo.cjs
//
// A saída é um JSON só, para colar de volta na conversa. Não traz senha nem
// documento pessoal: CNPJ de empresa (dado público) só das empresas que têm
// processo, licença ou taxa — é o que permite casar com o cadastro do Connect.
// Nomes de pessoas, e-mails e observações ficam de fora.

"use strict";

const { createRequire } = require("module");

function prismaDoPrototipo() {
  const req = createRequire(process.cwd() + "/");
  const { PrismaClient } = req("@prisma/client");
  return new PrismaClient();
}

const digitos = (s) => (s || "").replace(/\D/g, "");
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function contarPor(lista, chave) {
  const r = {};
  for (const x of lista) {
    const k = String(chave(x) ?? "(vazio)");
    r[k] = (r[k] || 0) + 1;
  }
  return r;
}

async function main() {
  const prisma = prismaDoPrototipo();
  try {
    const contagens = {};
    for (const m of ["client", "company", "companyPartner", "processType", "processTemplate", "process", "processStep", "task", "document", "requirement", "protocol", "fee", "license", "communication", "comment"]) {
      try {
        contagens[m] = await prisma[m].count();
      } catch (e) {
        contagens[m] = "erro: " + e.message.slice(0, 80);
      }
    }

    const processos = await prisma.process.findMany({
      select: {
        id: true, code: true, status: true, openedAt: true, concludedAt: true, dueDate: true, createdAt: true,
        processType: { select: { name: true } },
        company: { select: { cnpj: true } },
        client: { select: { type: true, document: true } },
        _count: { select: { steps: true, protocols: true, fees: true, licenses: true, documents: true, requirements: true } },
      },
    });

    const licencas = await prisma.license.findMany({
      select: { category: true, status: true, createdAt: true, company: { select: { cnpj: true } }, process: { select: { code: true } } },
    });

    const taxas = await prisma.fee.findMany({
      select: { agency: true, amount: true, dueDate: true, paidAt: true, process: { select: { code: true, company: { select: { cnpj: true } } } } },
    });

    const protocolos = await prisma.protocol.findMany({
      select: { agency: true, status: true, date: true, process: { select: { code: true } } },
    });

    // CNPJs que importam para a migração: os das empresas com algo pendurado.
    const cnpjs = new Set();
    for (const p of processos) if (p.company) cnpjs.add(digitos(p.company.cnpj));
    for (const l of licencas) if (l.company) cnpjs.add(digitos(l.company.cnpj));
    for (const t of taxas) if (t.process && t.process.company) cnpjs.add(digitos(t.process.company.cnpj));

    const saida = {
      geradoEm: new Date().toISOString(),
      contagens,
      processos: {
        porStatus: contarPor(processos, (p) => p.status),
        porTipo: contarPor(processos, (p) => p.processType && p.processType.name),
        semEmpresa: processos.filter((p) => !p.company).length,
        criadosPorMes: contarPor(processos, (p) => dia(p.createdAt) && dia(p.createdAt).slice(0, 7)),
        lista: processos.map((p) => ({
          code: p.code,
          tipo: p.processType && p.processType.name,
          status: p.status,
          cnpj: p.company ? digitos(p.company.cnpj) : null,
          clienteTipo: p.client && p.client.type,
          aberto: dia(p.openedAt),
          prazo: dia(p.dueDate),
          concluido: dia(p.concludedAt),
          qtd: p._count,
        })),
      },
      licencas: {
        porCategoria: contarPor(licencas, (l) => l.category),
        porStatus: contarPor(licencas, (l) => l.status),
        lista: licencas.map((l) => ({ categoria: l.category, status: l.status, cnpj: l.company ? digitos(l.company.cnpj) : null, processo: l.process && l.process.code, criada: dia(l.createdAt) })),
      },
      taxas: {
        porOrgao: contarPor(taxas, (t) => t.agency),
        pagas: taxas.filter((t) => t.paidAt).length,
        somaReais: Math.round(taxas.reduce((n, t) => n + (t.amount || 0), 0) * 100) / 100,
        lista: taxas.map((t) => ({ orgao: t.agency, valor: t.amount, vence: dia(t.dueDate), paga: dia(t.paidAt), processo: t.process && t.process.code })),
      },
      protocolos: {
        porOrgao: contarPor(protocolos, (p) => p.agency),
        porStatus: contarPor(protocolos, (p) => p.status),
      },
      cnpjsEnvolvidos: [...cnpjs].filter(Boolean).sort(),
    };

    console.log(JSON.stringify(saida));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Falhou:", e.message);
  process.exit(1);
});
