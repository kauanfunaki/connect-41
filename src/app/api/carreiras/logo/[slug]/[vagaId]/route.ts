import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { configDeCarreiras, portalNoHost } from "@/lib/carreiras/enderecoDeCarreiras";
import { arquivoDoLogo } from "@/lib/carreiras/apresentacao";
import { whereDasVagasDoPortal } from "@/lib/carreiras/portal";
import { escritorioDoPortal } from "@/lib/carreiras/vagasDoPortal";

// O logo da empresa de uma vaga publicada, para os cartões do portal de vagas
// (15/10/2026). O logo da empresa mora em `/api/company-logos/`, que pede
// sessão da equipe; esta rota é pública, mas só entrega o logo quando a vaga
// está no portal (do escritório, publicada, aberta e no prazo) — o portal não
// vira um jeito de listar logos de cliente.
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;
const naoEncontrado = () => new Response("Não encontrado", { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; vagaId: string }> }) {
  const { slug, vagaId } = await params;
  if (!SLUG.test(slug) || !ID.test(vagaId)) return naoEncontrado();
  // No endereço do 41 Carreiras só existe o escritório da 41.
  if (!portalNoHost(slug, req.headers.get("host"), configDeCarreiras())) return naoEncontrado();

  const tenant = await escritorioDoPortal(slug);
  if (!tenant) return naoEncontrado();
  const vaga = await getPrisma().vaga.findFirst({
    where: { id: vagaId, ...whereDasVagasDoPortal(tenant.id, new Date()) },
    select: { company: { select: { logoUrl: true } } },
  });
  const arquivo = arquivoDoLogo(vaga?.company.logoUrl);
  if (!arquivo) return naoEncontrado();

  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "uploads", "companies", arquivo.nome));
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": arquivo.tipo, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return naoEncontrado();
  }
}
