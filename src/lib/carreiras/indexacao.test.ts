import { describe, expect, it } from "vitest";
import { robotsDoPortal, sitemapDoPortal } from "./indexacao";

describe("robots e sitemap do 41 Carreiras", () => {
  it("o robots libera o portal, guarda a conta do candidato e aponta o sitemap", () => {
    expect(robotsDoPortal("carreiras.41contabil.com.br")).toBe(
      "User-agent: *\nAllow: /\nDisallow: /minha-conta\n\nSitemap: https://carreiras.41contabil.com.br/sitemap.xml\n"
    );
  });

  it("o sitemap tem o hub e cada vaga, no endereço principal", () => {
    const xml = sitemapDoPortal("carreiras.41contabil.com.br", [
      { id: "v1", updatedAt: new Date("2026-10-13T18:00:00Z") },
      { id: "v2", updatedAt: new Date("2026-10-01T09:00:00Z") },
    ]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://carreiras.41contabil.com.br/",
      "https://carreiras.41contabil.com.br/vagas/v1",
      "https://carreiras.41contabil.com.br/vagas/v2",
    ]);
    expect(xml).toContain("<lastmod>2026-10-13</lastmod>");
  });

  it("sem vagas, só o hub", () => {
    expect(sitemapDoPortal("carreiras.useconnect.com.br", []).match(/<url>/g)).toHaveLength(1);
  });
});
