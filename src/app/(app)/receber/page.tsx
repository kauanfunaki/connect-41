import { ContasPage } from "@/components/financeiro/ContasPage";

export const dynamic = "force-dynamic";

export default function ReceberPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <ContasPage kind="RECEBER" modulo="bpo_contas_receber" searchParams={searchParams} />;
}
