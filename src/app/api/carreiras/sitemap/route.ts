import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { configDeCarreiras, ehHostDeCarreiras } from "@/lib/carreiras/enderecoDeCarreiras";
import { sitemapDoPortal } from "@/lib/carreiras/indexacao";
import { whereDasVagasDoPortal } from "@/lib/carreiras/portal";
import { escritorioDoPortal } from "@/lib/carreiras/vagasDoPortal";

// O `/sitemap.xml` do 41 Carreiras: o hub e as vagas abertas da 41, pela mesma
// regra da lista. O proxy reescreve para cá só no endereço do portal; em
// qualquer outro host, 404 sem tocar no banco.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const config = configDeCarreiras();
  if (!config?.tenantSlug || !ehHostDeCarreiras(req.headers.get("host"), config)) {
    return new Response("Não encontrado", { status: 404 });
  }

  const tenant = await escritorioDoPortal(config.tenantSlug);
  const vagas = tenant
    ? await getPrisma().vaga.findMany({
        where: whereDasVagasDoPortal(tenant.id, new Date()),
        select: { id: true, updatedAt: true },
        orderBy: { openedAt: "desc" },
        take: 5000,
      })
    : [];

  return new Response(sitemapDoPortal(config.principal, vagas), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
