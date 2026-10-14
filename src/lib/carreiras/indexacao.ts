// robots.txt e sitemap.xml do 41 Carreiras (14/10/2026) — o que o Google lê
// para achar o hub e as vagas (junto com o JSON-LD de cada vaga, que é o que
// as põe no Google for Jobs). Só no endereço do portal: o Connect não tem
// robots nem sitemap, e continua sem.
//
// Indexa a página inicial e as vagas abertas; a conta do candidato fica de
// fora (as páginas dela já dizem `noindex`).

/** O robots.txt do portal, apontando o sitemap no endereço principal. */
export function robotsDoPortal(principal: string): string {
  return ["User-agent: *", "Allow: /", "Disallow: /minha-conta", "", `Sitemap: https://${principal}/sitemap.xml`, ""].join("\n");
}

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xml = (t: string) => t.replace(/[&<>"']/g, (c) => ESCAPE[c]!);

/** O sitemap: o hub e cada vaga aberta, com a data da última alteração. */
export function sitemapDoPortal(principal: string, vagas: { id: string; updatedAt: Date }[]): string {
  const url = (loc: string, lastmod?: Date) =>
    `  <url><loc>${xml(loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url(`https://${principal}/`),
    ...vagas.map((v) => url(`https://${principal}/vagas/${encodeURIComponent(v.id)}`, v.updatedAt)),
    "</urlset>",
    "",
  ].join("\n");
}
