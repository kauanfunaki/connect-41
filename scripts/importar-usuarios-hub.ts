// Cadastra no Connect os usuários que já existem no 41 Tech Hub.
//
//   npx tsx --env-file=.env scripts/importar-usuarios-hub.ts            # dry-run
//   npx tsx --env-file=.env scripts/importar-usuarios-hub.ts --aplicar
//
// **Dry-run é o padrão.** Sem `--aplicar` ele só imprime o que faria.
//
// Idempotente por e-mail: quem já existe no tenant **não é tocado**. Isso é
// deliberado e não preguiça — os 15 cadastros que já estavam no Connect têm
// papel e setores mais ricos do que o Hub sabe (o Hub diz "Tech" para quem aqui
// é SUPER_ADMIN de tudo). Sobrescrever com o dado do Hub seria rebaixar gente.
//
// ─── Senha ───────────────────────────────────────────────────────────────────
//
// Cada conta nasce com uma senha **aleatória de 32 bytes que ninguém vê** — é
// gerada, cifrada e descartada dentro deste processo. Não existe senha padrão,
// não há segredo compartilhado no código e o script não imprime nenhuma.
//
// A pessoa entra pela primeira vez por "Esqueci minha senha" em /login, que
// manda o link por e-mail. O tenant 41 Tech tem SMTP configurado
// (`noreply@41tech.com.br`), conferido antes de escrever isto — sem isso o
// caminho não fecharia e o script não teria como entregar acesso a ninguém.
//
// ─── Papel ───────────────────────────────────────────────────────────────────
//
// Todo mundo entra como SECTOR_USER. O Hub não exporta papel, e chutar
// permissão para cima a partir do nome do setor é o tipo de erro que só aparece
// quando alguém já viu o que não devia. Promover é uma tela; despromover depois
// de vazar não desfaz nada.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password";

const aplicar = process.argv.includes("--aplicar");
const TENANT_41_TECH = "11a68cef-dbc0-4377-a54a-5071ffa59747";

// Contas que existem no Hub e não devem virar cadastro aqui.
const IGNORAR_EMAIL = new Set(["teste@41tech.local"]);

/**
 * Rótulo de setor do Hub → código de setor do Connect.
 *
 * Dois pontos que não são tradução direta:
 *
 * - **"Departamento Pessoal" e "Recursos Humanos" caem no mesmo `dprh`.** O
 *   Connect tem um setor só para os dois, rotulado "DP / RH". Não são setores
 *   distintos aqui.
 * - **"Sócios" vira `gestao`.** É o mais próximo que existe, e é como a Tatiane
 *   (a única pessoa com "Sócios" no Hub que já está no Connect) foi cadastrada
 *   à mão. Se a intenção for um setor separado, ele precisa ser criado antes —
 *   este script não inventa setor.
 */
const SETOR_HUB_PARA_CONNECT: Record<string, string> = {
  "BPO": "bpo",
  "Comercial": "comercial",
  "Contábil": "contabil",
  "Departamento Pessoal": "dprh",
  "Recursos Humanos": "dprh",
  "Financeiro": "financeiro",
  "Fiscal": "fiscal",
  "Recrutamento": "recrutamento",
  "Societário": "societario",
  "Sócios": "gestao",
  "Tech": "tech",
};

type UsuarioHub = {
  name: string;
  email: string;
  isActive: string;
  sectors: string;
};

const USUARIOS_HUB: UsuarioHub[] = [
  { name: "Amanda Almeida", email: "coordenacao@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Ana Cecilia", email: "societario4@41contabil.com.br", isActive: "Sim", sectors: "Societário" },
  { name: "Ana Paula Mordaski", email: "financeiro1@41contabil.com.br", isActive: "Sim", sectors: "Financeiro" },
  { name: "Célia Regina", email: "contabil@41contabil.com.br", isActive: "Não", sectors: "Contábil" },
  { name: "Claudemir Cardoso", email: "controladoria@41contabil.com.br", isActive: "Sim", sectors: "Tech" },
  { name: "Dani", email: "adm8@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Daniel Tararan", email: "comercial3@41contabil.com.br", isActive: "Sim", sectors: "Comercial" },
  { name: "Débora Leite", email: "fiscal1@41contabil.com.br", isActive: "Sim", sectors: "Fiscal" },
  { name: "Djanane Paixão", email: "contabilidade@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Eduarda Ramos", email: "recrutamento3@41tallent.com.br", isActive: "Sim", sectors: "Recrutamento" },
  { name: "Elaine Bernardi", email: "rh1@41contabil.com.br", isActive: "Sim", sectors: "Departamento Pessoal" },
  { name: "Elaine Jaques", email: "fiscal2@41contabil.com.br", isActive: "Sim", sectors: "Fiscal" },
  { name: "Felipe Augusto Marcondes", email: "contabil1@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Gabriela Amaral", email: "controladoria3@41contabil.com.br", isActive: "Sim", sectors: "Tech" },
  { name: "Gabriel Muniz", email: "contabil9@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Gabriel Santos", email: "comercial2@41contabil.com.br", isActive: "Sim", sectors: "Comercial" },
  { name: "Hamilton", email: "comercial5@41contabil.com.br", isActive: "Sim", sectors: "Comercial" },
  { name: "Heloá", email: "adm7@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Katia", email: "fiscal5@41contabil.com.br", isActive: "Sim", sectors: "Fiscal" },
  { name: "Kauan Funaki", email: "adm6@41bpo.com.br", isActive: "Sim", sectors: "Tech" },
  { name: "Kauan Funaki", email: "kauanfunaki.41@gmail.com", isActive: "Sim", sectors: "BPO, Comercial, Contábil, Departamento Pessoal, Financeiro, Fiscal, Recrutamento, Recursos Humanos, Societário, Sócios, Tech" },
  { name: "Kelly Cajuhy", email: "rh5@41contabil.com.br", isActive: "Não", sectors: "Departamento Pessoal" },
  { name: "Kelly Sousa", email: "contabil10@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Larissa Antunes", email: "recrutamento@41contabil.com.br", isActive: "Sim", sectors: "Recrutamento" },
  { name: "Lucca Maeoka", email: "lucca@41contabil.com.br", isActive: "Sim", sectors: "Tech" },
  { name: "Lucelaine", email: "adm3@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Matheus Moreira", email: "contabil6@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Nathan", email: "ia@41contabil.com.br", isActive: "Sim", sectors: "BPO, Comercial, Contábil, Departamento Pessoal, Financeiro, Fiscal, Recrutamento, Recursos Humanos, Societário, Sócios, Tech" },
  { name: "Nathan Maciel", email: "comercial6@41contabil.com.br", isActive: "Sim", sectors: "Tech" },
  { name: "Osmário Oliveira", email: "fiscal8@41contabil.com.br", isActive: "Não", sectors: "Fiscal" },
  { name: "Paula Cristina", email: "contabil3@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Renata Ferens", email: "financeiro@41contabil.com.br", isActive: "Sim", sectors: "Financeiro" },
  { name: "Ruli", email: "societario@41contabil.com.br", isActive: "Sim", sectors: "Societário" },
  { name: "Samuel Lopes", email: "fiscal4@41contabil.com.br", isActive: "Sim", sectors: "Fiscal" },
  { name: "Sidineia", email: "contabil2@41contabil.com.br", isActive: "Sim", sectors: "Contábil" },
  { name: "Suellen", email: "adm4@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Talita Souza", email: "societario3@41contabil.com.br", isActive: "Sim", sectors: "Societário" },
  { name: "Tatiane Camargo", email: "gerencia@41contabil.com.br", isActive: "Sim", sectors: "BPO, Comercial, Contábil, Departamento Pessoal, Financeiro, Fiscal, Recrutamento, Recursos Humanos, Societário, Sócios" },
  { name: "Teste", email: "teste@41tech.local", isActive: "Sim", sectors: "BPO" },
  { name: "Thais", email: "adm9@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Vitória", email: "adm5@41bpo.com.br", isActive: "Sim", sectors: "BPO" },
  { name: "Wagner Oliveira", email: "fiscal@41contabil.com.br", isActive: "Sim", sectors: "Fiscal" },
  { name: "Wellington", email: "rh3@41contabil.com.br", isActive: "Sim", sectors: "Departamento Pessoal" },
];

function codigosDeSetor(hub: string): { codigos: string[]; naoMapeados: string[] } {
  const rotulos = hub.split(",").map((s) => s.trim()).filter(Boolean);
  const codigos = new Set<string>();
  const naoMapeados: string[] = [];
  for (const r of rotulos) {
    const codigo = SETOR_HUB_PARA_CONNECT[r];
    if (codigo) codigos.add(codigo);
    else naoMapeados.push(r);
  }
  return { codigos: [...codigos].sort(), naoMapeados };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const setoresDoTenant = new Set(
    (await prisma.sector.findMany({ where: { tenantId: TENANT_41_TECH }, select: { code: true } })).map((s) => s.code)
  );
  const existentes = new Map(
    (await prisma.user.findMany({ where: { tenantId: TENANT_41_TECH }, select: { email: true, name: true } })).map(
      (u) => [u.email.toLowerCase(), u.name]
    )
  );

  const criar: { hub: UsuarioHub; codigos: string[] }[] = [];
  const jaExistem: string[] = [];
  const ignorados: string[] = [];
  const avisos: string[] = [];

  for (const hub of USUARIOS_HUB) {
    const email = hub.email.toLowerCase();
    if (IGNORAR_EMAIL.has(email)) {
      ignorados.push(`${hub.email} — conta de teste`);
      continue;
    }
    const nomeExistente = existentes.get(email);
    if (nomeExistente !== undefined) {
      jaExistem.push(`${hub.email} (${nomeExistente})`);
      if (nomeExistente !== hub.name) {
        avisos.push(`nome divergente em ${hub.email}: Connect "${nomeExistente}" × Hub "${hub.name}" — mantido o do Connect`);
      }
      continue;
    }

    const { codigos, naoMapeados } = codigosDeSetor(hub.sectors);
    for (const r of naoMapeados) avisos.push(`setor sem mapeamento em ${hub.email}: "${r}" — a pessoa entra sem ele`);
    const inexistentes = codigos.filter((c) => !setoresDoTenant.has(c));
    for (const c of inexistentes) avisos.push(`setor "${c}" não existe no tenant — ignorado em ${hub.email}`);

    criar.push({ hub, codigos: codigos.filter((c) => setoresDoTenant.has(c)) });
  }

  console.log(`Tenant 41 Tech · ${USUARIOS_HUB.length} no Hub · ${existentes.size} já no Connect\n`);
  console.log(`A CRIAR (${criar.length}):`);
  for (const { hub, codigos } of criar) {
    const situacao = hub.isActive === "Sim" ? "ativo" : "INATIVO";
    console.log(`  ${hub.email.padEnd(38)} ${hub.name.padEnd(26)} ${situacao.padEnd(7)} ${codigos.join("+") || "sem setor"}`);
  }
  console.log(`\nJÁ EXISTEM, não tocados (${jaExistem.length}): ${jaExistem.join(", ")}`);
  if (ignorados.length) console.log(`\nIGNORADOS (${ignorados.length}): ${ignorados.join(", ")}`);
  if (avisos.length) {
    console.log(`\nAVISOS (${avisos.length}):`);
    for (const a of avisos) console.log(`  ! ${a}`);
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar para criar. ---");
    await prisma.$disconnect();
    return;
  }

  let criados = 0;
  for (const { hub, codigos } of criar) {
    // Senha aleatória, cifrada e descartada: ninguém — nem quem roda o script —
    // fica sabendo. O acesso sai por "Esqueci minha senha".
    const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
    await prisma.user.create({
      data: {
        tenantId: TENANT_41_TECH,
        name: hub.name,
        email: hub.email,
        passwordHash,
        role: "SECTOR_USER",
        active: hub.isActive === "Sim",
        sectors: { create: codigos.map((sectorCode) => ({ sectorCode })) },
      },
    });
    criados += 1;
  }

  console.log(`\n${criados} usuários criados. Cada um precisa usar "Esqueci minha senha" em /login para definir a dele.`);
  await prisma.$disconnect();
}

main();
