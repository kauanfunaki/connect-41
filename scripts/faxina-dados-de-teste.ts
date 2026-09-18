// Faxina do lixo de teste que sobrou na base de produção.
//
//   npx tsx --env-file=.env scripts/faxina-dados-de-teste.ts            # simulação
//   npx tsx --env-file=.env scripts/faxina-dados-de-teste.ts --aplicar
//
// São três coisas, todas anotadas no Quadro desde a importação do Acessórias:
//
// 1. **Empresas de teste com CNPJ inválido** (menos de 14 dígitos, ou só zeros)
//    **ou com nome de teste e nenhum documento** — o segundo critério entrou em
//    18/09, quando se viu que "Teste 2" e "Teste!" tinham CNPJ nulo e por isso
//    escaparam da primeira passagem.
//    Não travam nada — o índice único foi criado em 02/09 sem precisar tirá-las,
//    porque são valores distintos entre si —, mas aparecem na lista de empresas
//    junto das 396 reais.
// 2. **Ficha de pessoa `asdasd`**, digitada num teste e esquecida em /pessoas.
// 3. **Nome truncado da MULTI**: a matriz foi gravada com 40 caracteres
//    ("MULTI COMERCIO DE PECAS DE MAQUINAS E MA") porque veio cortada da origem.
//    As filiais dela têm o nome inteiro, então o correto não é palpite: sai do
//    prefixo comum das filiais.
//
// ─── Nada é apagado às cegas ────────────────────────────────────────────────
//
// Antes de apagar, cada registro é contado nas tabelas que dependem dele. Com
// qualquer vínculo, o script **não apaga**: ele inativa (empresa vira INACTIVE,
// pessoa vira inativa) e diz o que segurou. Apagar levando dado junto é pior que
// deixar a linha feia na lista.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const aplicar = process.argv.includes("--aplicar");

function digitos(texto: string | null): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** CNPJ que não tem 14 dígitos, ou que só tem zeros. */
function cnpjInvalido(cnpj: string | null): boolean {
  const d = digitos(cnpj);
  if (d.length === 0) return false; // empresa sem documento é caso legítimo (PF, cadastro em andamento)
  return d.length !== 14 || /^0+$/.test(d);
}

/**
 * Nome que só existe porque alguém estava testando.
 *
 * O padrão casa o **nome inteiro**, e não um pedaço: "TESTE ALIMENTOS LTDA" é
 * empresa de verdade, e um `includes("teste")` a levaria junto. Dígitos e
 * pontuação no fim entram porque é assim que o segundo teste nasce — "Teste 2",
 * "Teste!".
 */
const NOME_DE_TESTE = /^(teste|test|asdasd|aaa+|xxx+)[\s\d!.?-]*$/i;

/**
 * Empresa de teste sem documento nenhum.
 *
 * Nasceu de um achado de 18/09: a primeira faxina procurava CNPJ **inválido**, e
 * "Teste 2" e "Teste!" têm CNPJ **nulo** — não casavam nenhum critério e
 * ficaram. A falta de documento sozinha não basta para condenar (o comentário de
 * `cnpjInvalido` diz por quê: PF e cadastro em andamento são legítimos), e o
 * nome sozinho também não. **São as duas coisas juntas** que descrevem lixo de
 * teste: ninguém cadastra uma empresa real chamada "Teste" e a deixa sem CNPJ e
 * sem CPF.
 */
function empresaDeTeste(e: { name: string; cnpj: string | null; cpf: string | null }): boolean {
  return NOME_DE_TESTE.test(e.name.trim()) && digitos(e.cnpj) === "" && digitos(e.cpf) === "";
}

/** O nome completo da matriz, deduzido do prefixo comum das filiais ("… - Filial 02"). */
function nomeDasFiliais(nomes: string[]): string | null {
  const limpos = nomes.map((n) => n.replace(/\s*-\s*Filial\s*\d+\s*$/i, "").trim()).filter(Boolean);
  if (limpos.length === 0) return null;
  const primeiro = limpos[0]!;
  return limpos.every((n) => n === primeiro) ? primeiro : null;
}

type Vinculos = { tabela: string; total: number }[];

async function vinculosDaEmpresa(prisma: PrismaClient, companyId: string): Promise<Vinculos> {
  const [pessoas, filiais, servicos, documentos, lancamentos, contrapartes, contas, pendencias, processos, licencas, vagas, reunioes, obrigacoes, credenciais, documentosCliente] =
    await Promise.all([
      prisma.person.count({ where: { currentCompanyId: companyId } }),
      prisma.company.count({ where: { parentCompanyId: companyId } }),
      prisma.companyService.count({ where: { companyId } }),
      prisma.fiscalDocument.count({ where: { companyId } }),
      prisma.financeEntry.count({ where: { companyId } }),
      prisma.financeCounterparty.count({ where: { companyId } }),
      prisma.bankAccount.count({ where: { companyId } }),
      prisma.clientRequest.count({ where: { companyId } }),
      prisma.process.count({ where: { companyId } }),
      prisma.license.count({ where: { companyId } }),
      prisma.vaga.count({ where: { companyId } }),
      prisma.meeting.count({ where: { companyId } }),
      prisma.recurringObligation.count({ where: { companyId } }),
      prisma.bpoCredential.count({ where: { companyId } }),
      prisma.clientDocument.count({ where: { companyId } }),
    ]);
  return [
    { tabela: "pessoas", total: pessoas },
    { tabela: "filiais", total: filiais },
    { tabela: "serviços", total: servicos },
    { tabela: "documentos fiscais", total: documentos },
    { tabela: "lançamentos", total: lancamentos },
    { tabela: "contrapartes", total: contrapartes },
    { tabela: "contas bancárias", total: contas },
    { tabela: "pendências", total: pendencias },
    { tabela: "processos", total: processos },
    { tabela: "licenças", total: licencas },
    { tabela: "vagas", total: vagas },
    { tabela: "reuniões", total: reunioes },
    { tabela: "obrigações", total: obrigacoes },
    { tabela: "credenciais", total: credenciais },
    { tabela: "documentos ao cliente", total: documentosCliente },
  ].filter((v) => v.total > 0);
}

async function vinculosDaPessoa(prisma: PrismaClient, personId: string): Promise<Vinculos> {
  const [candidaturas, exames, ferias, afastamentos, rescisoes, folha, treinamentos, avaliacoes, dependentes, admissoes, chatwoot, usuario] =
    await Promise.all([
      prisma.candidatura.count({ where: { personId } }),
      prisma.exameAdmissional.count({ where: { personId } }),
      prisma.vacation.count({ where: { personId } }),
      prisma.absence.count({ where: { personId } }),
      prisma.termination.count({ where: { personId } }),
      prisma.payrollEntry.count({ where: { personId } }),
      prisma.trainingParticipant.count({ where: { personId } }),
      prisma.evaluation.count({ where: { personId } }),
      prisma.dependente.count({ where: { personId } }),
      prisma.admissaoLink.count({ where: { personId } }),
      prisma.chatwootContactLink.count({ where: { personId } }),
      prisma.person.count({ where: { id: personId, linkedUserId: { not: null } } }),
    ]);
  return [
    { tabela: "candidaturas", total: candidaturas },
    { tabela: "exames", total: exames },
    { tabela: "férias", total: ferias },
    { tabela: "afastamentos", total: afastamentos },
    { tabela: "rescisões", total: rescisoes },
    { tabela: "folha", total: folha },
    { tabela: "treinamentos", total: treinamentos },
    { tabela: "avaliações", total: avaliacoes },
    { tabela: "dependentes", total: dependentes },
    { tabela: "admissões", total: admissoes },
    { tabela: "contatos do Chatwoot", total: chatwoot },
    { tabela: "conta de usuário vinculada", total: usuario },
  ].filter((v) => v.total > 0);
}

function descreve(v: Vinculos): string {
  return v.map((x) => `${x.total} ${x.tabela}`).join(", ");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const acoes: string[] = [];

  // ─── 1. Empresas com CNPJ inválido ────────────────────────────────────────
  const empresas = await prisma.company.findMany({
    select: { id: true, name: true, cnpj: true, cpf: true, status: true, tenantId: true },
  });
  const invalidas = empresas.filter((e) => cnpjInvalido(e.cnpj) || empresaDeTeste(e));
  console.log(`Empresas cadastradas: ${empresas.length}`);
  console.log(`Com CNPJ inválido ou nome de teste sem documento: ${invalidas.length}\n`);

  for (const e of invalidas) {
    const v = await vinculosDaEmpresa(prisma, e.id);
    const acao = v.length === 0 ? "APAGAR" : e.status === "INACTIVE" ? "nada (já inativa)" : "INATIVAR";
    const motivo = cnpjInvalido(e.cnpj)
      ? `CNPJ "${e.cnpj}" (${digitos(e.cnpj).length} dígitos)`
      : "nome de teste, sem CNPJ e sem CPF";
    console.log(`  [${acao}] ${e.name} — ${motivo}`);
    if (v.length > 0) console.log(`      segurada por: ${descreve(v)}`);
    if (acao === "APAGAR") acoes.push(`apagar empresa ${e.id} (${e.name})`);
    if (acao === "INATIVAR") acoes.push(`inativar empresa ${e.id} (${e.name})`);

    if (aplicar) {
      if (acao === "APAGAR") await prisma.company.delete({ where: { id: e.id } });
      if (acao === "INATIVAR") await prisma.company.update({ where: { id: e.id }, data: { status: "INACTIVE" } });
    }
  }

  // ─── 2. Ficha de pessoa de teste ──────────────────────────────────────────
  const lixo = await prisma.person.findMany({
    where: { name: { in: ["asdasd", "asdasd "] } },
    select: { id: true, name: true, active: true },
  });
  console.log(`\nFichas de pessoa de teste: ${lixo.length}`);
  for (const p of lixo) {
    const v = await vinculosDaPessoa(prisma, p.id);
    const acao = v.length === 0 ? "APAGAR" : p.active ? "INATIVAR" : "nada (já inativa)";
    console.log(`  [${acao}] ${p.name} (${p.id})`);
    if (v.length > 0) console.log(`      segurada por: ${descreve(v)}`);
    if (acao !== "nada (já inativa)") acoes.push(`${acao.toLowerCase()} pessoa ${p.id}`);

    if (aplicar) {
      if (acao === "APAGAR") await prisma.person.delete({ where: { id: p.id } });
      if (acao === "INATIVAR") await prisma.person.update({ where: { id: p.id }, data: { active: false } });
    }
  }

  // ─── 3. Nome truncado da matriz ───────────────────────────────────────────
  const truncadas = empresas.filter((e) => e.name.length === 40 && !/Filial/i.test(e.name));
  console.log(`\nNomes com cara de truncado (40 caracteres): ${truncadas.length}`);
  for (const e of truncadas) {
    const filiais = await prisma.company.findMany({
      where: { tenantId: e.tenantId, name: { startsWith: e.name } },
      select: { id: true, name: true },
    });
    const completo = nomeDasFiliais(filiais.filter((f) => f.id !== e.id).map((f) => f.name));
    if (!completo || completo === e.name) {
      console.log(`  [nada] ${e.name} — sem filial que revele o nome inteiro`);
      continue;
    }
    console.log(`  [RENOMEAR] "${e.name}"\n             → "${completo}"`);
    acoes.push(`renomear empresa ${e.id}`);
    if (aplicar) {
      await prisma.company.updateMany({ where: { id: e.id, name: e.name }, data: { name: completo } });
    }
  }

  console.log("");
  if (acoes.length === 0) {
    console.log("Nada a fazer.");
  } else if (!aplicar) {
    console.log(`--- simulação: ${acoes.length} ação(ões) pendente(s), nada foi escrito. Rode com --aplicar. ---`);
  } else {
    console.log(`Feito: ${acoes.length} ação(ões).`);
  }
  await prisma.$disconnect();
}

main();
