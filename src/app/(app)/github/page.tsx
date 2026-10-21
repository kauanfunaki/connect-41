import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { isFullWrite } from "@/lib/auth/context";
import { GITHUB_MODULE } from "@/lib/github/types";
import { GithubContributions } from "@/components/github/GithubContributions";
export default async function GithubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(GITHUB_MODULE), params = await searchParams, query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const canManage = await podeNoModulo(ctx, GITHUB_MODULE, "gerir");
  return <GithubContributions initialQuery={query.toString()} canManage={canManage} canConfigure={canManage && isFullWrite(ctx.role)} />;
}
