// Recalcula a competência das notas gravadas pela regra antiga, em UTC (bug-473).
//
//   npx prisma generate
//   npx tsx --env-file=.env scripts/competencia-pela-data-local.ts             # só conta e lista
//   npx tsx --env-file=.env scripts/competencia-pela-data-local.ts --aplicar   # grava
//
// Contexto (11/11/2026): até o PR deste script, a competência da nota lida do
// XML saía do instante em UTC. A NF-e de 30/09 às 22h em Brasília
// (2026-10-01T01:00Z) entrava em outubro, no acervo e no SPED local. A regra
// agora é o dia local da emissão (`competenciaDaEmissao` em
// src/lib/fiscal/documentos.ts). Este script corrige o que entrou antes.
//
// Ordem: rodar sem `--aplicar` e conferir a lista; depois `--aplicar`; só então
// o deploy. Com o código novo no ar e as notas antigas sem recalcular, o acervo
// e o SPED local discordariam na virada do mês.
//
// ── 1. Acervo: notas que subiram pela tela de entrada ───────────────────────
//
// `origin = UPLOAD` com hora (o SPED local grava só a data, à meia-noite UTC; ver
// a parte 2). Só podem estar erradas as notas com `issuedAt` no dia 1 entre
// 00:00 e 04:59 UTC (21h a meia-noite do último dia, em -03:00 a -05:00) e
// cuja competência é o mês desse instante em UTC. O XML não fica guardado no
// upload, então o dia local sai do instante em Brasília (-03:00), o fuso da
// quase totalidade das notas do escritório.
//
// Ficam de fora, só listadas, para conferir à mão:
// - NFS-e: a competência pode ter vindo declarada no XML, e a dedupKey dela
//   leva a competência;
// - nota já lançada no financeiro: a conta copiou a competência (estorne e
//   corrija pela tela, como a edição exige);
// - nota corrigida à mão (`editedAt`): alguém já decidiu a competência.
//
// ── 2. SPED local: notas importadas na Estação SPED ─────────────────────────
//
// O SPED local guardou a data em UTC sem a hora (`data.emitidoEm` em
// `sped_fiscal_documents`), então o próprio registro não diz se a nota com data
// do dia 1 é do dia 1 ou das 21h–meia-noite do dia anterior. Quem diz é a mesma
// nota no acervo vinda do motor (`origin = SPED`): o motor corta o `dhEmi` no
// fuso da nota (nfe_xml.py/cte_xml.py do sped_generator). Se o acervo diz o mês
// anterior, a nota do SPED local está errada e é corrigida: a data e a
// competência do registro e a competência da escrituração (`sped_fiscal_books`).
// Nota sem par no acervo e NFS-e (a identidade dela leva a competência) só são
// listadas.
//
// Na primeira contagem (11/11/2026, produção) foram 0 na parte 1 e 32 notas do
// dia 1 na parte 2, todas com o acervo do motor confirmando 01/10: nada a gravar.

import { getPrisma } from "../src/lib/prisma";

const aplicar = process.argv.includes("--aplicar");

type CandidataAcervo = {
  id: string;
  tenantId: string;
  companyId: string;
  type: string;
  number: string;
  issuedAt: Date;
  competence: string;
  editedAt: Date | null;
  lancamentos: bigint | number;
};

/** "AAAA-MM-DD" do instante em Brasília. */
function diaEmBrasilia(instante: Date): string {
  return instante.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function main() {
  const prisma = getPrisma();
  console.log(aplicar ? "Modo: APLICAR (grava)\n" : "Modo: só leitura (rode com --aplicar para gravar)\n");

  // ── Parte 1 ──
  const candidatas = await prisma.$queryRaw<CandidataAcervo[]>`
    SELECT d.id, d.tenantId, d.companyId, d.type, d.number, d.issuedAt, d.competence, d.editedAt,
           (SELECT COUNT(*) FROM finance_entries f WHERE f.fiscalDocumentId = d.id) AS lancamentos
      FROM fiscal_documents d
     WHERE d.origin = 'UPLOAD'
       AND DAYOFMONTH(d.issuedAt) = 1
       AND HOUR(d.issuedAt) < 5
       AND TIME(d.issuedAt) <> '00:00:00'
       AND d.competence = DATE_FORMAT(d.issuedAt, '%Y-%m')`;

  const corrigir: { id: string; tenantId: string; de: string; para: string; numero: string; tipo: string; emissao: string }[] = [];
  const conferir: { motivo: string; id: string; numero: string; tipo: string; emissao: string; competencia: string }[] = [];

  for (const c of candidatas) {
    const dia = diaEmBrasilia(c.issuedAt);
    const para = dia.slice(0, 7);
    if (para === c.competence) continue; // emitida no dia 1 depois da meia-noite: já está certa
    const linha = { id: c.id, numero: c.number, tipo: c.type, emissao: c.issuedAt.toISOString(), competencia: c.competence };
    if (c.type === "NFSE") { conferir.push({ motivo: "NFS-e (competência pode ser a declarada)", ...linha }); continue; }
    if (Number(c.lancamentos) > 0) { conferir.push({ motivo: "já lançada no financeiro", ...linha }); continue; }
    if (c.editedAt) { conferir.push({ motivo: "corrigida à mão", ...linha }); continue; }
    corrigir.push({ id: c.id, tenantId: c.tenantId, de: c.competence, para, numero: c.number, tipo: c.type, emissao: c.issuedAt.toISOString() });
  }

  console.log(`Parte 1 · acervo (subidas pela tela de entrada)`);
  console.log(`  candidatas pela hora: ${candidatas.length}`);
  console.log(`  a corrigir: ${corrigir.length}`);
  for (const c of corrigir) console.log(`    ${c.tipo} nº ${c.numero}  emissão ${c.emissao}  ${c.de} → ${c.para}  (${c.id})`);
  console.log(`  para conferir à mão: ${conferir.length}`);
  for (const c of conferir) console.log(`    [${c.motivo}] ${c.tipo} nº ${c.numero}  emissão ${c.emissao}  competência ${c.competencia}  (${c.id})`);

  if (aplicar && corrigir.length) {
    let gravadas = 0;
    for (const c of corrigir) {
      // A condição repete a competência lida: se alguém mudou a nota no meio, não sobrescreve.
      const r = await prisma.fiscalDocument.updateMany({ where: { id: c.id, tenantId: c.tenantId, competence: c.de }, data: { competence: c.para } });
      gravadas += r.count;
    }
    console.log(`  gravadas: ${gravadas}`);
  }

  // ── Parte 2 ──
  const sped = await prisma.$queryRaw<{ id: string; tenantId: string; identity: string; emitidoEm: string; competencia: string; acervoEmissao: Date | null; acervoCompetencia: string | null }[]>`
    SELECT s.id, s.tenantId, s.identity,
           JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.emitidoEm')) AS emitidoEm,
           JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.competencia')) AS competencia,
           d.issuedAt AS acervoEmissao, d.competence AS acervoCompetencia
      FROM sped_fiscal_documents s
      LEFT JOIN fiscal_documents d ON d.tenantId = s.tenantId AND d.dedupKey = s.identity AND d.origin = 'SPED'
     WHERE JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.fonte')) = 'xml'
       AND JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.emitidoEm')) LIKE '%-01'
       AND LEFT(JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.emitidoEm')), 7) = JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.competencia'))`;

  const confirmadas = sped.filter((s) => s.acervoCompetencia === s.competencia);
  const erradas = sped.filter((s) => s.acervoCompetencia && s.acervoCompetencia < s.competencia && /^\d{44}$/.test(s.identity));
  const semPar = sped.filter((s) => !confirmadas.includes(s) && !erradas.includes(s));

  console.log(`\nParte 2 · SPED local (importadas por XML, data do dia 1)`);
  console.log(`  notas do dia 1: ${sped.length}`);
  console.log(`  confirmadas pelo acervo do motor (estão certas): ${confirmadas.length}`);
  console.log(`  a corrigir: ${erradas.length}`);
  for (const s of erradas) console.log(`    ${s.identity}  ${s.emitidoEm} → ${s.acervoEmissao?.toISOString().slice(0, 10)}  ${s.competencia} → ${s.acervoCompetencia}`);
  console.log(`  para conferir à mão (sem par no acervo do motor, ou NFS-e): ${semPar.length}`);
  for (const s of semPar) console.log(`    ${s.identity}  ${s.emitidoEm}  competência ${s.competencia}  acervo ${s.acervoCompetencia ?? "—"}`);

  if (aplicar && erradas.length) {
    let gravadas = 0;
    for (const s of erradas) {
      const dia = s.acervoEmissao!.toISOString().slice(0, 10);
      await prisma.$transaction(async (tx) => {
        const r = await tx.$executeRaw`
          UPDATE sped_fiscal_documents
             SET data = JSON_SET(data, '$.emitidoEm', ${dia}, '$.competencia', ${s.acervoCompetencia})
           WHERE id = ${s.id} AND tenantId = ${s.tenantId}
             AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.competencia')) = ${s.competencia}`;
        if (r === 1) {
          await tx.spedFiscalBook.updateMany({ where: { tenantId: s.tenantId, documentId: s.id, competence: s.competencia }, data: { competence: s.acervoCompetencia! } });
          gravadas += 1;
        }
      });
    }
    console.log(`  gravadas: ${gravadas}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
