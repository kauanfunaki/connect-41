import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { CODIGOS_DE_WHATSAPP, provedorDaIntegracao } from "@/lib/whatsapp/provedores";
import { atenderMensagem, tratarNaoTexto, type Conexao } from "@/lib/whatsapp/atendimento";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Chamado pelo provedor de WhatsApp, de fora, sem sessão.
 *
 * O `integrationId` da URL **não autentica nada** — ele só diz qual conexão
 * atende, e é pela conexão que se sabe o provedor (Meta, Evolution). Quem
 * autentica é o `autenticar` do provedor. Tratar o id como segredo seria deixar
 * a porta aberta para qualquer um inventar mensagem de candidato dentro do
 * Connect.
 */
async function carregarConexao(integrationId: string): Promise<Conexao | null> {
  const prisma = getPrisma();
  const linha = await prisma.tenantIntegration.findFirst({
    where: { id: integrationId, integrationCode: { in: CODIGOS_DE_WHATSAPP } },
    select: { id: true, tenantId: true, integrationCode: true, enabled: true, configEnc: true },
  });
  return linha ?? null;
}

/** A verificação de posse por GET, para o provedor que faz uma (a Meta, ao cadastrar o webhook). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const conexao = await carregarConexao(integrationId);
  const provedor = conexao ? provedorDaIntegracao(conexao.integrationCode) : null;
  if (!conexao || !provedor) return new NextResponse("não encontrado", { status: 404 });
  if (!provedor.verificarPosse) return new NextResponse("método não suportado", { status: 405 });

  const r = provedor.verificarPosse(new URL(req.url), lerConfig(conexao.configEnc));
  if (!r.ok) {
    console.error("[whatsapp:webhook] verificação recusada", integrationId, r.motivo);
    return new NextResponse("proibido", { status: 403 });
  }
  // Texto puro, sem JSON: é o que a Meta espera de volta.
  return new NextResponse(r.resposta, {
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
  const provedor = conexao ? provedorDaIntegracao(conexao.integrationCode) : null;
  if (!conexao || !provedor) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const config = lerConfig(conexao.configEnc);
  const verificacao = provedor.autenticar(
    { corpoBruto: rawBody, cabecalhos: req.headers, url: new URL(req.url) },
    config
  );
  if (!verificacao.ok) {
    console.error("[whatsapp:webhook] não autenticado", integrationId, verificacao.motivo);
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // 200 mesmo assim: corpo ilegível não melhora com reentrega, e devolver
    // erro só faria o provedor insistir com o mesmo lixo.
    console.error("[whatsapp:webhook] corpo não é JSON", integrationId);
    return NextResponse.json({ ok: true });
  }

  const evento = provedor.lerEvento(payload);

  // Confirmação de entrega e leitura é a maior parte do volume. Sai cedo.
  if (evento.somenteStatus) return NextResponse.json({ ok: true });

  // ─── Por que o processamento é aguardado, e não solto em background ────────
  //
  // O provedor reentrega quando não recebe 200 em poucos segundos, e uma
  // conversa com o modelo pode passar disso. A tentação é responder 200 e
  // processar depois; num runtime serverless isso mata o trabalho no meio, e o
  // candidato fica sem resposta sem ninguém saber.
  //
  // Então esperamos — e a reentrega é tratada onde ela realmente se resolve: o
  // `waMessageId` único em `WhatsappMessage`. Se o provedor reentregar, a
  // segunda passada para na gravação da entrada e não gera segunda resposta.
  for (const m of evento.mensagens) {
    try {
      const desfecho = await atenderMensagem(conexao, provedor, m);
      console.info("[whatsapp:webhook]", m.waMessageId, desfecho);
    } catch (err) {
      // Uma mensagem que falha não derruba as outras do lote.
      console.error("[whatsapp:webhook] falha ao atender", m.waMessageId, err);
    }
  }

  for (const i of evento.ignoradas) {
    try {
      await tratarNaoTexto(conexao, i.de, i.tipo);
    } catch (err) {
      console.error("[whatsapp:webhook] falha ao tratar não-texto", i.waMessageId, err);
    }
  }

  // Sempre 200: a Meta desativa o webhook depois de muitos erros, e um erro
  // nosso ao processar não é motivo para o provedor reentregar — a reentrega
  // geraria trabalho repetido, não conserto.
  return NextResponse.json({ ok: true });
}
