// Dá a cada conta de acesso (User) a sua ficha de colaborador (Person).
//
//   npx tsx --env-file=.env scripts/criar-pessoas-dos-usuarios.ts            # dry-run
//   npx tsx --env-file=.env scripts/criar-pessoas-dos-usuarios.ts --aplicar
//
// **Dry-run é o padrão.**
//
// ─── Por que isto existe ─────────────────────────────────────────────────────
//
// `User` e `Person` são coisas diferentes de propósito: User é login e
// permissão, Person é a ficha de gente (dados, férias, documentos, escala). Mas
// `/pessoas` e `/admin/atendentes` listam **Person**, não User — então quem só
// tem conta de acesso não aparece em nenhuma das duas telas.
//
// Medido em 2026-09-03 no tenant 41 Tech: **45 usuários e 3 pessoas internas**,
// 44 contas sem ficha. Isso é anterior à importação do Hub — os 15 cadastros
// que já existiam também estavam de fora. A importação só deixou o buraco
// grande o bastante para aparecer.
//
// ─── O que ele NÃO faz ───────────────────────────────────────────────────────
//
// Não cria ficha para conta cujo nome já pertence a uma Person vinculada a
// OUTRO usuário. Isso é gente com duas contas (uma pessoal, uma corporativa), e
// `Person.linkedUserId` é único: a segunda ficha seria um clone da pessoa, não
// um colega novo. Esses casos saem listados para decidir à mão.
//
// Não aproxima nomes: casamento é exato depois de normalizar espaço e caixa.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { normalizarNomeAtendente } from "../src/lib/chatwoot/evaluation";

const aplicar = process.argv.includes("--aplicar");
const TENANT_41_TECH = "11a68cef-dbc0-4377-a54a-5071ffa59747";

// Contas que não são pessoa e não devem virar ficha de colaborador.
const IGNORAR_EMAIL = new Set(["teste@41contabil.com.br", "teste@41tech.local"]);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const [usuarios, pessoas] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: TENANT_41_TECH },
      select: { id: true, name: true, email: true, active: true, linkedPerson: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.person.findMany({
      where: { tenantId: TENANT_41_TECH },
      select: { id: true, name: true, type: true, isInternal: true, linkedUserId: true },
    }),
  ]);

  const pessoaPorNome = new Map<string, (typeof pessoas)[number][]>();
  for (const p of pessoas) {
    const chave = normalizarNomeAtendente(p.name);
    if (!chave) continue;
    pessoaPorNome.set(chave, [...(pessoaPorNome.get(chave) ?? []), p]);
  }

  const criar: { user: (typeof usuarios)[number] }[] = [];
  const ligar: { user: (typeof usuarios)[number]; pessoaId: string; pessoaNome: string }[] = [];
  const jaTem: string[] = [];
  const ignorados: string[] = [];
  const segundaConta: string[] = [];
  const ambiguas: string[] = [];

  for (const u of usuarios) {
    if (u.linkedPerson) {
      jaTem.push(u.email);
      continue;
    }
    if (IGNORAR_EMAIL.has(u.email.toLowerCase())) {
      ignorados.push(`${u.email} — conta de teste`);
      continue;
    }

    const chave = normalizarNomeAtendente(u.name);
    // Só ficha de colaborador INTERNO conta como "a ficha dessa pessoa".
    //
    // O mesmo nome aparece na base como candidato de vaga e como colaborador de
    // empresa cliente — há três "Gabriela Amaral", duas delas candidatas, e a
    // "Kauan Funaki" livre é colaboradora de cliente e inativa. Pegar a primeira
    // linha livre por nome ligaria a conta de acesso de um colega à ficha de um
    // candidato, e ainda a marcaria como interna.
    const candidatas = (chave ? pessoaPorNome.get(chave) ?? [] : []).filter(
      (p) => p.isInternal && p.type === "COLABORADOR"
    );
    const livres = candidatas.filter((p) => p.linkedUserId === null);

    if (livres.length === 1) {
      ligar.push({ user: u, pessoaId: livres[0]!.id, pessoaNome: livres[0]!.name });
    } else if (livres.length > 1) {
      ambiguas.push(`${u.email} (${u.name}) — ${livres.length} fichas internas livres com este nome`);
    } else if (candidatas.length > 0) {
      segundaConta.push(`${u.email} (${u.name}) — a ficha interna já é de outra conta`);
    } else {
      criar.push({ user: u });
    }
  }

  console.log(`${usuarios.length} contas · ${pessoas.length} fichas no tenant\n`);
  console.log(`CRIAR FICHA (${criar.length}):`);
  for (const c of criar) {
    console.log(`  ${c.user.email.padEnd(38)} ${c.user.name.padEnd(26)} ${c.user.active ? "ativo" : "INATIVO"}`);
  }
  if (ligar.length) {
    console.log(`\nLIGAR À FICHA QUE JÁ EXISTE (${ligar.length}):`);
    for (const l of ligar) console.log(`  ${l.user.email.padEnd(38)} → ficha "${l.pessoaNome}"`);
  }
  if (jaTem.length) console.log(`\nJÁ TÊM FICHA (${jaTem.length}): ${jaTem.join(", ")}`);
  if (ignorados.length) console.log(`\nIGNORADOS (${ignorados.length}): ${ignorados.join(", ")}`);
  if (ambiguas.length) {
    console.log(`
AMBÍGUAS — decidir à mão (${ambiguas.length}):`);
    for (const a of ambiguas) console.log(`  ? ${a}`);
  }
  if (segundaConta.length) {
    console.log(`\nSEGUNDA CONTA DA MESMA PESSOA — decidir à mão (${segundaConta.length}):`);
    for (const s of segundaConta) console.log(`  ? ${s}`);
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar. ---");
    await prisma.$disconnect();
    return;
  }

  for (const l of ligar) {
    await prisma.person.update({
      where: { id: l.pessoaId },
      data: { linkedUserId: l.user.id },
    });
  }

  for (const c of criar) {
    await prisma.person.create({
      data: {
        tenantId: TENANT_41_TECH,
        name: c.user.name,
        email: c.user.email,
        type: "COLABORADOR",
        // Interno: é gente da 41, não colaborador de empresa cliente — é isso
        // que faz aparecer em /pessoas e em /admin/atendentes.
        isInternal: true,
        // Segue a conta: desativar o acesso e deixar a ficha ativa mostraria na
        // listagem alguém que não trabalha mais aqui.
        active: c.user.active,
        // ATIVO, não o default ADMISSAO_EM_ANDAMENTO: são pessoas que já
        // trabalham na 41 há tempo. O default existe para admissão de verdade,
        // que passa pelo fluxo do DP.
        employmentStatus: "ATIVO",
        linkedUserId: c.user.id,
      },
    });
  }

  console.log(`\n${criar.length} fichas criadas · ${ligar.length} ligadas a ficha existente.`);
  console.log("Dados de folha (cargo, admissão, salário) ficam em branco — são do DP, não do login.");
  await prisma.$disconnect();
}

main();
