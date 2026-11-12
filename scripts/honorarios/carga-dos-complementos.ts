// Carga dos dados complementares do termo aditivo, do Aditiva Pronto para o cadastro do Connect
// (funcionalidade-643, 12/11/2026): endereço da empresa, o sócio que assina (com nacionalidade,
// estado civil e profissão) e os contatos administrativo e financeiro.
//
// Regra do Kauan: só preenche o que está vazio no Connect, nunca sobrescreve. A empresa casa pelo
// CNPJ (como na carga do Aditiva); o sócio, pelo CPF ou pelo nome com o meio do CPF (o que veio da
// Receita). Pode ser repetida: na segunda vez não há mais o que preencher. Sem `--gravar`, só simula.
//
// Variáveis de ambiente (nunca por argumento, para não ficarem no histórico do terminal):
//   CARGA_ORIGEM_URL   mysql://usuario_somente_leitura:...@host:porta/aditiva_pronto
//   CARGA_TENANT_ID    o escritório do Connect que recebe os dados
//   DATABASE_URL       o banco do Connect (o mesmo do app)
//
// Uso:
//   npx tsx --env-file=.env scripts/honorarios/carga-dos-complementos.ts [--gravar] [--relatorio=<arquivo.json>]
//
// O terminal mostra só contagens. O que identifica empresa ou pessoa vai para o relatório, um
// arquivo local (por padrão na pasta temporária), que não deve ir para o git.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mariadb from "mariadb";
import { getPrisma } from "../../src/lib/prisma";
import { casarEmpresas, type EmpresaDoAditiva } from "../../src/lib/honorarios/carga/mapear";
import { mudaAlgo, planejarComplemento, type ComplementoDoAditiva, type PlanoDoComplemento } from "../../src/lib/honorarios/carga/complementos";

const gravar = process.argv.includes("--gravar");
const relatorioArg = process.argv.find((a) => a.startsWith("--relatorio="))?.slice("--relatorio=".length);
const caminhoDoRelatorio = relatorioArg || join(tmpdir(), `carga-complementos-${Date.now()}.json`);

const origemUrl = process.env.CARGA_ORIGEM_URL;
const tenantDoAmbiente = process.env.CARGA_TENANT_ID;
if (!origemUrl) throw new Error("Defina CARGA_ORIGEM_URL (usuário somente leitura do banco do Aditiva).");
if (!tenantDoAmbiente) throw new Error("Defina CARGA_TENANT_ID (o escritório do Connect que recebe os dados).");
const tenantId: string = tenantDoAmbiente;
const prisma = getPrisma();

const ENDERECO = { zipCode: true, addressStreet: true, addressNumber: true, neighborhood: true, city: true, stateCode: true } as const;

async function main() {
  if (!(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) {
    throw new Error("CARGA_TENANT_ID não é um escritório do Connect.");
  }
  const url = new URL(origemUrl!);
  const origem = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    allowPublicKeyRetrieval: true,
    bigIntAsNumber: true,
    dateStrings: false,
    timezone: "Z",
  });
  let complementos: ComplementoDoAditiva[];
  let doAditiva: EmpresaDoAditiva[];
  try {
    await origem.query("START TRANSACTION READ ONLY");
    doAditiva = (await origem.query("SELECT id, cnpj, razao_social FROM companies")) as EmpresaDoAditiva[];
    complementos = (await origem.query("SELECT * FROM company_complements")) as ComplementoDoAditiva[];
    await origem.query("COMMIT");
  } finally {
    await origem.end();
  }

  const doConnect = await prisma.company.findMany({ where: { tenantId, cnpj: { not: null } }, select: { id: true, cnpj: true } });
  const { porId } = casarEmpresas(doAditiva, doConnect);
  const razaoPorId = new Map(doAditiva.map((e) => [e.id, e.razao_social]));

  const relatorio = {
    modo: gravar ? "gravar" : "simular",
    semEmpresaNoConnect: [] as string[],
    avisos: [] as { empresa: string; aviso: string }[],
    contagens: { complementos: complementos.length, semEmpresa: 0, semMudanca: 0, empresas: 0, enderecos: 0, sociosCriados: 0, sociosAtualizados: 0, contatos: 0 },
  };
  const c = relatorio.contagens;

  for (const comp of complementos) {
    const companyId = porId.get(comp.company_id);
    if (!companyId) {
      c.semEmpresa++;
      relatorio.semEmpresaNoConnect.push(razaoPorId.get(comp.company_id) ?? comp.company_id);
      continue;
    }
    const e = await prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: {
        id: true,
        ...ENDERECO,
        partners: {
          where: { exitDate: null },
          select: { id: true, name: true, document: true, documentMasked: true, administrator: true, nationality: true, maritalStatus: true, occupation: true, ...ENDERECO },
        },
        honorarioContatos: { select: { papel: true } },
      },
    });
    if (!e) continue;
    const plano: PlanoDoComplemento = planejarComplemento(comp, { ...e, socios: e.partners, contatos: e.honorarioContatos.map((x) => x.papel) });
    for (const aviso of plano.avisos) relatorio.avisos.push({ empresa: razaoPorId.get(comp.company_id) ?? companyId, aviso });
    if (!mudaAlgo(plano)) {
      c.semMudanca++;
      continue;
    }
    c.empresas++;
    if (Object.keys(plano.empresa).length > 0) c.enderecos++;
    if (plano.socio?.acao === "criar") c.sociosCriados++;
    if (plano.socio?.acao === "atualizar") c.sociosAtualizados++;
    c.contatos += plano.contatos.length;
    if (!gravar) continue;

    // Uma empresa por vez: a carga de 11/11 caiu no tempo de transação ao gravar em lote.
    await prisma.$transaction(async (tx) => {
      if (Object.keys(plano.empresa).length > 0) await tx.company.update({ where: { id: companyId }, data: plano.empresa });
      if (plano.socio?.acao === "atualizar") await tx.companyPartner.update({ where: { id: plano.socio.id }, data: plano.socio.campos });
      if (plano.socio?.acao === "criar") await tx.companyPartner.create({ data: { tenantId, companyId, origin: "MANUAL", ...plano.socio.campos } });
      for (const ct of plano.contatos) {
        await tx.honorarioContato.upsert({
          where: { companyId_papel: { companyId, papel: ct.papel } },
          create: { tenantId, companyId, ...ct },
          // Corrida com alguém na tela: o que já está no Connect fica.
          update: {},
        });
      }
    });
  }

  writeFileSync(caminhoDoRelatorio, JSON.stringify(relatorio, null, 2));
  console.log(`complementos no Aditiva      ${c.complementos}`);
  console.log(`empresa sem par no Connect   ${c.semEmpresa}`);
  console.log(`já completas no Connect      ${c.semMudanca}`);
  console.log(`empresas ${gravar ? "atualizadas" : "a atualizar"}         ${c.empresas}`);
  console.log(`  endereço da empresa        ${c.enderecos}`);
  console.log(`  sócios cadastrados         ${c.sociosCriados}`);
  console.log(`  sócios completados         ${c.sociosAtualizados}`);
  console.log(`  contatos                   ${c.contatos}`);
  console.log(`avisos (no relatório)        ${relatorio.avisos.length}`);
  console.log(`\n${gravar ? "Gravado." : "Simulação: nada foi gravado. Rode com --gravar para gravar."}`);
  console.log(`Relatório: ${caminhoDoRelatorio}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
