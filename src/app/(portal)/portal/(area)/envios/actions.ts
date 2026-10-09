"use server";

// O aceite de um envio pelo portal (08/10/2026). É escrita: confere no banco
// que a conta continua ativa (`clienteAtivoDoPortal`), como responder uma
// pendência ou aprovar um pagamento. A regra do aceite — o que se preenche, o
// que pode ser aceito e a gravação que não sobrescreve — é a mesma do link
// por e-mail (`aceitarEnvioDoCliente` → `lib/envios/regras.ts` e
// `recordClientDocumentSignature`).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { clientIp } from "@/lib/rateLimit";
import { aceitarEnvioDoCliente } from "@/lib/envios/consultas";
import { rotaDoEnvioNoPortal } from "@/lib/envios/regras";

export async function aceitarEnvio(id: string, form: FormData): Promise<{ error: string } | { ok: true }> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { error: "Sessão expirada. Entre de novo no portal." };
  if (!cliente.modulos.has("portal_solicitacoes")) return { error: "Documento não encontrado." };

  const h = await headers();
  const r = await aceitarEnvioDoCliente(
    { tenantId: cliente.tenantId, companyIds: cliente.companyIds },
    cliente.usuario.email,
    id,
    { nome: form.get("signerName"), consentimento: form.get("consent") },
    { ipAddress: clientIp({ headers: h }), userAgent: h.get("user-agent") }
  );
  if (!r.ok) return { error: r.erro };

  revalidatePath(rotaDoEnvioNoPortal(id));
  revalidatePath("/portal/envios");
  revalidatePath("/portal");
  return { ok: true };
}
