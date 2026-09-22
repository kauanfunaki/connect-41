// Exporta as empresas do Connect para alimentar os protótipos do Marcos
// (41 BPO/DRE e 41 Societário), onde os coordenadores testam. SÓ LEITURA no
// Connect: nada aqui escreve no banco.
//
//   npx tsx --env-file=.env scripts/exportar-empresas-para-prototipos.ts
//
// Gera, numa pasta temporária (o caminho sai no fim):
//   - empresas.json  — o export cru, para conferir;
//   - colar-no-console.sh — o texto que se cola no Console do EasyPanel de
//     cada protótipo. Ele recria `scripts/prototipos/carregar-empresas.cjs`
//     com os dados embutidos em /tmp/carga.cjs e confere o sha256 (colagem
//     cortada pelo terminal web falha ali, e não no meio da carga).
//
// O que a carga faz lá dentro está documentado no próprio carregar-empresas.cjs.
// Dado que volta dos protótipos para o Connect é outra via — esta é só de ida.

import { join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { empacotar } from "./prototipos/empacotar";

const TENANT_NOME = process.argv.find((a) => a.startsWith("--tenant="))?.slice(9) ?? "41 Tech";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  try {
    const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NOME }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant "${TENANT_NOME}" não encontrado.`);

    const empresas = await prisma.company.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        name: true,
        tradeName: true,
        displayName: true,
        kind: true,
        cnpj: true,
        cpf: true,
        taxRegime: true,
        foundationDate: true,
        cnaePrincipal: true,
        cnaeSecundarios: true,
        zipCode: true,
        addressStreet: true,
        addressNumber: true,
        addressComplement: true,
        neighborhood: true,
        city: true,
        stateCode: true,
        stateRegistration: true,
        municipalRegistration: true,
        nire: true,
        email: true,
        phone: true,
        status: true,
        parentCompanyId: true,
        clientGroupId: true,
        clientGroup: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Empresa sem grupo (o backfill deveria ter zerado isso) vira grupo 1:1,
    // que é a mesma regra do backfill para quem não divide raiz de CNPJ.
    const grupos = new Map<string, { id: string; name: string; empresas: typeof empresas }>();
    for (const e of empresas) {
      const chave = e.clientGroup?.id ?? `avulsa:${e.id}`;
      const nome = e.clientGroup?.name ?? e.name;
      if (!grupos.has(chave)) grupos.set(chave, { id: chave, name: nome, empresas: [] });
      grupos.get(chave)!.empresas.push(e);
    }

    const dados = {
      geradoEm: new Date().toISOString(),
      tenant: tenant.name,
      grupos: [...grupos.values()].map((g) => ({
        ...g,
        empresas: g.empresas.map(({ clientGroup: _g, ...e }) => e),
      })),
    };

    const semGrupo = empresas.filter((e) => !e.clientGroupId).length;
    const semDoc = empresas.filter((e) => !e.cnpj && !e.cpf).length;
    console.log(`tenant           : ${tenant.name}`);
    console.log(`empresas         : ${empresas.length}`);
    console.log(`grupos           : ${grupos.size}${semGrupo ? ` (${semGrupo} empresas sem grupo viraram grupo próprio)` : ""}`);
    console.log(`sem CNPJ nem CPF : ${semDoc} (não entram nos protótipos)`);

    const pacote = empacotar({
      script: join(__dirname, "prototipos", "carregar-empresas.cjs"),
      dados,
      pasta: `carga-prototipos-${dados.geradoEm.slice(0, 10)}`,
      arquivos: { "empresas.json": JSON.stringify(dados, null, 2) },
    });

    console.log(`\narquivos em      : ${pacote.pasta}`);
    console.log(`colar-no-console : ${pacote.kb} KB, ${pacote.linhas} linhas`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
