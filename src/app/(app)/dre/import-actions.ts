"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { lerExportDoOmie, mesesDoExport, mesDaData, ExportIlegivel, type Celula } from "@/lib/dre/omie";

export type ResultadoDaImportacao =
  | { error: string }
  | {
      ok: true;
      origem: "pagamento" | "recebimento";
      meses: { ano: number; mes: number; linhas: number }[];
      lidas: number;
      ignoradas: number;
    };

/** 8 MB — o export de um mês grande fica bem abaixo disso. */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

const SETOR = "bpo";

/**
 * Importa um export do Omie.
 *
 * ─── Um arquivo pode cobrir mais de um mês ──────────────────────────────────
 *
 * O export normalmente traz um mês, mas nada garante. Em vez de exigir que
 * traga, cada linha vai para o mês da **própria data** — e um arquivo com duas
 * competências dentro vira dois imports, cada um com o seu mês. Forçar tudo num
 * mês só seria um DRE errado nos dois.
 *
 * ─── Reimportar substitui ───────────────────────────────────────────────────
 *
 * A chave é (empresa, ano, mês, origem). Reimportar o mesmo mês apaga o
 * anterior e grava de novo, numa transação. Somar por cima duplicaria o mês
 * inteiro, e o sintoma seria um faturamento que dobrou.
 */
export async function importarExportDoOmie(form: FormData): Promise<ResultadoDaImportacao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SETOR)) return { error: "Sem permissão no BPO." };
  const tenantId = ctx.tenantId;

  const companyId = String(form.get("companyId") ?? "");
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return { error: "Escolha o arquivo exportado do Omie." };
  if (arquivo.size === 0) return { error: "O arquivo está vazio." };
  if (arquivo.size > TAMANHO_MAXIMO) return { error: "Arquivo maior que 8 MB." };

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  let leitura;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await arquivo.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { error: "A planilha não tem nenhuma aba." };

    const matriz: Celula[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const vals: Celula[] = [];
      // `row.cellCount` cresce com a linha mais larga; ler até o fim do
      // cabeçalho é o que garante que a coluna de valor entre mesmo em linha
      // que termina antes dela.
      for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) {
        const v = row.getCell(c).value;
        vals.push(v === undefined ? null : (v as Celula));
      }
      matriz.push(vals);
    });

    leitura = lerExportDoOmie(matriz);
  } catch (err) {
    if (err instanceof ExportIlegivel) return { error: err.message };
    console.error("[importarExportDoOmie]", err);
    return { error: "Não consegui abrir o arquivo. Ele precisa ser a planilha exportada do Omie (.xlsx)." };
  }

  if (leitura.linhas.length === 0) {
    return { error: "O arquivo não tem nenhuma linha aproveitável." };
  }

  const meses = mesesDoExport(leitura.linhas);
  const origemDb = leitura.origem === "pagamento" ? "PAGAMENTO" : "RECEBIMENTO";
  const nome = arquivo.name.slice(0, 255);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const m of meses) {
          const doMes = leitura.linhas.filter((l) => {
            const d = mesDaData(l.data);
            return d.ano === m.ano && d.mes === m.mes;
          });

          await tx.dreImport.deleteMany({
            where: { companyId, ano: m.ano, mes: m.mes, origem: origemDb },
          });

          await tx.dreImport.create({
            data: {
              tenantId,
              companyId,
              ano: m.ano,
              mes: m.mes,
              origem: origemDb,
              arquivo: nome,
              linhasNoArquivo: leitura.linhas.length + leitura.ignoradas.length,
              linhasLidas: doMes.length,
              importedById: ctx.userId ?? null,
              linhas: {
                create: doMes.map((l) => ({
                  data: l.data,
                  categoria: l.categoria?.slice(0, 200) ?? null,
                  valorCentavos: l.valorCentavos,
                })),
              },
            },
          });
        }
      },
      // Um mês grande tem centenas de linhas; o padrão de 5s do Prisma já
      // estourou uma vez neste projeto, no script de limpeza de lançamentos.
      { timeout: 60_000, maxWait: 30_000 }
    );
  } catch (err) {
    console.error("[importarExportDoOmie] gravação", err);
    return { error: "Erro ao gravar o import. Nada foi alterado." };
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "dre.import",
    entityType: "Company",
    entityId: companyId,
    metadata: { arquivo: nome, origem: origemDb, meses, lidas: leitura.linhas.length },
  });

  revalidatePath("/dre");
  return {
    ok: true,
    origem: leitura.origem,
    meses,
    lidas: leitura.linhas.length,
    ignoradas: leitura.ignoradas.length,
  };
}

/** Desfaz o import de um mês — o DRE volta a sair do financeiro do Connect. */
export async function removerImport(
  companyId: string,
  ano: number,
  mes: number
): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SETOR)) return { error: "Sem permissão no BPO." };

  const prisma = getPrisma();
  await prisma.dreImport.deleteMany({ where: { tenantId: ctx.tenantId, companyId, ano, mes } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "dre.import.remove",
    entityType: "Company",
    entityId: companyId,
    metadata: { ano, mes },
  });

  revalidatePath("/dre");
  return null;
}
