"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { integracaoDoCatalogo } from "@/lib/integracoes/catalogo";
import { lerConfig, salvarIntegracao } from "@/lib/integracoes/data";
import { apontarWebhookDaEvolution, apontarWebhookDoChatwoot, urlDoAviso, type ResultadoDoEndereco } from "@/lib/integracoes/enderecoDosAvisos";
import { resolveConnectionCredentials } from "@/lib/chatwoot/connection";
import { TAMANHO_MAXIMO_DO_CERTIFICADO } from "@/lib/serpro/certificado";
import { validarConfigDoSerpro } from "@/lib/serpro/cliente";
import { CODIGO_DA_INTEGRACAO } from "@/lib/serpro/regras";

export type ConexaoState = { error: string } | { success: true } | null;

/**
 * Salva uma conexão da vitrine.
 *
 * Credencial de sistema de terceiro é configuração do cliente inteiro, não de
 * setor — mesmo critério da chave de IA e do Chatwoot.
 */
export async function salvarConexao(_prev: ConexaoState, form: FormData): Promise<ConexaoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações." };

  const code = String(form.get("code") ?? "");
  const def = integracaoDoCatalogo(code);
  if (!def) return { error: "Integração desconhecida." };

  const instanceKey = String(form.get("instanceKey") ?? "default") || "default";

  // Só os campos que o catálogo declara. Ler o FormData inteiro deixaria
  // qualquer campo extra do navegador entrar na configuração cifrada.
  const campos: Record<string, unknown> = {};
  for (const c of def.campos) {
    const v = form.get(c.name);
    if (c.type === "certificado") {
      // Arquivo vazio = ninguém escolheu: mantém o guardado (ver mesclarConfig).
      if (v instanceof File && v.size > 0) {
        if (v.size > TAMANHO_MAXIMO_DO_CERTIFICADO) return { error: "Arquivo grande demais para um certificado A1." };
        campos[c.name] = Buffer.from(await v.arrayBuffer()).toString("base64");
      }
      continue;
    }
    // Escolha fora da lista não entra: vale a gravada, ou a primeira opção.
    if (c.type === "escolha" && !c.opcoes?.some((o) => o.valor === v)) continue;
    if (typeof v === "string") campos[c.name] = v;
  }

  const r = await salvarIntegracao({
    tenantId: ctx.tenantId,
    code,
    instanceKey,
    enabled: form.get("enabled") === "on",
    campos,
    validar: code === CODIGO_DA_INTEGRACAO ? validarConfigDoSerpro : undefined,
  });

  if (!r.ok) return { error: r.erro };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "integration.save",
    entityType: "TenantIntegration",
    entityId: r.id,
    // Nunca o valor: o metadata do log vai para o banco em texto, e é lido por
    // quem audita. O que importa aqui é quais campos mudaram, não o que eles
    // passaram a valer.
    metadata: { code, instanceKey, camposEnviados: Object.keys(campos) },
  });

  revalidatePath("/admin/integracoes");
  return { success: true };
}

export type ResultadoDoApontar = { error: string } | { ok: true; mensagem: string };

/**
 * Aponta para o endereço do Connect (`APP_PUBLIC_URL`) os avisos que chegam
 * de fora (21/10): o webhook do Chatwoot, ou o da instância da Evolution.
 * Só administrador, como o resto das integrações.
 */
export async function apontarAvisosParaOConnect(
  alvo: { tipo: "chatwoot" } | { tipo: "whatsapp"; integrationId: string }
): Promise<ResultadoDoApontar> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações." };
  const urlPublica = process.env.APP_PUBLIC_URL;
  if (!urlPublica) return { error: "APP_PUBLIC_URL não está configurada no servidor — é ela que diz o endereço do Connect." };

  let r: ResultadoDoEndereco;
  let entityType: string;
  let entityId: string;
  let urlNova: string;
  if (alvo.tipo === "chatwoot") {
    const conexao = await resolveConnectionCredentials(ctx.tenantId);
    if (!conexao) return { error: "O Chatwoot não está configurado, ou falta o token." };
    urlNova = urlDoAviso(urlPublica, `/api/integrations/chatwoot/webhook/${conexao.connectionId}`);
    r = await apontarWebhookDoChatwoot(conexao.creds, urlNova);
    entityType = "ChatwootConnection";
    entityId = conexao.connectionId;
  } else {
    const integracao = await getPrisma().tenantIntegration.findFirst({
      where: { id: alvo.integrationId, tenantId: ctx.tenantId },
      select: { id: true, integrationCode: true, configEnc: true },
    });
    if (!integracao) return { error: "Conexão não encontrada." };
    const def = integracaoDoCatalogo(integracao.integrationCode);
    if (!def?.caminhoDoWebhook) return { error: "Esta conexão não recebe avisos." };
    if (integracao.integrationCode !== "whatsapp_recrutamento_evolution") {
      return { error: "Na Meta, a URL do webhook é do app, no painel de desenvolvedor: troque por lá, com a URL mostrada aqui." };
    }
    urlNova = urlDoAviso(urlPublica, def.caminhoDoWebhook.replace("{id}", integracao.id));
    r = await apontarWebhookDaEvolution(lerConfig(integracao.configEnc), urlNova);
    entityType = "TenantIntegration";
    entityId = integracao.id;
  }
  if (!r.ok) return { error: r.erro };

  if (r.mudou) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "integration.webhook_url",
      entityType,
      entityId,
      metadata: { antes: r.antes, depois: urlNova },
    });
  }
  revalidatePath("/admin/integracoes");
  return { ok: true, mensagem: r.mudou ? `Pronto: os avisos agora chegam em ${urlNova}.` : "Os avisos já chegavam no endereço do Connect." };
}
