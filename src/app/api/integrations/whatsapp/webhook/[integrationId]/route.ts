import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { verificarAssinaturaDaMeta, responderDesafio } from "@/lib/whatsapp/assinatura";
import { lerMensagens, apenasStatus } from "@/lib/whatsapp/payload";
import { atenderMensagem, tratarNaoTexto, type Conexao } from "@/lib/whatsapp/atendimento";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Chamado pela Meta, de fora, sem sessão.
 *
 * O `integrationId` da URL **não autentica nada** — ele só diz qual conexão
 * atende. Quem autentica é a assinatura HMAC com o App Secret da BM. Tratar o
 * id como segredo seria deixar a porta aberta para qualquer um inventar
 * mensagem de candidato dentro do Connect.
 */
async function carregarConexao(integrationId: string): Promise<Conexao | null> {
  const prisma = getPrisma();
  const linha = await prisma.tenantIntegration.findFirst({
    where: { id: integrationId, integrationCode: "whatsapp_recrutamento" },
    select: { id: true, tenantId: true, enabled: true, configEnc: true },
  });
  return linha ?? null;
}

/** A verificação de posse que a Meta faz uma vez, ao cadastrar o webhook. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const conexao = await carregarConexao(integrationId);
  if (!conexao) return new NextResponse("não encontrado", { status: 404 });

  const config = lerConfig(conexao.configEnc);
  const url = new URL(req.url);
  const r = responderDesafio({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    verifyToken: config.verifyToken ?? "",
  });

  if (!r.ok) {
    console.error("[whatsapp:webhook] verificação recusada", integrationId, r.motivo);
    return new NextResponse("proibido", { status: 403 });
  }
  // Texto puro, sem JSON: é o que a Meta espera de volta.
  return new NextResponse(r.challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload grande demais" }, { status: 413 });
  }

  const conexao = await carregarConexao(integrationId);
  if (!conexao) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const config = lerConfig(conexao.configEnc);
  const verificacao = verificarAssinaturaDaMeta(
    rawBody,
    req.headers.get("x-hub-signature-256"),
    config.appSecret ?? ""
  );
  if (!verificacao.ok) {
    console.error("[whatsapp:webhook] assinatura inválida", integrationId, verificacao.motivo);
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // 200 mesmo assim: corpo ilegível não melhora com reentrega, e devolver
    // erro só faria a Meta insistir com o mesmo lixo.
    console.error("[whatsapp:webhook] corpo não é JSON", integrationId);
    return NextResponse.json({ ok: true });
  }

  // Confirmação de entrega e leitura é a maior parte do volume. Sai cedo.
  if (apenasStatus(payload)) return NextResponse.json({ ok: true });

  const { mensagens, ignoradas } = lerMensagens(payload);

  // ─── Por que o processamento é aguardado, e não solto em background ────────
  //
  // A Meta reentrega quando não recebe 200 em poucos segundos, e uma conversa
  // com o modelo pode passar disso. A tentação é responder 200 e processar
  // depois; num runtime serverless isso mata o trabalho no meio, e o candidato
  // fica sem resposta sem ninguém saber.
  //
  // Então esperamos — e a reentrega é tratada onde ela realmente se resolve: o
  // `waMessageId` único em `WhatsappMessage`. Se a Meta reentregar, a segunda
  // passada para na gravação da entrada e não gera segunda resposta.
  for (const m of mensagens) {
    try {
      const desfecho = await atenderMensagem(conexao, m);
      console.info("[whatsapp:webhook]", m.waMessageId, desfecho);
    } catch (err) {
      // Uma mensagem que falha não derruba as outras do lote.
      console.error("[whatsapp:webhook] falha ao atender", m.waMessageId, err);
    }
  }

  for (const i of ignoradas) {
    try {
      await tratarNaoTexto(conexao, i.de, i.tipo);
    } catch (err) {
      console.error("[whatsapp:webhook] falha ao tratar não-texto", i.waMessageId, err);
    }
  }

  // Sempre 200: a Meta desativa o webhook depois de muitos erros, e um erro
  // nosso ao processar não é motivo para ela reentregar — a reentrega geraria
  // trabalho repetido, não conserto.
  return NextResponse.json({ ok: true });
}
