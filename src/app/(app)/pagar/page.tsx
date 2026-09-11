import { ContasPage } from "@/components/financeiro/ContasPage";

export const dynamic = "force-dynamic";

export default function PagarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <ContasPage kind="PAGAR" modulo="bpo_contas_pagar" searchParams={searchParams} />;
}
