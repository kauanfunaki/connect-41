import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  auditarNota,
  autorizarNotas,
  consultaDaLista,
  erroDasNotas,
  recusaDaNota,
  respostaSemCache,
} from "@/lib/contabil-core/notas/rotaDasNotas";
import type { CamposDaNota } from "@/lib/contabil-core/notas/servico";
import { criarNota, listarNotas } from "@/lib/contabil-core/servidor/notas";

export const runtime = "nodejs";

// As notas fiscais de uma empresa (Bloco C, Fase C1, 18/11/2026): porte do `GET /empresas/{id}/notas`
// (lista paginada com filtros de tipo, status, número, chave, CNPJ, emitente e período de emissão) e do
// `POST /empresas/{id}/notas` (a nota cadastrada à mão, validada como o `NotaFiscalCreate`).

export async function GET(req: NextRequest) {
  const a = await autorizarNotas("ver");
  if (a.recusa) return a.recusa;
  const q = req.nextUrl.searchParams;
  const empresaId = idValido(q.get("empresa"));
  if (!empresaId) return semEmpresa();
  const c = consultaDaLista(q);
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });
  try {
    const r = await listarNotas(a.ctx.tenantId, empresaId, c.filtros, c.pagina, c.porPagina);
    if (!r.ok) return recusaDaNota(r);
    return respostaSemCache({ ok: true, lista: r.valor });
  } catch (err) {
    return erroDasNotas("lista", err, "Não deu para consultar as notas fiscais. Tente de novo.");
  }
}

/** Os campos do `NotaFiscalCreate`: o nome no corpo (camelCase) e o do original. */
const CAMPOS: readonly (readonly [keyof CamposDaNota, string])[] = [
  ["tipo", "tipo"],
  ["numero", "numero"],
  ["serie", "serie"],
  ["cnpjEmitente", "cnpj_emitente"],
  ["nomeEmitente", "nome_emitente"],
  ["cnpjDestinatario", "cnpj_destinatario"],
  ["valor", "valor"],
  ["dataEmissao", "data_emissao"],
  ["chaveAcesso", "chave_acesso"],
  ["observacao", "observacao"],
  ["origem", "origem"],
  ["assinaturaMotivo", "assinatura_motivo"],
];

export async function POST(req: NextRequest) {
  const a = await autorizarNotas("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const campos: CamposDaNota = { tipo: undefined, numero: undefined, cnpjEmitente: undefined, valor: undefined, dataEmissao: undefined };
  for (const [nome, doOriginal] of CAMPOS) {
    const v = corpo[nome] !== undefined ? corpo[nome] : corpo[doOriginal];
    if (v !== undefined) campos[nome] = v;
  }
  try {
    const r = await criarNota(a.ctx.tenantId, a.ctx.userId, empresaId, campos);
    if (!r.ok) return recusaDaNota(r);
    await auditarNota(a.ctx, r.valor.nota.id, r.valor.auditoria);
    return respostaSemCache({ ok: true, nota: r.valor.nota });
  } catch (err) {
    return erroDasNotas("criação", err, "Não deu para cadastrar a nota. Tente de novo.");
  }
}
