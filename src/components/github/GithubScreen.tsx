import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { isFullWrite } from "@/lib/auth/context";
import { GITHUB_MODULE } from "@/lib/github/types";
import { GithubContributions } from "./GithubContributions";

export async function GithubScreen({ searchParams, view }: { searchParams: Promise<Record<string, string | string[] | undefined>>; view: "general" | "developers" }) {
  const { ctx } = await abrirTelaDoModulo(GITHUB_MODULE), params = await searchParams, query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const canManage = await podeNoModulo(ctx, GITHUB_MODULE, "gerir");
  return <GithubContributions view={view} initialQuery={query.toString()} canConfigure={canManage && isFullWrite(ctx.role)} />;
}
