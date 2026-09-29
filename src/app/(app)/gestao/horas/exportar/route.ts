import { NextRequest, NextResponse } from "next/server";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { custosDoTenant, horasDoPeriodo, periodoDaUrl } from "@/lib/gestao/horas";
import { nomesDasPessoas } from "@/lib/gestao/telas";

export const dynamic = "force-dynamic";

// CSV das horas de operação, com os mesmos filtros da tela. Separador ";" e
// vírgula decimal: é o que o Excel em português abre sem pedir nada.
export async function GET(req: NextRequest) {
  const g = await contextoDaGestao();
  if (!g) return NextResponse.json({ error: "Sem acesso" }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const { recorte } = recorteComFiltro(g.recorte, g.setores, sp.get("setor") ?? undefined);
  const periodo = periodoDaUrl(sp.get("periodo") ?? undefined);
  const pessoa = sp.get("pessoa");
  const podeVerCusto = g.recorte === "todos";

  const todas = await horasDoPeriodo(g.ctx.tenantId, recorte, periodo.de, periodo.ate);
  const linhas = pessoa ? todas.filter((l) => l.userId === pessoa) : todas;
  const nomeDe = await nomesDasPessoas(g.ctx.tenantId, linhas.map((l) => l.userId));
  const { custoDe } = await custosDoTenant(g.ctx.tenantId);

  const cel = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const cabecalho = ["Dia", "Pessoa", "Setor", "Onde", "Minutos", "Horas", ...(podeVerCusto ? ["Custo (R$)"] : []), "Observação"];
  const corpo = linhas.map((l) => {
    const c = podeVerCusto ? custoDe(l.setor) : null;
    return [
      l.dia.toISOString().slice(0, 10),
      cel(nomeDe.get(l.userId) ?? ""),
      cel(g.rotuloDoSetor(l.setor)),
      cel(l.titulo),
      String(l.minutos),
      num(l.minutos / 60),
      ...(podeVerCusto ? [c ? num((l.minutos / 60) * c.total) : ""] : []),
      cel(l.nota ?? ""),
    ].join(";");
  });
  const csv = "﻿" + [cabecalho.join(";"), ...corpo].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="horas-${periodo.chave}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
