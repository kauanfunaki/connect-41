// Carrega nos protótipos do Marcos (41 BPO/DRE e 41 Societário) as empresas
// exportadas do Connect por `scripts/exportar-empresas-para-prototipos.ts`.
//
// NÃO roda no Connect. Roda DENTRO do container de cada protótipo, pelo
// Console do EasyPanel, usando o Prisma Client e o DATABASE_URL do próprio
// protótipo. Quem monta o arquivo colável é o script de exportação: ele
// embute os dados aqui no lugar do marcador `__DADOS__`.
//
//   node /tmp/carga.cjs            # dry-run: só conta o que faria
//   node /tmp/carga.cjs --aplicar  # grava
//
// Regras (decididas em 2026-09-22):
// - Só ACRESCENTA. Registro que já existe no protótipo não é alterado — o
//   Societário tem clientes reais cadastrados à mão.
// - Casamento por DÍGITOS do documento, não pela string: o protótipo guarda
//   CNPJ com máscara e o `@unique` da coluna não pega a mesma empresa escrita
//   com e sem pontuação.
// - Idempotente: rodar de novo não duplica nada.
// - Tudo o que entra aqui é dado de TESTE. `origin = "Connect"` no cliente e a
//   nota com o id do Connect na empresa marcam a procedência.
//
// Mapeamento: ClientGroup (Connect) → Client (protótipo); Company → Company.
// Cliente pessoa física vira Client tipo PF, sem Company (o protótipo exige
// CNPJ em Company). Empresa sem CNPJ e sem CPF não entra.

"use strict";

const { createRequire } = require("module");

const DADOS = /*__DADOS__*/ null;

const aplicar = process.argv.includes("--aplicar");

function carregarDados() {
  if (DADOS) return DADOS;
  // Ensaio local: node carregar-empresas.cjs caminho/do/export.json
  const caminho = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!caminho) throw new Error("Sem dados embutidos e sem caminho de JSON no argumento.");
  return JSON.parse(require("fs").readFileSync(caminho, "utf8"));
}

// O script fica em /tmp, fora da árvore do app — o require normal não acharia
// o @prisma/client gerado do protótipo. Resolve a partir do diretório atual
// (/app no container, a raiz do repo no ensaio local).
function prismaDoPrototipo() {
  const req = createRequire(process.cwd() + "/");
  const { PrismaClient } = req("@prisma/client");
  return new PrismaClient();
}

const digitos = (s) => (s || "").replace(/\D/g, "");

function mascaraCnpj(d) {
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
}
function mascaraCpf(d) {
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
}

// CompanyStatus do Connect (CRM) → CLIENT_STATUSES do protótipo.
const STATUS_CLIENTE = {
  ACTIVE: "ATIVO",
  PROSPECT: "PROSPECT",
  INACTIVE: "SUSPENSO",
  CHURNED: "ENCERRADO",
};

function enderecoEmUmaLinha(e) {
  const rua = [e.addressStreet, e.addressNumber].filter(Boolean).join(", ");
  const partes = [rua, e.addressComplement, e.neighborhood, e.zipCode ? "CEP " + e.zipCode : null];
  const linha = partes.filter(Boolean).join(" - ");
  return linha || null;
}

// O Societário faz JSON.parse em secondaryCnaes; o Connect guarda lista com vírgula.
function cnaesSecundarios(texto) {
  if (!texto) return null;
  const lista = texto.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return lista.length ? JSON.stringify(lista) : null;
}

// Mesmo esquema do nextClientCode() dos protótipos: CLI-0001, CLI-0002...
// Eles calculam o próximo como count+1, então os códigos novos saem a partir
// dali, pulando os que já estiverem ocupados.
function geradorDeCodigo(codigosExistentes, totalAtual) {
  const ocupados = new Set(codigosExistentes);
  let n = totalAtual;
  return () => {
    let codigo;
    do {
      n += 1;
      codigo = "CLI-" + String(n).padStart(4, "0");
    } while (ocupados.has(codigo));
    ocupados.add(codigo);
    return codigo;
  };
}

async function main() {
  const dados = carregarDados();
  const prisma = prismaDoPrototipo();
  const hoje = new Date().toISOString().slice(0, 10);
  const nota = (id) => `Importado do Connect em ${hoje} (id ${id}). Dado de teste.`;

  try {
    const clientes = await prisma.client.findMany({ select: { id: true, code: true, document: true } });
    const empresas = await prisma.company.findMany({ select: { id: true, cnpj: true, clientId: true } });

    const clientePorDoc = new Map(clientes.map((c) => [digitos(c.document), c.id]));
    const empresaPorCnpj = new Map(empresas.map((e) => [digitos(e.cnpj), e]));
    const proximoCodigo = geradorDeCodigo(clientes.map((c) => c.code), clientes.length);

    console.log(`banco            : ${process.env.DATABASE_URL}`);
    console.log(`já no protótipo : ${clientes.length} clientes, ${empresas.length} empresas`);
    console.log(`no export       : ${dados.grupos.length} grupos, ${dados.grupos.reduce((s, g) => s + g.empresas.length, 0)} empresas (gerado ${dados.geradoEm})`);
    console.log(aplicar ? "MODO: APLICAR\n" : "MODO: dry-run (nada é gravado; use --aplicar)\n");

    const r = { clientesCriados: 0, clientesReaproveitados: 0, empresasCriadas: 0, empresasJaExistiam: 0, semDocumento: [], pfSemCpf: 0 };

    for (const g of dados.grupos) {
      const pj = g.empresas.filter((e) => digitos(e.cnpj).length === 14);
      const pf = g.empresas.filter((e) => digitos(e.cnpj).length !== 14 && digitos(e.cpf).length === 11);
      for (const e of g.empresas) {
        if (digitos(e.cnpj).length !== 14 && digitos(e.cpf).length !== 11) r.semDocumento.push(e.name);
      }
      if (pj.length === 0 && pf.length === 0) continue;

      // Cliente do grupo: o que já é dono de alguma empresa do grupo no
      // protótipo; senão o que tem o mesmo documento; senão um novo.
      const matriz = pj.find((e) => !e.parentCompanyId) || pj[0] || pf[0];
      const docCliente = pj.length ? digitos(matriz.cnpj) : digitos(matriz.cpf);
      let clientId =
        pj.map((e) => empresaPorCnpj.get(digitos(e.cnpj))).find(Boolean)?.clientId ||
        clientePorDoc.get(docCliente) ||
        null;

      if (clientId) {
        r.clientesReaproveitados++;
      } else {
        const dadosCliente = {
          code: proximoCodigo(),
          type: pj.length ? "PJ" : "PF",
          name: g.name || matriz.name,
          tradeName: matriz.tradeName || null,
          document: pj.length ? mascaraCnpj(docCliente) : mascaraCpf(docCliente),
          phone: matriz.phone || null,
          email: matriz.email || null,
          address: enderecoEmUmaLinha(matriz),
          city: matriz.city || null,
          state: matriz.stateCode || null,
          origin: "Connect",
          status: STATUS_CLIENTE[matriz.status] || "ATIVO",
          notes: nota(g.id),
        };
        if (aplicar) {
          const criado = await prisma.client.create({ data: dadosCliente, select: { id: true } });
          clientId = criado.id;
        } else {
          clientId = "(novo:" + dadosCliente.code + ")";
        }
        clientePorDoc.set(docCliente, clientId);
        r.clientesCriados++;
      }

      for (const e of pj) {
        const d = digitos(e.cnpj);
        if (empresaPorCnpj.has(d)) {
          r.empresasJaExistiam++;
          continue;
        }
        const dadosEmpresa = {
          clientId,
          corporateName: e.name,
          tradeName: e.displayName || e.tradeName || null,
          cnpj: mascaraCnpj(d),
          nire: e.nire || null,
          stateRegistration: e.stateRegistration || null,
          municipalRegistration: e.municipalRegistration || null,
          mainCnae: e.cnaePrincipal || null,
          secondaryCnaes: cnaesSecundarios(e.cnaeSecundarios),
          taxRegime: e.taxRegime || null,
          city: e.city || null,
          state: e.stateCode || null,
          address: enderecoEmUmaLinha(e),
          openingDate: e.foundationDate ? new Date(e.foundationDate) : null,
          registrationStatus: "Ativa",
          notes: nota(e.id),
        };
        if (aplicar) {
          const criada = await prisma.company.create({ data: dadosEmpresa, select: { id: true, cnpj: true, clientId: true } });
          empresaPorCnpj.set(d, criada);
        } else {
          empresaPorCnpj.set(d, { id: "(nova)", cnpj: dadosEmpresa.cnpj, clientId });
        }
        r.empresasCriadas++;
      }
    }

    console.log(`clientes criados            : ${r.clientesCriados}`);
    console.log(`clientes que já existiam    : ${r.clientesReaproveitados}`);
    console.log(`empresas criadas            : ${r.empresasCriadas}`);
    console.log(`empresas que já existiam    : ${r.empresasJaExistiam}`);
    console.log(`sem CNPJ nem CPF (ficaram de fora): ${r.semDocumento.length}`);
    for (const n of r.semDocumento) console.log(`   - ${n}`);

    if (aplicar) {
      // O protótipo gera o próximo código como count+1. Se esse código já
      // estiver ocupado (base com buraco na numeração), o cadastro manual de
      // cliente falha por unique — melhor saber agora.
      const total = await prisma.client.count();
      const proximo = "CLI-" + String(total + 1).padStart(4, "0");
      const ocupado = await prisma.client.findUnique({ where: { code: proximo }, select: { id: true } });
      console.log(`\ntotal agora: ${total} clientes, ${await prisma.company.count()} empresas`);
      if (ocupado) console.log(`ATENÇÃO: o próximo código que a tela vai gerar (${proximo}) já existe — o cadastro manual de cliente vai falhar.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
