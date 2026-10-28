import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { OpsCenter } from "@/components/ops/OpsCenter";

export default async function OpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("tech_ops_center");
  return <OpsCenter key={JSON.stringify(await searchParams)} podeGerir={await podeNoModulo(ctx, "tech_ops_center", "gerir")} podeAgir={await podeNoModulo(ctx, "tech_ops_center", "agir")} />;
}
