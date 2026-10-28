// Robôs, sites e apps fictícios no Ops Center do banco LOCAL (28/10/2026), para
// a triagem dos chamados ter o que encontrar. Idempotente.
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/catalogo-ops.ts

import { getPrisma } from "../../src/lib/prisma";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@invalido/x");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("Recusado: só roda no banco local.");
  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: "41tech" }, select: { id: true } });
  if (!tenant) throw new Error("Rode o seed antes.");
  const tenantId = tenant.id;
  await p.tenantModule.upsert({ where: { tenantId_moduleCode: { tenantId, moduleCode: "tech_ops_center" } }, update: { enabled: true }, create: { tenantId, moduleCode: "tech_ops_center", enabled: true } });
  const tech = await p.user.findFirst({ where: { tenantId, active: true, sectors: { some: { sectorCode: "tech" } } }, select: { id: true, name: true } })
    ?? await p.user.findFirst({ where: { tenantId, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true, name: true } });
  const ownerId = tech?.id ?? null;

  const robos = [
    { slug: "conferencia-rendimentos", name: "Conferência de rendimentos de aplicações", client: "Todos os clientes", description: "Lê os informes de rendimentos de aplicações financeiras nas pastas dos clientes e monta a planilha de conferência por cliente, competência e banco, marcando documentos pendentes." },
    { slug: "dominio-xls-to-txt", name: "Domínio XLS para TXT", client: "Contábil", description: "Converte as planilhas exportadas da Domínio em TXT de importação de lançamentos." },
    { slug: "sped-cte-saidas", name: "Importação de CT-e de saída do SPED", client: "Fiscal", description: "Lê o SPED Fiscal transmitido pela Domínio, extrai as chaves de CT-e de saída e grava na base do Connect para a apuração de PIS e Cofins." },
  ];
  for (const r of robos) await p.opsWatcher.upsert({ where: { tenantId_slug: { tenantId, slug: r.slug } }, update: { ...r, ownerId }, create: { tenantId, ownerId, ...r } });
  const sites = [
    { name: "Portal de certidões", url: "https://certidoes.41tech.exemplo", description: "Emite e guarda as certidões negativas (federal, estadual, municipal e FGTS) dos clientes, com aviso de vencimento." },
    { name: "Calculadora de rescisão", url: "https://rescisao.41tech.exemplo", description: "Calcula verbas rescisórias para o DP conferir antes de lançar na folha." },
  ];
  for (const s of sites) await p.opsSite.upsert({ where: { tenantId_name: { tenantId, name: s.name } }, update: { ...s, ownerId }, create: { tenantId, ownerId, ...s } });
  const apps = [
    { name: "Connect 41", repository: "41tech/connect-41", url: "https://connect.41tech.exemplo", description: "O próprio Connect: chamados, setores, SPED, Ops Center e as telas do escritório." },
    { name: "Leitor de extratos OFX", repository: "41tech/leitor-ofx", url: null, description: "Lê extratos bancários em OFX e PDF e gera os lançamentos para a conciliação do BPO." },
  ];
  for (const a of apps) await p.opsApp.upsert({ where: { tenantId_name: { tenantId, name: a.name } }, update: { ...a, ownerId }, create: { tenantId, ownerId, ...a } });
  console.log(`Ops Center: ${robos.length} robôs, ${sites.length} sites e ${apps.length} apps (responsável: ${tech?.name ?? "nenhum"}).`);
  process.exit(0);
}
main();
