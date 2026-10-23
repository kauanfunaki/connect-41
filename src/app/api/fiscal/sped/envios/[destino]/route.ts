import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { ErroDoMotor } from "@/lib/sped/motor";
import { chaveDoEnvio, COMPETENCIA, conferirArquivos, DESTINOS_DE_ENVIO, ENVIOS, mensagemDeTamanho, sha256DoArquivo, type DestinoDeEnvio } from "@/lib/sped/escritasDoMotor";
import { doErro, prepararEscrita, recusa, recusado, revalidarTelas, type ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";

export const dynamic = "force-dynamic";

/**
 * Os três envios de arquivo das telas fiscais (API-CONNECT §13.3, §13.10 e
 * §13.11): documentos (até 25 MiB no total), o relatório do Omie e a planilha
 * do BPO (até 20 MiB cada).
 *
 * ─── Por que rota e não Server Action ───────────────────────────────────────
 *
 * O corpo de uma Server Action é recusado acima de `serverActions.bodySizeLimit`
 * (10 MB em `next.config.ts`) **antes** de a ação rodar, com erro genérico. Os
 * tetos daqui passam disso. Numa rota não há esse limite; o que há é o proxy
 * (`src/proxy.ts`), que guarda o corpo até `proxyClientMaxBodySize` e **corta
 * em silêncio** o que passar — por isso ele foi a 26 MB, e esta rota confere o
 * `Content-Length` antes de ler o corpo.
 *
 * ─── A ordem ────────────────────────────────────────────────────────────────
 *
 * Destino; `Content-Length` (sem ele, 411; acima do teto mais o envelope, 413
 * com o caminho do painel), sem ler o corpo; módulo em `agir`, raiz no
 * alcance e token de escrita (`prepararEscrita`); o multipart; os arquivos
 * (quantidade, extensão, tamanho); a chave derivada do conteúdo e do gesto; o
 * motor. Depois do sucesso, a auditoria e a releitura da tela.
 *
 * A resposta é sempre `ResultadoDoMotor` em JSON, como as Server Actions; o
 * status HTTP acompanha (200 no sucesso).
 */

/** O que o Connect aceita a mais que o teto do motor no corpo vindo do navegador: o envelope e os campos `raiz`/`gesto`. */
const ENVELOPE_DO_NAVEGADOR = 1024 * 1024;

const responder = (r: ResultadoDoMotor<unknown>, status = r.ok ? 200 : 400) => NextResponse.json(r, { status, headers: { "Cache-Control": "no-store" } });

const statusDoErro = (err: unknown) => {
  if (!(err instanceof ErroDoMotor)) return 502;
  if (err.status === 0) return err.codigo === "tempo_esgotado" || err.codigo === "falha_de_rede" ? 504 : 400;
  if (err.ocupado) return 503;
  return err.status >= 500 ? 502 : err.status;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ destino: string }> }) {
  const { destino: bruto } = await ctx.params;
  if (!(DESTINOS_DE_ENVIO as readonly string[]).includes(bruto)) return responder(recusa("Envio desconhecido."), 404);
  const destino = bruto as DestinoDeEnvio;
  const regra = ENVIOS[destino];

  const declarado = Number(req.headers.get("content-length"));
  if (!req.headers.get("content-length") || !Number.isFinite(declarado)) return responder(recusa("O envio chegou sem o tamanho declarado. Tente de novo.", { codigo: "tamanho_ausente" }), 411);
  if (declarado > regra.teto + ENVELOPE_DO_NAVEGADOR) return responder(recusa(mensagemDeTamanho(destino), { codigo: "corpo_grande" }), 413);

  const raiz = req.nextUrl.searchParams.get("raiz") ?? "";
  if (!/^\d{8}$/.test(raiz)) return responder(recusa("Empresa não encontrada."), 404);
  const p = await prepararEscrita(raiz, regra.modulo, "agir");
  if (recusado(p)) return responder(p, p.codigo === "escrita_nao_habilitada" ? 409 : 403);

  const form = await req.formData().catch(() => null);
  if (!form) return responder(recusa("O envio chegou incompleto. Tente de novo."), 400);
  const gesto = String(form.get("gesto") ?? "");
  if (!/^[A-Za-z0-9:_-]{16,100}$/.test(gesto)) return responder(recusa("A ação foi enviada sem identificador. Recarregue a página e repita.", { codigo: "idempotencia_ausente" }), 400);
  const competencia = String(form.get("competencia") ?? "").trim();
  if (competencia && !COMPETENCIA.test(competencia)) return responder(recusa("Competência inválida (AAAA-MM).", { codigo: "parametro_invalido", campos: { competencia: "Competência inválida (AAAA-MM)." } }), 422);
  const arquivos = form.getAll(regra.parte).filter((v): v is File => v instanceof File);
  const problema = conferirArquivos(destino, arquivos);
  if (problema) return responder(recusa(problema, { codigo: problema === mensagemDeTamanho(destino) ? "corpo_grande" : "arquivo_invalido" }), problema === mensagemDeTamanho(destino) ? 413 : 422);

  const impressoes = await Promise.all(arquivos.map(async (a) => ({ nome: a.name, tamanho: a.size, sha256: await sha256DoArquivo(a) })));
  const chave = await chaveDoEnvio({ destino, raiz, usuario: p.ator.id, campos: competencia ? { competencia } : {}, arquivos: impressoes, gesto });
  const escrita = { ator: p.ator, chave };
  const metaArquivos = impressoes.slice(0, 50).map((a) => ({ nome: a.nome, tamanho: a.tamanho, sha256: a.sha256 }));

  try {
    if (destino === "documentos") {
      const r = await p.motor.cliente.enviarDocumentos(raiz, arquivos, escrita);
      await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.documentos.enviados",
        entityType: "SpedImportacao", entityId: String(r.importacao_id), metadata: { nome: `importação #${r.importacao_id}`, raiz, chave, arquivos: metaArquivos, resumo: { lidos: r.resumo.lidos, novos: r.resumo.novos, duplicados: r.resumo.duplicados, erros: r.resumo.erros, ignorados: r.resumo.ignorados } } });
      revalidarTelas(regra.tela);
      return responder({ ok: true, mensagem: `Importação #${r.importacao_id}: ${r.resumo.novos} novo(s), ${r.resumo.duplicados} duplicado(s), ${r.resumo.erros} com erro, ${r.resumo.ignorados} ignorado(s).`, dados: r });
    }
    if (destino === "omie") {
      const r = await p.motor.cliente.conferirRelatorioOmie(raiz, arquivos[0], competencia || undefined, escrita);
      await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.omie.conferido",
        entityType: "SpedConferencia", entityId: r.arquivo.slice(0, 120), metadata: { nome: r.arquivo, raiz, chave, competencia: r.competencia, arquivos: metaArquivos, linhas: r.linhas, aConferir: r.a_conferir } });
      revalidarTelas(regra.tela);
      return responder({ ok: true, mensagem: `Relatório conferido (${r.competencia}): ${r.linhas} linha(s), ${r.no_banco} na base, ${r.a_conferir} a conferir.`, dados: r });
    }
    const r = await p.motor.cliente.confrontarPlanilha(raiz, arquivos[0], competencia || undefined, escrita);
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.confronto.enviado",
      entityType: "SpedConfronto", entityId: r.planilha.slice(0, 120), metadata: { nome: r.planilha, raiz, chave, competencia: competencia || null, competencias: r.competencias, arquivos: metaArquivos, pagamentos: r.pagamentos, documentosSemNota: r.documentos_sem_nota } });
    revalidarTelas(regra.tela);
    return responder({ ok: true, mensagem: `Planilha confrontada: ${r.pagamentos} pagamento(s), ${r.documentos_sem_nota} sem nota.`, dados: r });
  } catch (err) {
    const falha = doErro(err);
    // O teto do motor é do corpo inteiro: a frase aponta o painel, não "menos itens".
    if (falha.codigo === "corpo_grande") falha.mensagem = mensagemDeTamanho(destino);
    // A chave é derivada do conteúdo: "tentar de novo" o mesmo arquivo repete a mesma chave (replay).
    return responder(falha, statusDoErro(err));
  }
}
