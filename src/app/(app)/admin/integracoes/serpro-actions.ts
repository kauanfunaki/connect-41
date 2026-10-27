"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { hojeIso } from "@/lib/datas/calendario";
import { formatCnpj } from "@/lib/format";
import { configuracaoDoSerpro, ehSoftwareHouse, enviarTermoAoSerpro, testarConexao } from "@/lib/serpro/cliente";
import { gerarTermo, lerTermoAssinado, TAMANHO_MAXIMO_DO_TERMO } from "@/lib/serpro/termo";
import { NOME_DO_ASSINADOR, scriptDoAssinador, VIGENCIAS_DO_TERMO } from "@/lib/serpro/assinador";

/**
 * Testa a ligação, de graça: na produção só autentica (chave, segredo e
 * certificado) e, no modelo software house, envia o termo; na demonstração,
 * faz a consulta de exemplo do trial.
 */
export async function testarConexaoSerpro(): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, erro: "Sem permissão para configurar integrações." };
  const r = await testarConexao(ctx.tenantId);
  revalidatePath("/admin/integracoes");
  return r;
}

/** Soma meses a uma data AAAA-MM-DD, segurando o fim do mês (31/01 + 1 = 28/02). */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * O assinador do termo (27/10/2026): o script do PowerShell com o termo dentro,
 * já com quem contratou (o titular do certificado guardado) e quem recebe as
 * autorizações. Quem baixa roda na máquina do e-CNPJ do escritório e devolve
 * o termo assinado — a chave privada não passa pelo Connect.
 */
export async function baixarAssinadorDoTermo(meses: number): Promise<{ ok: true; nome: string; conteudo: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, erro: "Sem permissão para configurar integrações." };
  if (!(VIGENCIAS_DO_TERMO as readonly number[]).includes(meses)) return { ok: false, erro: "Vigência inválida." };

  const cfg = await configuracaoDoSerpro(ctx.tenantId);
  if (!cfg || !cfg.certificado?.ok || !cfg.certificado.cnpj) return { ok: false, erro: "Guarde antes o certificado de quem contratou o Serpro, na conexão acima." };
  if (!cfg.escritorio) return { ok: false, erro: "Falta definir quem recebe as autorizações (em Autorizações de acesso)." };
  if (!ehSoftwareHouse(cfg)) return { ok: false, erro: "O certificado é do próprio escritório que recebe as autorizações: não precisa de termo." };

  const hoje = hojeIso();
  const autor = { numero: cfg.escritorio.cnpj, nome: cfg.escritorio.nome };
  const contratante = { numero: cfg.certificado.cnpj, nome: cfg.certificado.titular ?? formatCnpj(cfg.certificado.cnpj) };
  const xml = gerarTermo({ contratante, autor, assinadoEm: hoje, vigencia: somarMeses(hoje, meses) });
  return { ok: true, nome: NOME_DO_ASSINADOR, conteudo: scriptDoAssinador({ xml, autor, contratante: contratante.nome }) };
}

export type ResultadoDoTermo = { ok: true; tom: "sucesso" | "atencao"; texto: string } | { ok: false; erro: string };

/**
 * Guarda o termo assinado e, com a conexão pronta, já o leva ao Serpro (grátis).
 * Sem as chaves ainda, fica guardado e vai na primeira chamada. Antes de
 * guardar, confere a assinatura e se o termo é deste contratante e deste escritório.
 */
export async function enviarTermoAssinado(form: FormData): Promise<ResultadoDoTermo> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, erro: "Sem permissão para configurar integrações." };

  const arquivo = form.get("termo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Escolha o arquivo termo-assinado.xml." };
  if (arquivo.size > TAMANHO_MAXIMO_DO_TERMO) return { ok: false, erro: "O arquivo é grande demais para um termo de autorização." };

  const cfg = await configuracaoDoSerpro(ctx.tenantId);
  if (!cfg || !cfg.certificado?.ok || !cfg.certificado.cnpj || !cfg.escritorio) {
    return { ok: false, erro: "Guarde antes o certificado de quem contratou o Serpro e defina quem recebe as autorizações." };
  }
  const texto = (await arquivo.text()).replace(/^﻿/, "").trim();
  const lido = lerTermoAssinado(texto, hojeIso());
  if (!lido.ok) return { ok: false, erro: lido.erro };
  const t = lido.termo;
  if (t.contratante.numero !== cfg.certificado.cnpj) {
    return { ok: false, erro: `O termo autoriza o CNPJ ${formatCnpj(t.contratante.numero)}, e o certificado guardado é de ${formatCnpj(cfg.certificado.cnpj)}.` };
  }
  if (t.autor.numero !== cfg.escritorio.cnpj) {
    return { ok: false, erro: `O termo foi assinado por ${formatCnpj(t.autor.numero)}, e quem recebe as autorizações é ${formatCnpj(cfg.escritorio.cnpj)}.` };
  }

  const dados = {
    xml: texto,
    contratante: t.contratante.numero,
    autor: t.autor.numero,
    assinadoEm: t.assinadoEm,
    vigencia: t.vigencia,
    certificadoTitular: t.certificado.titular?.slice(0, 200) ?? null,
    certificadoValidoAte: t.certificado.validoAte,
    aceitoEm: null,
    erro: null,
    enviadoPorId: ctx.userId ?? null,
  };
  const guardado = await getPrisma().serproTermo.upsert({ where: { tenantId: ctx.tenantId }, create: { tenantId: ctx.tenantId, ...dados }, update: dados, select: { id: true } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "integration.serpro_termo",
    entityType: "SerproTermo",
    entityId: guardado.id,
    metadata: { contratante: t.contratante.numero, autor: t.autor.numero, vigencia: t.vigencia },
  });

  const envio = await enviarTermoAoSerpro(ctx.tenantId);
  revalidatePath("/admin/integracoes");
  if (envio.enviado) return { ok: true, tom: "sucesso", texto: "Termo guardado e aceito pelo Serpro." };
  if (envio.recusado) return { ok: true, tom: "atencao", texto: `Termo guardado, mas o Serpro recusou: ${envio.erro.replace(/^O Serpro recusou o termo de autorização: /, "")}` };
  return { ok: true, tom: "sucesso", texto: "Termo guardado e conferido. Ele vai ao Serpro quando a conexão estiver pronta (com a chave e o segredo)." };
}
