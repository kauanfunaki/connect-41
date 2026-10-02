// Dados de exemplo no escritório "Teste" da PRODUÇÃO (02/10/2026) — decisão do
// Kauan: o Marcos entra no Teste para ver o Valora, a Gestão e o resto do
// Connect com informação. O conteúdo é o de `dados-de-exemplo/gerador.ts`, tudo
// inventado, menos as reuniões (sem Google; e o alerta de reunião apareceria
// para quem administra o escritório).
//
// Quem roda é o Kauan, na máquina dele (o `.env` aponta para a produção):
//
//   npx tsx scripts/dados-de-exemplo-no-teste.ts --escritorio <slug>            (só mostra)
//   npx tsx scripts/dados-de-exemplo-no-teste.ts --escritorio <slug> --aplicar  (grava)
//
// Travas: o escritório precisa se chamar "Teste" — qualquer outro é recusado,
// mesmo com o slug certo de outro —, nada é gravado sem `--aplicar`, e se as
// empresas de exemplo já estão lá, não faz nada (não duplica).
//
// Cuidados no Teste: as rotinas automáticas (alertas da Gestão, lembretes)
// rodam para ele como para qualquer escritório; os e-mails são todos
// @exemplo.invalido, então nada chega a ninguém. Para o Marcos entrar, ele
// precisa de um usuário no Teste (Administração › Usuários).

import { getPrisma } from "../src/lib/prisma";
import { carregarDadosDeExemplo, FONTE } from "./dados-de-exemplo/gerador";

const NOME_EXIGIDO = "teste";

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const slug = argumento("--escritorio");
  const aplicar = process.argv.includes("--aplicar");
  const p = getPrisma();
  if (!slug) {
    const teste = await p.tenant.findMany({ where: { name: { contains: "Teste" } }, select: { slug: true, name: true } });
    console.log("Informe --escritorio <slug>. Escritórios com \"Teste\" no nome:");
    for (const t of teste) console.log(`  ${t.slug}  (${t.name})`);
    return;
  }

  const tenant = await p.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Escritório "${slug}" não encontrado.`);
  if (tenant.name.trim().toLowerCase() !== NOME_EXIGIDO) {
    throw new Error(`Recusado: "${tenant.name}" não é o escritório Teste. Este script só grava no Teste.`);
  }
  if (await p.company.findFirst({ where: { tenantId: tenant.id, source: FONTE }, select: { id: true } })) {
    console.log(`Os dados de exemplo já estão no escritório "${tenant.name}". Nada a fazer.`);
    return;
  }
  const temModelos = (await p.processType.count({ where: { tenantId: tenant.id } })) > 0;
  console.log(`Escritório: ${tenant.name} (${slug})`);
  console.log(`Modelos de processo do Societário: ${temModelos ? "sim — entram os processos" : "não — os processos ficam de fora (rode scripts/seed-societario.ts antes, se quiser)"}`);
  if (!aplicar) {
    console.log("\nNada foi gravado. Para carregar: acrescente --aplicar.");
    return;
  }
  await carregarDadosDeExemplo(p, tenant.id, { reunioes: false });
  console.log(`\nPronto: dados de exemplo no escritório "${tenant.name}".`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
