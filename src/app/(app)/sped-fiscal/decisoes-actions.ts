"use server";

// As decisões do motor SPED pelas telas do Connect (22/10/2026, API-CONNECT §5).
// A forma de cada tipo está em `src/lib/fiscal/motor/decisoes.ts`; a regra
// fiscal, no motor. Gravar e lançar pedem `agir` no módulo do tipo; apagar,
// também `podeExcluir`. Tipo bloqueado no motor (`CONNECT_DECISOES_ESCRITA`)
// volta como `403 decisao_bloqueada`, com a mensagem pronta.

import { z } from "zod";
import { podeExcluir } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { chaveSchema, doErro, raizSchema, recusa, recusado, revalidarFiscal, visiveis, type ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";
import { DECISOES, cnpjsDeEstabelecimento, conferirCorpo, ehTipoDeDecisao } from "@/lib/fiscal/motor/decisoes";
import { prepararEscritaContribuicoes } from "@/lib/fiscal/motor/acoes";
import { decisaoContabilPermitida } from "@/lib/contabil/escopoContribuicoes";

// ─── Decisões (§5) ───────────────────────────────────────────────────────────

const decisaoSchema = z.object({
  empresaContabil: z.string().uuid().optional(),
  raiz: raizSchema,
  tipo: z.string(),
  chave: z.record(z.string(), z.unknown()).optional(),
  chaves: z.array(z.record(z.string(), z.unknown())).max(1000).optional(),
  valor: z.record(z.string(), z.unknown()).optional(),
  idempotencia: chaveSchema.optional(),
});

async function prepararDecisao(entrada: unknown, operacao: "gravar" | "apagar" | "criar") {
  const e = decisaoSchema.safeParse(entrada);
  if (!e.success || !ehTipoDeDecisao(e.data.tipo)) return recusa("Decisão inválida.");
  const def = DECISOES[e.data.tipo];
  if (e.data.empresaContabil && !decisaoContabilPermitida(e.data.tipo)) return recusa("Esta decisão não pertence ao SPED Contábil.");
  if (def.oculto) return recusa("Este tipo de decisão ainda não está liberado no Connect.");
  if (operacao === "apagar" && !def.apagar) return recusa("O motor não permite apagar este tipo de decisão.", { codigo: "operacao_nao_suportada" });
  if (operacao === "criar" && !def.criarPorPost) return recusa("Este tipo de decisão não é criado por aqui.");
  if (operacao === "criar" && !e.data.idempotencia) return recusa("A ação foi enviada sem identificador. Recarregue a página e repita.");
  const erros = conferirCorpo(def, operacao, e.data);
  if (Object.keys(erros).length) return recusa("Confira os campos destacados.", { codigo: "parametro_invalido", campos: erros });
  const p = await prepararEscritaContribuicoes(e.data.raiz, def.modulo, "agir", e.data.empresaContabil);
  if (recusado(p)) return p;
  if (operacao === "apagar" && !podeExcluir(p.ctx)) return recusa("Seu perfil não permite apagar decisões.");
  const cnpjs = cnpjsDeEstabelecimento(def, e.data);
  if (cnpjs.length) {
    const vistos = new Set((await visiveis(p.ctx, e.data.raiz)).map((x) => x.cnpj));
    if (cnpjs.some((c) => !vistos.has(c))) return recusa("Estabelecimento fora das empresas que você acessa.");
  }
  return { p, def, dados: e.data };
}

export async function gravarDecisaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<{ gravadas: number }>> {
  const r = await prepararDecisao(entrada, "gravar");
  if ("ok" in r) return r;
  const { p, def, dados } = r;
  try {
    const corpo = dados.chaves ? { chaves: dados.chaves, valor: dados.valor ?? {} } : { chave: dados.chave!, valor: dados.valor ?? {} };
    const resposta = await p.motor.cliente.gravarDecisoes(dados.raiz, def.tipo, corpo, { ator: p.ator, chave: dados.idempotencia });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: dados.empresaContabil ? "contabil.sped.decisao.gravada" : "fiscal.sped.decisao.gravada",
      entityType: "SpedDecisao", entityId: def.tipo, metadata: { nome: def.rotulo, raiz: dados.raiz, tipo: def.tipo, quantidade: resposta.gravadas, campos: Object.keys(dados.valor ?? {}), registroIds: resposta.registro_ids.slice(0, 50) } });
    revalidarFiscal();
    return { ok: true, mensagem: resposta.gravadas === 1 ? "Decisão gravada no motor." : `${resposta.gravadas} decisões gravadas no motor.`, dados: { gravadas: resposta.gravadas } };
  } catch (err) {
    return doErro(err);
  }
}

export async function apagarDecisaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<{ apagadas: number }>> {
  const r = await prepararDecisao(entrada, "apagar");
  if ("ok" in r) return r;
  const { p, def, dados } = r;
  try {
    const corpo = dados.chaves ? { chaves: dados.chaves } : { chave: dados.chave! };
    const resposta = await p.motor.cliente.apagarDecisoes(dados.raiz, def.tipo, corpo, { ator: p.ator, chave: dados.idempotencia });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: dados.empresaContabil ? "contabil.sped.decisao.apagada" : "fiscal.sped.decisao.apagada",
      entityType: "SpedDecisao", entityId: def.tipo, metadata: { nome: def.rotulo, raiz: dados.raiz, tipo: def.tipo, quantidade: resposta.apagadas, registroIds: resposta.registro_ids.slice(0, 50) } });
    revalidarFiscal();
    return { ok: true, mensagem: resposta.apagadas === 1 ? "Decisão apagada: vale de novo o que vem do documento." : `${resposta.apagadas} decisões apagadas.`, dados: { apagadas: resposta.apagadas } };
  } catch (err) {
    return doErro(err);
  }
}

export async function criarDecisaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<{ ids: number[] }>> {
  const r = await prepararDecisao(entrada, "criar");
  if ("ok" in r) return r;
  const { p, def, dados } = r;
  try {
    const resposta = await p.motor.cliente.criarDecisoes(dados.raiz, def.tipo, dados.valor ?? {}, { ator: p.ator, chave: dados.idempotencia });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: dados.empresaContabil ? "contabil.sped.decisao.criada" : "fiscal.sped.decisao.criada",
      entityType: "SpedDecisao", entityId: def.tipo, metadata: { nome: def.rotulo, raiz: dados.raiz, tipo: def.tipo, ids: resposta.ids } });
    revalidarFiscal();
    return { ok: true, mensagem: resposta.ids.length === 1 ? "Ajuste lançado no motor." : `${resposta.ids.length} ajustes lançados no motor.`, dados: { ids: resposta.ids } };
  } catch (err) {
    return doErro(err);
  }
}
