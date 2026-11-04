import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { GITHUB_MODULE } from "@/lib/github/types";
import { GithubContributions, type View } from "./GithubContributions";

// Quem gerencia o módulo (o coordenador do Tech e os administradores) vê a aba
// Times e o atalho da Integração (04/11/2026). Antes, só administradores.
export async function GithubScreen({ searchParams, view }: { searchParams: Promise<Record<string, string | string[] | undefined>>; view: View }) {
  const { ctx } = await abrirTelaDoModulo(GITHUB_MODULE), params = await searchParams, query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const canManage = await podeNoModulo(ctx, GITHUB_MODULE, "gerir");
  if (view === "teams" && !canManage) notFound();
  return <GithubContributions view={view} initialQuery={query.toString()} canConfigure={canManage} />;
}
