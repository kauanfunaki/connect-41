// Uma base com filiais no banco LOCAL (05/11/2026): a BLD Distribuidora, matriz
// e cinco filiais com o mesmo CNPJ raiz, para ver a faixa da empresa com uma
// base de várias unidades (as abas de empresas e a janelinha das filiais).
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/bld-com-filiais.ts
//
// Idempotente: roda de novo sem duplicar (procura pelo CNPJ). Dados fictícios.
// Recusa qualquer banco que não seja de 127.0.0.1/localhost.

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { camposDoRegime } from "../../src/lib/taxRegime";

const SLUG_DO_TENANT = "41tech";
const RAIZ = "48261937";

/** Os dois dígitos verificadores do CNPJ, para o número passar na validação das telas. */
function cnpjCompleto(raiz: string, ordem: number): string {
  const base = raiz + String(ordem).padStart(4, "0");
  const dv = (numeros: string) => {
    const pesos = numeros.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...numeros].reduce((s, d, i) => s + Number(d) * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}

const UNIDADES = [
  { ordem: 1, nome: "BLD MOGI DAS CRUZES - SP", cidade: "MOGI DAS CRUZES", uf: "SP" },
  { ordem: 2, nome: "BLD CAMPINAS - SP", cidade: "CAMPINAS", uf: "SP" },
  { ordem: 3, nome: "BLD SOROCABA - SP", cidade: "SOROCABA", uf: "SP" },
  { ordem: 4, nome: "BLD CURITIBA - PR", cidade: "CURITIBA", uf: "PR" },
  { ordem: 5, nome: "BLD JOINVILLE - SC", cidade: "JOINVILLE", uf: "SC" },
  { ordem: 6, nome: "BLD BELO HORIZONTE - MG", cidade: "BELO HORIZONTE", uf: "MG" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const host = new URL(url.replace(/^mysql:/, "http:")).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Recusado: só no banco local (a DATABASE_URL não é de 127.0.0.1/localhost).");
  const p = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const tenant = await p.tenant.findFirst({ where: { slug: SLUG_DO_TENANT }, select: { id: true } });
  if (!tenant) throw new Error(`tenant ${SLUG_DO_TENANT} não encontrado`);

  let matrizId: string | null = null;
  for (const u of UNIDADES) {
    const cnpj = cnpjCompleto(RAIZ, u.ordem);
    const existente = await p.company.findFirst({ where: { tenantId: tenant.id, cnpj }, select: { id: true } });
    const dados: { name: string; displayName: string; tradeName: string; city: string; stateCode: string; status: "ACTIVE"; parentCompanyId: string | null } = {
      name: "BLD DISTRIBUIDORA DE ALIMENTOS LTDA",
      displayName: u.ordem === 1 ? "BLD DISTRIBUIDORA (MATRIZ) - MOGI DAS CRUZES" : u.nome,
      tradeName: "BLD Distribuidora",
      city: u.cidade,
      stateCode: u.uf,
      status: "ACTIVE" as const,
      parentCompanyId: u.ordem === 1 ? null : matrizId,
    };
    const empresa: { id: string } = existente
      ? await p.company.update({ where: { id: existente.id }, data: dados, select: { id: true } })
      : await p.company.create({ data: { tenantId: tenant.id, cnpj, ...camposDoRegime("LUCRO_PRESUMIDO"), ...dados }, select: { id: true } });
    if (u.ordem === 1) matrizId = empresa.id;
    console.log(`${existente ? "atualizada" : "criada"}: ${dados.displayName} (${cnpj})`);
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
