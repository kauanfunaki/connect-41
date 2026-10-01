// O que o ambiente LOCAL precisa, além do seed e da demonstração do BPO, para
// gravar os vídeos da ajuda (01/10/2026). Só roda pelo lançador:
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/preparar-ambiente.ts
//
// Idempotente: rodar de novo não duplica nada.
//
// - o setor Controladoria (a migration que o cria não roda no banco local, que
//   nasce do schema — ver README);
// - a senha de teste do cliente do portal da empresa [demo], lida de
//   LOCAL_PORTAL_PASSWORD no `.env.localdev` — nunca escrita aqui nem no chat;
// - uma segunda empresa no grupo [demo], para o vídeo de trocar de empresa;
// - um comunicado de exemplo para o cliente [demo];
// - notas fiscais fictícias, para a home do portal não abrir vazia;
// - nomes de vitrine: o administrador local vira "Camila Duarte" (fictícia — o
//   seed usa o nome do Kauan, que apareceria nos vídeos como autor das
//   pendências), as pendências ganham descrição de verdade e a marca "[demo]"
//   sai de todo texto do banco. A marca existe para a faxina da demonstração em
//   produção; no banco local, que é recriado inteiro, ela só sujaria o vídeo.

import { getPrisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/auth/password";

const MARCA = "[demo]";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@invalido/x");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Recusado: este preparo só roda no banco local (use scripts/local/com-banco-local.mjs).");
  }
  const senhaDoPortal = process.env.LOCAL_PORTAL_PASSWORD;
  if (!senhaDoPortal) throw new Error("Falta LOCAL_PORTAL_PASSWORD no .env.localdev.");

  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: "41tech" }, select: { id: true } });
  if (!tenant) throw new Error("Rode o seed antes (prisma/seed.ts).");
  const tenantId = tenant.id;

  // ── Controladoria ──────────────────────────────────────────────────────────
  if (!(await p.sector.findFirst({ where: { tenantId, code: "controladoria" } }))) {
    const ultimo = await p.sector.aggregate({ where: { tenantId }, _max: { order: true } });
    await p.sector.create({
      data: { tenantId, code: "controladoria", label: "Controladoria", color: "#B8327A", active: true, order: (ultimo._max.order ?? -1) + 1 },
    });
    console.log("setor Controladoria criado");
  }

  // ── Cliente do portal: senha de teste ─────────────────────────────────────
  const cliente = await p.portalUser.findFirst({
    where: { tenantId, email: "cliente.demo@exemplo.invalido" },
    select: { id: true, clientGroupId: true },
  });
  if (!cliente) throw new Error("Rode a demonstração antes (scripts/dados-de-demonstracao.ts --aplicar).");
  await p.portalUser.update({ where: { id: cliente.id }, data: { passwordHash: await hashPassword(senhaDoPortal), active: true } });
  console.log("senha de teste do cliente do portal definida (LOCAL_PORTAL_PASSWORD)");

  // ── Segunda empresa do grupo ──────────────────────────────────────────────
  const filial = "TRANSPORTES MODELO LTDA — FILIAL SUL";
  if (!(await p.company.findFirst({ where: { tenantId, name: filial } }))) {
    await p.company.create({
      data: { tenantId, name: filial, displayName: "Transportes Modelo — Filial Sul", status: "ACTIVE", clientGroupId: cliente.clientGroupId },
    });
    console.log("segunda empresa do grupo criada");
  }

  // ── Comunicado de exemplo ─────────────────────────────────────────────────
  const titulo = "Recesso de fim de ano";
  if (!(await p.clientAnnouncement.findFirst({ where: { tenantId, title: titulo } }))) {
    await p.clientAnnouncement.create({
      data: {
        tenantId,
        sectorCode: "controladoria",
        title: titulo,
        body:
          "O escritório fica fechado de 24/12 a 02/01.\n\nPedidos feitos nesse período pelo portal entram na fila e são respondidos a partir de 05/01, na ordem em que chegaram. As guias com vencimento no recesso saem antes, até 20/12.",
        notifiedAt: new Date(),
        groups: { create: [{ clientGroupId: cliente.clientGroupId }] },
      },
    });
    console.log("comunicado de exemplo criado");
  }

  // ── Notas fiscais ─────────────────────────────────────────────────────────
  const matriz = await p.company.findFirst({
    where: { tenantId, clientGroupId: cliente.clientGroupId, cnpj: { not: null } },
    select: { id: true, name: true, cnpj: true },
  });
  if (matriz?.cnpj && !(await p.fiscalDocument.findFirst({ where: { tenantId, dedupKey: { startsWith: "LOCAL:" } } }))) {
    const hoje = new Date();
    const diasAtras = (d: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - d, 10);
    const competencia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const empresa = { nome: matriz.name.replace(`${MARCA} `, ""), cnpj: matriz.cnpj };
    // Emitidas pela empresa (fretes) e recebidas (combustível, pneus, oficina).
    // CNPJs de exemplo, inventados — nenhum é de empresa real conhecida.
    const atacadao = { nome: "Distribuidora Serra Azul Ltda", cnpj: "45987654000110" };
    const notas = [
      { tipo: "CTE", numero: "1284", d: 1, valor: "8450.00", de: empresa, para: atacadao, lancada: true },
      { tipo: "CTE", numero: "1283", d: 3, valor: "6120.00", de: empresa, para: { nome: "Moinho Vale Verde S.A.", cnpj: "33444555000172" }, lancada: true },
      { tipo: "NFE", numero: "58712", d: 4, valor: "2345.50", de: { nome: "Posto Central Rodovia Ltda", cnpj: "22333444000195" }, para: empresa, lancada: true },
      { tipo: "NFE", numero: "9921", d: 6, valor: "3200.00", de: { nome: "Pneus Estrada Forte Ltda", cnpj: "55666777000101" }, para: empresa, lancada: false },
      { tipo: "NFSE", numero: "412", d: 8, valor: "1290.00", de: { nome: "Oficina do Paulo Mecânica Diesel", cnpj: "66777888000130" }, para: empresa, lancada: false },
      { tipo: "CTE", numero: "1279", d: 12, valor: "9800.00", de: empresa, para: atacadao, lancada: true },
    ] as const;
    for (const n of notas) {
      const emitida = diasAtras(n.d);
      await p.fiscalDocument.create({
        data: {
          tenantId,
          companyId: matriz.id,
          type: n.tipo,
          dedupKey: `LOCAL:${n.tipo}:${n.numero}`,
          number: n.numero,
          series: n.tipo === "NFSE" ? null : "1",
          issuerName: n.de.nome,
          issuerDocument: n.de.cnpj,
          recipientName: n.para.nome,
          recipientDocument: n.para.cnpj,
          amount: n.valor,
          netAmount: n.valor,
          issuedAt: emitida,
          competence: competencia(emitida),
          origin: "UPLOAD",
          destination: n.lancada ? "LANCADO" : "PENDENTE",
          // Sem XML de verdade por trás: não oferece a DANFE que não existe.
          renderizavel: false,
        },
      });
    }
    console.log("notas fiscais fictícias criadas");
  }

  // ── Nomes de vitrine ──────────────────────────────────────────────────────
  await p.user.updateMany({ where: { tenantId, email: "adm6@41bpo.com.br" }, data: { name: "Camila Duarte" } });
  const descricoes: Record<string, string> = {
    "Enviar o extrato bancário de setembro":
      "Precisamos do extrato da conta movimento do Itaú, de 01/09 a 30/09, em PDF ou OFX, para conciliar o mês.",
    "Confirmar o pagamento do aluguel":
      "O aluguel do galpão de setembro (R$ 8.500,00) não apareceu no extrato. Ele foi pago? Se sim, mande o comprovante.",
    "Nota fiscal do frete de São Paulo": "Falta a nota do frete de 18/09 para São Paulo. Pode anexar o XML ou o PDF?",
    "Endereço de cobrança atualizado": "Qual é o endereço de cobrança novo, para atualizarmos o cadastro?",
  };
  for (const [tituloDaPendencia, descricao] of Object.entries(descricoes)) {
    await p.clientRequest.updateMany({
      where: { tenantId, title: { in: [tituloDaPendencia, `${MARCA} ${tituloDaPendencia}`] } },
      data: { description: descricao },
    });
  }

  // A marca sai de toda coluna de texto. Varre o information_schema em vez de
  // listar tabela por tabela: a demonstração cresce, e uma lista daqui ficaria
  // para trás sem ninguém notar.
  const colunas = await p.$queryRawUnsafe<{ t: string; c: string }[]>(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE IN ('varchar', 'text', 'mediumtext', 'longtext')"
  );
  // Saem também os sufixos que explicam a conta para quem testa ("— dentro do
  // teto"): no vídeo, o cliente os leria como parte da descrição.
  const sobras = [`${MARCA} `, " — dentro do teto", " — acima do teto", " — vence hoje"];
  let limpos = 0;
  for (const { t, c } of colunas) {
    for (const sobra of sobras) {
      limpos += await p.$executeRawUnsafe(
        `UPDATE \`${t}\` SET \`${c}\` = REPLACE(\`${c}\`, ?, '') WHERE \`${c}\` LIKE ?`,
        sobra,
        `%${sobra}%`
      );
    }
  }
  if (limpos) console.log(`marca "${MARCA}" e sufixos de teste retirados de ${limpos} campos`);

  await p.$disconnect();
  console.log("ambiente local pronto");
}

main().catch((e) => {
  console.error(String(e).replace(/mysql:\/\/\S+/g, "[url]"));
  process.exit(1);
});
