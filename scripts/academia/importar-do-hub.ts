// Importa para a Academia do Connect o histórico do 41 Hub (10/11/2026,
// pedido do Kauan): textos de digitação, questões de lógica e os resultados,
// como resultados valendo no mês em que foram feitos. Uma vez só — o Hub
// segue no ar como está.
//
//   1. No banco do Hub:  psql "<url do Hub>" -f scripts/academia/exportar-do-hub.sql
//      (gera typing_texts.csv, logic_questions.csv, typing_scores.csv,
//      logic_scores.csv e users.csv na pasta atual)
//   2. Prévia:  npx tsx --env-file=.env scripts/academia/importar-do-hub.ts --pasta=C:\caminho\dos\csv
//   3. Grava:   npx tsx --env-file=.env scripts/academia/importar-do-hub.ts --pasta=C:\caminho\dos\csv --aplicar
//
// **A prévia é o padrão.** Sem `--aplicar`, só imprime o resumo.
//
// - Escritório: o 41 Tech, o mesmo de `scripts/importar-usuarios-hub.ts`;
//   outro com `--tenant=<id>`.
// - Pessoas casam pelo e-mail com a equipe do escritório. Quem não casa fica
//   de fora; o resumo diz só quantos e-mails ficaram sem par.
// - Idempotente: cada texto, questão e resultado leva o id do Hub
//   (`origemHubId`, único por escritório). Rodar de novo não duplica.
// - Questões com imagem entram desligadas e sem a imagem (ela mora no
//   servidor do Hub); reenvie a imagem pela Academia e ligue a questão.
// - Nada de dado pessoal no terminal: só contagens. Os CSVs têm e-mail — guarde
//   fora do repositório e apague depois.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { ARQUIVOS_DO_HUB, lerCsvDoHub, planejarImportacao, resumoEmLinhas, type PessoaDoConnect } from "../../src/lib/academia/importacao";

const TENANT_PADRAO = "11a68cef-dbc0-4377-a54a-5071ffa59747";
const LOTE = 500;

function argumento(nome: string): string | null {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
}

async function lerArquivo(pasta: string, nome: string): Promise<string> {
  try {
    return await readFile(path.join(pasta, nome), "utf8");
  } catch {
    throw new Error(`Não achei ${nome} na pasta indicada. Rode antes o exportar-do-hub.sql no banco do Hub.`);
  }
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const pasta = argumento("pasta");
  const tenantId = argumento("tenant") ?? TENANT_PADRAO;
  if (!pasta) throw new Error("Informe a pasta dos CSVs: --pasta=C:\\caminho\\dos\\csv");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida (rode com --env-file=.env).");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    if (!tenant) throw new Error("Escritório não encontrado. Confira o --tenant.");

    const [textos, questoes, digitacao, logica, usuariosDoHub] = await Promise.all(
      [ARQUIVOS_DO_HUB.textos, ARQUIVOS_DO_HUB.questoes, ARQUIVOS_DO_HUB.digitacao, ARQUIVOS_DO_HUB.logica, ARQUIVOS_DO_HUB.usuarios].map(
        async (nome) => lerCsvDoHub(await lerArquivo(pasta, nome)),
      ),
    );

    // A equipe do escritório, por e-mail (o setor gravado com o resultado é o primeiro da pessoa).
    const pessoas = await prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true, sectors: { select: { sectorCode: true } } } });
    const pessoasPorEmail = new Map<string, PessoaDoConnect>(
      pessoas.map((p) => [p.email.trim().toLowerCase(), { id: p.id, sectorCode: p.sectors.map((s) => s.sectorCode).sort()[0] ?? null }]),
    );

    const [textosJa, questoesJa, resultadosJa] = await Promise.all([
      prisma.academiaTexto.findMany({ where: { tenantId, origemHubId: { not: null } }, select: { origemHubId: true } }),
      prisma.academiaQuestao.findMany({ where: { tenantId, origemHubId: { not: null } }, select: { origemHubId: true } }),
      prisma.academiaResultado.findMany({ where: { tenantId, origemHubId: { not: null } }, select: { origemHubId: true } }),
    ]);
    const ids = (linhas: { origemHubId: string | null }[]) => new Set(linhas.flatMap((l) => (l.origemHubId ? [l.origemHubId] : [])));

    const plano = planejarImportacao({
      textos, questoes, digitacao, logica, usuariosDoHub, pessoasPorEmail,
      jaImportados: { textos: ids(textosJa), questoes: ids(questoesJa), resultados: ids(resultadosJa) },
    });

    console.log(`Escritório: ${tenant.name}`);
    for (const linha of resumoEmLinhas(plano.resumo)) console.log(`  ${linha}`);

    if (!aplicar) {
      console.log("\n--- prévia: nada foi gravado. Rode com --aplicar para importar. ---");
      return;
    }

    // `skipDuplicates`: se outra execução gravou no meio, a chave única
    // (tenantId, origemHubId) segura a repetição.
    let gravados = 0;
    for (let i = 0; i < plano.textos.length; i += LOTE) {
      const r = await prisma.academiaTexto.createMany({
        data: plano.textos.slice(i, i + LOTE).map((t) => ({ tenantId, nivel: t.nivel, conteudo: t.conteudo, ativo: t.ativo, origemHubId: t.origemHubId })),
        skipDuplicates: true,
      });
      gravados += r.count;
    }
    console.log(`\nTextos gravados: ${gravados}`);

    gravados = 0;
    for (let i = 0; i < plano.questoes.length; i += LOTE) {
      const r = await prisma.academiaQuestao.createMany({
        data: plano.questoes.slice(i, i + LOTE).map((q) => ({
          tenantId, nivel: q.nivel, enunciado: q.enunciado, alternativas: q.alternativas, correta: q.correta, ativo: q.ativo, origemHubId: q.origemHubId,
        })),
        skipDuplicates: true,
      });
      gravados += r.count;
    }
    console.log(`Questões gravadas: ${gravados}`);

    gravados = 0;
    for (let i = 0; i < plano.resultados.length; i += LOTE) {
      const r = await prisma.academiaResultado.createMany({
        data: plano.resultados.slice(i, i + LOTE).map((r) => ({
          tenantId, userId: r.userId, sectorCode: r.sectorCode, teste: r.teste, nivel: r.nivel, mes: r.mes,
          ppm: r.ppm, acertos: r.acertos, total: r.total, precisao: r.precisao, duracaoMs: r.duracaoMs,
          valendo: true, origem: "hub", origemHubId: r.origemHubId, createdAt: r.createdAt,
        })),
        skipDuplicates: true,
      });
      gravados += r.count;
    }
    console.log(`Resultados gravados: ${gravados}`);
    console.log("\nPronto. Ligue a Academia em Configurações › Setores e módulos (no Tech), se ainda não ligou.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // Só a mensagem: o erro do driver pode trazer a URL do banco.
  console.error(`Falhou: ${e instanceof Error ? e.message.split("\n")[0] : "erro"}`);
  process.exit(1);
});
