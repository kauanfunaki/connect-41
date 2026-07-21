import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import ExcelJS from "exceljs";
import { getAuthContext } from "@/lib/auth/context";
import { getIndicadoresRH } from "@/lib/indicadoresRH";
import { formatInstantDateTime } from "@/lib/format";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;

async function buildPdf(cards: { label: string; value: string }[], generatedAt: Date): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  page.drawText("Indicadores de RH", { x: MARGIN, y, size: 16, font: fontBold });
  y -= 20;
  page.drawText(`Gerado em ${formatInstantDateTime(generatedAt)}`, { x: MARGIN, y, size: 9, font });
  y -= 30;

  for (const card of cards) {
    if (y < MARGIN + 20) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN;
    }
    page.drawText(card.label, { x: MARGIN, y, size: 10, font });
    page.drawText(card.value, { x: A4_WIDTH - MARGIN - 120, y, size: 10, font: fontBold });
    y -= 22;
  }

  return pdfDoc.save();
}

async function buildXlsx(cards: { label: string; value: string }[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Indicadores RH");
  sheet.columns = [
    { header: "Métrica", key: "label", width: 40 },
    { header: "Valor", key: "value", width: 20 },
  ];
  for (const card of cards) sheet.addRow({ label: card.label, value: card.value });
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx") {
    return NextResponse.json({ error: 'Parâmetro "format" deve ser "pdf" ou "xlsx".' }, { status: 400 });
  }

  const cards = await getIndicadoresRH(ctx);
  const now = new Date();
  const dateSuffix = now.toISOString().slice(0, 10);

  if (format === "pdf") {
    const bytes = await buildPdf(cards, now);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="indicadores-rh-${dateSuffix}.pdf"`,
      },
    });
  }

  const buffer = await buildXlsx(cards);
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="indicadores-rh-${dateSuffix}.xlsx"`,
    },
  });
}
