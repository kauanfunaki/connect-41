// O que as rotas de escrita do modo real têm em comum (envios de arquivo,
// §13.0.9 e §14.3, e as sessões de upload, §14.4): a resposta é sempre
// `ResultadoDoMotor` em JSON, como nas Server Actions, e o status HTTP
// acompanha.

import "server-only";
import { NextResponse } from "next/server";
import { ErroDoMotor } from "@/lib/sped/motor";
import type { ResultadoDoMotor } from "./acoes";

export const responder = (r: ResultadoDoMotor<unknown>, status = r.ok ? 200 : 400) => NextResponse.json(r, { status, headers: { "Cache-Control": "no-store" } });

/** O status da resposta do Connect para um erro do motor (ou local, `status 0`). */
export const statusDoErro = (err: unknown) => {
  if (!(err instanceof ErroDoMotor)) return 502;
  if (err.status === 0) return err.codigo === "tempo_esgotado" || err.codigo === "falha_de_rede" ? 504 : 400;
  if (err.ocupado) return 503;
  return err.status >= 500 ? 502 : err.status;
};
