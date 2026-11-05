import { AreaLocalSped } from "@/components/fiscal/sped/AreaLocalSped";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AreaLocalSped aba="apuracao" params={await searchParams} />;
}
