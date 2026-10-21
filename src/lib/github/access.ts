import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { GithubError } from "./rules";
import { GITHUB_MODULE } from "./types";

export async function githubAccess(level: "ver" | "gerir" | "configurar" = "ver") {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) throw new GithubError("Entre novamente para continuar.", 401);
  if (!await podeNoModulo(ctx, GITHUB_MODULE, level === "configurar" ? "gerir" : level) || level === "configurar" && !isFullWrite(ctx.role)) {
    throw new GithubError("Módulo GitHub indisponível para este acesso do Tech.", 403);
  }
  return ctx;
}
