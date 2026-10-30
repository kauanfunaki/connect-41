import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { ETAPAS_DO_SPED, caminhoDaEtapa } from "@/lib/fiscal/sped/etapas";
import { MODULOS_DA_ABA } from "@/lib/fiscal/sped/local/servidor";

/** A entrada do SPED: a primeira etapa que a pessoa abre, com a empresa e a competência da URL. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getAuthContext();
  const params = await searchParams;
  for (const etapa of ETAPAS_DO_SPED) {
    if (!(await Promise.all(MODULOS_DA_ABA[etapa.chave].map(m => podeNoModulo(ctx, m, "ver")))).some(Boolean)) continue;
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string" && ["empresa", "competencia"].includes(e[0])));
    redirect(q.size ? `${caminhoDaEtapa(etapa.chave)}?${q}` : caminhoDaEtapa(etapa.chave));
  }
  notFound();
}
