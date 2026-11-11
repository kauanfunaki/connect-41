// A porta do robô da auditoria de contratos (o que lê as pastas da rede).
//
// O robô veio do Aditiva Pronto sem mudança: chama `POST {base}/audit/robot/...`
// com `Authorization: Bearer <token>`. No Connect a base é `https://<app>/api` e
// o token é o de uma automação do Ops Center com o identificador
// `auditoria_contratos` — no PC da rede só mudam AUDIT_API_BASE_URL e
// AUDIT_ROBOT_TOKEN. As respostas (corpo, 204 e códigos de erro) são as do
// Aditiva, porque o robô decide o que fazer por elas: 409 = job inativo (para a
// varredura), 4xx = não tenta de novo, 5xx/429 = tenta de novo.

import { ZodError, type z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { autenticarWatcher, ErroOps } from "@/lib/ops/servidor";
import { noEscritorio } from "./servidor/contexto";
import { AppError } from "./servidor/erros";

/** O identificador da automação do robô no Ops Center. */
export const SLUG_DO_ROBO = "auditoria_contratos";

const MODULO_HONORARIOS = "controladoria_honorarios";

/** Corpo máximo aceito (o texto de um lote chega a 1,5 MB; o Aditiva aceitava 5 MB). */
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

const erro = (status: number, mensagem: string) =>
  Response.json({ error: mensagem }, { status, headers: { "Cache-Control": "no-store" } });

/** A primeira falha do Zod em palavras: "Dados inválidos — pastas.0.nomePasta: …". */
export function resumirErroZod(e: ZodError): string {
  const i = e.issues[0];
  if (!i) return "Dados inválidos.";
  const caminho = i.path.join(".");
  return `Dados inválidos — ${caminho ? `${caminho}: ` : ""}${i.message}`;
}

export function validar<T extends z.ZodTypeAny>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new AppError(400, resumirErroZod(r.error));
  return r.data;
}

const idDeJob = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jobIdValido(id: string): string {
  if (!idDeJob.test(id)) throw new AppError(400, "Id de job inválido.");
  return id;
}

async function lerCorpo(request: Request): Promise<unknown> {
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > TAMANHO_MAXIMO) throw new AppError(413, "Envio grande demais. Divida em lotes menores.");
  const texto = await request.text();
  if (texto.length > TAMANHO_MAXIMO) throw new AppError(413, "Envio grande demais. Divida em lotes menores.");
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto);
  } catch {
    throw new AppError(400, "JSON inválido.");
  }
}

/**
 * Atende uma chamada do robô: confere o token, o módulo e o corpo, e roda
 * `fazer` no escritório dono do token. `null` vira 204 (nada a fazer).
 */
export async function atenderRobo(request: Request, fazer: (corpo: unknown) => Promise<object | null>): Promise<Response> {
  try {
    const credencial = await autenticarWatcher(request, SLUG_DO_ROBO);
    if (!(await isModuleEnabled(credencial.tenantId, MODULO_HONORARIOS))) {
      return erro(403, "O módulo Contratos e honorários está desligado neste escritório.");
    }
    const corpo = await lerCorpo(request);
    const resposta = await noEscritorio(credencial.tenantId, () => fazer(corpo));
    // Sinal de vida também no Ops Center, para a automação aparecer ativa lá.
    await getPrisma()
      .opsWatcher.updateMany({ where: { tenantId: credencial.tenantId, slug: SLUG_DO_ROBO }, data: { lastHeartbeatAt: new Date() } })
      .catch(() => undefined);
    if (resposta === null) return new Response(null, { status: 204 });
    return Response.json(resposta, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ErroOps) return erro(err.status, err.message);
    if (err instanceof AppError) return erro(err.statusCode, err.message);
    if (err instanceof ZodError) return erro(400, resumirErroZod(err));
    console.error("[honorarios] falha na rota do robô", err instanceof Error ? err.message : err);
    return erro(500, "Erro interno ao atender o robô.");
  }
}
