import type { NextRequest } from "next/server";
import { exportarContas } from "@/lib/financeiro/exportacaoServidor";

export const dynamic = "force-dynamic";

// O CSV da lista de contas a pagar, com os filtros da tela (lote D, 20/10).
export function GET(req: NextRequest) {
  return exportarContas(req, "PAGAR", "bpo_contas_pagar");
}
