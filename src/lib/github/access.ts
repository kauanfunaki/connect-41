import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { GithubError } from "./rules";
import { GITHUB_MODULE } from "./types";

// "configurar" (credenciais do OAuth App, conectar e desconectar) pede o mesmo
// "gerir" no módulo: o coordenador do Tech configura sem depender do admin (04/11/2026).
export async function githubAccess(level: "ver" | "gerir" | "configurar" = "ver") {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) throw new GithubError("Entre novamente para continuar.", 401);
  if (!await podeNoModulo(ctx, GITHUB_MODULE, level === "configurar" ? "gerir" : level)) {
    throw new GithubError("Módulo GitHub indisponível para este acesso do Tech.", 403);
  }
  return ctx;
}
