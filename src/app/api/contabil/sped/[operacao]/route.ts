import { ZodError } from "zod";
import { z } from "zod";
import { acessoContabil, exigirEmpresa, pedirContabil, ErroContabil } from "@/lib/contabil/servidor";
import { contextoSchema } from "@/lib/contabil/regras";
import { podeNoModulo } from "@/lib/auth/modulo";
import { podeExcluir } from "@/lib/auth/context";
import { MODULO_CONTABIL, type PedidoContabil, type EstabelecimentoContabil } from "@/lib/contabil/types";

export const runtime = "nodejs";
const uuid = z.string().uuid();
const comandos = new Set(["regra", "remover-regra", "cfop", "remover-cfop", "desconsiderar", "reconsiderar", "categoria", "nome", "remover-nome", "importar-csv", "sugestoes", "remover-categoria", "credito-apoio"]);
async function corpoLimitado(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new ErroContabil("Informe os dados.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) { const r = await reader.read(); if (r.done) break; bytes += r.value.length; if (bytes > 8 * 1024 * 1024) { await reader.cancel(); throw new ErroContabil("O CSV deve ter até 3 MB.", 413); } chunks.push(r.value); }
  return z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
async function executar(request: Request, operacao: string) {
  const escrita = comandos.has(operacao);
  const acesso = await acessoContabil(escrita ? "agir" : "ver", operacao.startsWith("remover-"));
  const p = new URL(request.url).searchParams;
  if (request.method === "GET") {
    if (operacao === "contexto") {
      const r = await (await pedirContabil(acesso, "contexto")).json();
      return Response.json({ ...r, recentes: (r.recentes ?? []).filter((p: PedidoContabil) => acesso.cnpjs.has(p.contexto.cnpj)), estabelecimentos: r.estabelecimentos.filter((e: EstabelecimentoContabil) => acesso.cnpjs.has(e.cnpj)), escrita: Boolean(acesso.config.accountingWriteToken),
        permissoes: { agir: await podeNoModulo(acesso.ctx, MODULO_CONTABIL, "agir"), excluir: podeExcluir(acesso.ctx) } });
    }
    const cnpj = p.get("cnpj") ?? ""; exigirEmpresa(acesso, cnpj);
    const params = new URLSearchParams({ cnpj });
    if (operacao === "pedido" || operacao === "arquivo") {
      const id = uuid.parse(p.get("id"));
      const pedido = await (await pedirContabil(acesso, `pedidos/${id}`, { params })).json() as PedidoContabil;
      exigirEmpresa(acesso, pedido.contexto.cnpj);
      if (pedido.contexto.cnpj !== cnpj) throw new ErroContabil("Não encontrado.", 404);
      if (operacao === "pedido") return Response.json(pedido);
      const chave = z.string().regex(/^[a-z0-9_-]{1,100}$/).parse(p.get("chave"));
      const r = await pedirContabil(acesso, `pedidos/${id}/arquivos/${chave}`, { params });
      return new Response(r.body, { headers: { "Content-Type": r.headers.get("Content-Type") ?? "application/octet-stream", "Content-Disposition": r.headers.get("Content-Disposition") ?? "attachment", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (operacao === "regras" || operacao === "contas" || operacao === "historicos") {
      if (p.get("busca")) params.set("busca", p.get("busca")!.slice(0, 150));
      return Response.json(await (await pedirContabil(acesso, operacao, { params })).json());
    }
    if (operacao === "documentos") {
      const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(p.get("competencia")); params.set("competencia", competencia);
      params.set("fornecedor", z.string().regex(/^\d{11,14}$/).parse(p.get("fornecedor")));
      params.set("cfop", p.get("cfop") ?? ""); params.set("incluir_dominio", p.get("incluir_dominio") === "false" ? "false" : "true");
      return Response.json(await (await pedirContabil(acesso, "documentos", { params })).json());
    }
    throw new ErroContabil("Não encontrado.", 404);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ErroContabil("Envie JSON.", 415);
  const origem = request.headers.get("origin");
  if (origem && new URL(origem).host !== request.headers.get("host")) throw new ErroContabil("Origem inválida.", 403);
  const dados = await corpoLimitado(request);
  if (typeof dados.csv === "string" && Buffer.byteLength(dados.csv, "utf8") > 3 * 1024 * 1024) throw new ErroContabil("O CSV deve ter até 3 MB.", 413);
  const contexto = contextoSchema.parse(dados.contexto); exigirEmpresa(acesso, contexto.cnpj);
  const operacoesConsulta = new Set(["conferir", "gerar", "parar", "retomar", "previa-csv"]);
  if (!escrita && !operacoesConsulta.has(operacao)) throw new ErroContabil("Não encontrado.", 404);
  const chave = z.string().uuid().parse(request.headers.get("Idempotency-Key"));
  const envio = { ...dados, contexto, idempotency_key: chave };
  return Response.json(await (await pedirContabil(acesso, operacao, { dados: envio, escrita, consulta: !escrita })).json());
}
async function responder(request: Request, params: Promise<{ operacao: string }>) {
  try { const r = await executar(request, (await params).operacao); r.headers.set("Cache-Control", "private, no-store"); return r; }
  catch (e) {
    if (e instanceof ErroContabil) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError || e instanceof SyntaxError) return Response.json({ error: e instanceof ZodError ? e.issues.map(i => i.message).join(" ") : "Confira os dados informados." }, { status: 400 });
    console.error("[contabil]", e instanceof Error ? e.name : "Erro");
    return Response.json({ error: "Não foi possível consultar o SPED. Confira a conexão e tente novamente." }, { status: 503 });
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ operacao: string }> }) { return responder(request, params); }
export async function POST(request: Request, { params }: { params: Promise<{ operacao: string }> }) { return responder(request, params); }
