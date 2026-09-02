// Importa o relatório de empresas do Acessórias para o Connect.
//
//   npx tsx --env-file=.env scripts/importar-acessorias.ts <arquivo.xlsx>            # dry-run
//   npx tsx --env-file=.env scripts/importar-acessorias.ts <arquivo.xlsx> --aplicar
//
// **Dry-run é o padrão.** Sem `--aplicar` ele lê tudo, monta o plano completo e
// imprime o que faria, sem escrever uma linha. É assim que se confere antes de
// mexer em produção.
//
// Idempotente pelo CNPJ: empresa que já existe é ATUALIZADA nos campos vazios e
// nunca duplicada. A migration 20260902130000 criou `@@unique([tenantId, cnpj])`
// justamente para o banco recusar duplicata mesmo se este script rodar duas
// vezes por engano — a proteção não depende do script estar certo.
//
// Decisões do Kauan em 2026-09-02, que este script implementa:
//   - destino: tenant "41 Tech", onde já vivem as 11 empresas de hoje;
//   - cliente: agrupado pela RAIZ do CNPJ (reusa `planejarGrupos`);
//   - filiais: `parentCompanyId` derivado do CNPJ (0001 é matriz);
//   - contatos: só os externos com nome próprio (ver `contatoAproveitavel`).

import fs from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { CompanyStatus, PersonType } from "../src/generated/prisma/enums";
import { cnpjRoot } from "../src/lib/clientGroups";
import { lerPlanilhaAcessorias, planejarImportacao } from "../src/lib/importAcessorias";

const aplicar = process.argv.includes("--aplicar");
const arquivo = process.argv.slice(2).find((a) => !a.startsWith("--"));

const TENANT_NOME = "41 Tech";

function log(...partes: unknown[]) {
  console.log(...partes);
}

async function main() {
  if (!arquivo) {
    console.error("Uso: npx tsx --env-file=.env scripts/importar-acessorias.ts <arquivo.xlsx> [--aplicar]");
    process.exit(1);
  }
  if (!fs.existsSync(arquivo)) {
    console.error(`Arquivo não encontrado: ${arquivo}`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NOME }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NOME}" não encontrado.`);

  const linhas = await lerPlanilhaAcessorias(arquivo);
  const existentes = await prisma.company.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, cnpj: true, name: true, clientGroupId: true, parentCompanyId: true },
  });
  const gruposExistentes = await prisma.clientGroup.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, cnpjRoot: true },
  });

  const plano = planejarImportacao(linhas, existentes, gruposExistentes);

  log(`\n=== IMPORTAÇÃO ACESSÓRIAS ${aplicar ? "(APLICANDO)" : "(DRY-RUN)"} ===`);
  log(`arquivo         : ${arquivo}`);
  log(`tenant destino  : ${tenant.name} (${tenant.id})`);
  log(`linhas lidas    : ${plano.totalLinhas}`);
  log(`empresas na base do arquivo: ${plano.empresas.length}`);
  log("");
  log(`empresas novas          : ${plano.novas.length}`);
  log(`empresas já existentes  : ${plano.jaExistem.length}`);
  log(`empresas a substituir   : ${plano.substituicoes.length} (nome divergente — apaga e recria do arquivo)`);
  log(`clientes a criar        : ${plano.clientesNovos.length}`);
  log(`clientes reaproveitados : ${plano.clientesExistentes.length}`);
  log(`vínculos matriz→filial  : ${plano.filiais.length}`);
  log(`contatos aproveitáveis  : ${plano.contatos.length} (de ${plano.totalContatos} na planilha)`);
  log("");

  if (plano.divergenciasDeNome.length > 0) {
    log(`${plano.divergenciasDeNome.length} empresa(s) serão SUBSTITUÍDAS pelo dado da planilha:`);
    for (const d of plano.divergenciasDeNome) {
      log(`   ${d.cnpj}`);
      log(`      no Connect : ${d.nomeAtual}`);
      log(`      passa a ser: ${d.nomeNovo}`);
    }
    log("Serão APAGADAS e recriadas a partir do arquivo, junto com o que estiver");
    log("pendurado nelas (serviços contratados e documentos de cliente).");
    log("");
  }

  if (plano.filiaisSemMatriz.length > 0) {
    log(`${plano.filiaisSemMatriz.length} filial(is) cuja matriz 0001 não está no arquivo — entram soltas:`);
    for (const f of plano.filiaisSemMatriz.slice(0, 10)) log(`   ${f.cnpj} ${f.name}`);
    log("");
  }

  log("Clientes multi-empresa que serão criados (confira os nomes):");
  for (const c of plano.clientesNovos.filter((c) => c.empresas.length > 1)) {
    log(`   ${c.name}  (${c.empresas.length} empresas, raiz ${c.cnpjRoot})`);
  }
  log("");

  if (!aplicar) {
    log("Dry-run: nada foi escrito. Rode de novo com --aplicar depois de conferir o que está acima.");
    await prisma.$disconnect();
    return;
  }

  // ---- Aplicação, em ordem de dependência ----
  // 0. apagar as substituídas, 1. clientes, 2. empresas (que apontam para
  // cliente), 3. filiais (que apontam para empresa já criada), 4. contatos.

  // Nada aqui cascateia sozinho: só `company_services` tem onDelete Cascade.
  // Documento de cliente e seus destinatários/visualizações são Restrict, então
  // a ordem é filho→pai, senão o delete da empresa bate em foreign key.
  for (const sub of plano.substituicoes) {
    const docs = await prisma.clientDocument.findMany({
      where: { companyId: sub.id },
      select: { id: true },
    });
    const docIds = docs.map((d) => d.id);
    if (docIds.length > 0) {
      const recipients = await prisma.clientDocumentRecipient.findMany({
        where: { clientDocumentId: { in: docIds } },
        select: { id: true },
      });
      const recIds = recipients.map((r) => r.id);
      if (recIds.length > 0) {
        await prisma.clientDocumentView.deleteMany({ where: { recipientId: { in: recIds } } });
        await prisma.clientDocumentRecipient.deleteMany({ where: { id: { in: recIds } } });
      }
      await prisma.clientDocument.deleteMany({ where: { id: { in: docIds } } });
    }
    // Filial apontando para ela viraria órfã com parentCompanyId morto — o
    // SetNull do schema cobre, mas soltar antes deixa explícito.
    await prisma.company.updateMany({ where: { parentCompanyId: sub.id }, data: { parentCompanyId: null } });
    await prisma.company.delete({ where: { id: sub.id } });
    log(`   apagada: ${sub.nomeAtual} (${sub.cnpj})${docIds.length ? ` + ${docIds.length} documento(s)` : ""}`);
  }
  if (plano.substituicoes.length > 0) log(`empresas apagadas: ${plano.substituicoes.length}`);

  const idPorRaiz = new Map<string, string>();
  for (const g of plano.clientesExistentes) idPorRaiz.set(g.cnpjRoot, g.id);

  for (const c of plano.clientesNovos) {
    const criado = await prisma.clientGroup.create({
      data: { tenantId: tenant.id, name: c.name, cnpjRoot: c.cnpjRoot },
      select: { id: true },
    });
    idPorRaiz.set(c.cnpjRoot, criado.id);
  }
  log(`clientes criados: ${plano.clientesNovos.length}`);

  let criadas = 0;
  for (const e of plano.novas) {
    const raiz = cnpjRoot(e.cnpj);
    await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: e.name,
        displayName: e.displayName,
        tradeName: e.tradeName,
        cnpj: e.cnpj,
        externalId: e.externalId,
        taxRegime: e.taxRegime,
        foundationDate: e.foundationDate,
        zipCode: e.zipCode,
        addressStreet: e.addressStreet,
        addressNumber: e.addressNumber,
        addressComplement: e.addressComplement,
        neighborhood: e.neighborhood,
        city: e.city,
        stateCode: e.stateCode,
        stateRegistration: e.stateRegistration,
        municipalRegistration: e.municipalRegistration,
        nire: e.nire,
        phone: e.phone,
        website: e.website,
        status: CompanyStatus.ACTIVE,
        source: "Acessórias",
        clientGroupId: raiz ? idPorRaiz.get(raiz) ?? null : null,
      },
    });
    criadas++;
  }
  log(`empresas criadas: ${criadas}`);


  // Filiais depois de todas existirem — a matriz pode ter sido criada agora.
  const porCnpj = new Map(
    (
      await prisma.company.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, cnpj: true },
      })
    )
      .filter((c) => c.cnpj)
      .map((c) => [c.cnpj!, c.id])
  );

  let vinculadas = 0;
  for (const f of plano.filiais) {
    const filialId = porCnpj.get(f.cnpjFilial);
    const matrizId = porCnpj.get(f.cnpjMatriz);
    if (!filialId || !matrizId) continue;
    await prisma.company.update({ where: { id: filialId }, data: { parentCompanyId: matrizId } });
    vinculadas++;
  }
  log(`filiais vinculadas: ${vinculadas}`);

  let pessoas = 0;
  for (const c of plano.contatos) {
    const empresaId = porCnpj.get(c.cnpjEmpresa);
    if (!empresaId) continue;
    // Sem unique em Person: a checagem de duplicata é aqui, por nome + empresa.
    const ja = await prisma.person.findFirst({
      where: { tenantId: tenant.id, name: c.name, currentCompanyId: empresaId },
      select: { id: true },
    });
    if (ja) continue;
    await prisma.person.create({
      data: {
        tenantId: tenant.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        type: PersonType.COLABORADOR,
        isInternal: false,
        currentCompanyId: empresaId,
      },
    });
    pessoas++;
  }
  log(`contatos criados: ${pessoas}`);

  log("\nPronto.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
