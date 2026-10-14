import { describe, expect, it } from "vitest";
import { buildJobPostingJsonLd } from "./jobPostingSchema";

const base = {
  title: "Analista Fiscal",
  description: "Apuração de impostos.",
  datePosted: new Date("2026-10-10T12:00:00Z"),
  companyName: "Metalúrgica Iguaçu",
  quantity: 1,
};

describe("buildJobPostingJsonLd — o endereço da vaga", () => {
  // 41 Carreiras (14/10/2026): o mesmo endereço do canônico, no portal da 41.
  it("leva o url canônico quando há um", () => {
    const schema = JSON.parse(buildJobPostingJsonLd({ ...base, url: "https://carreiras.41contabil.com.br/vagas/v1" }));
    expect(schema.url).toBe("https://carreiras.41contabil.com.br/vagas/v1");
    expect(schema.hiringOrganization).toEqual({ "@type": "Organization", name: "Metalúrgica Iguaçu" });
  });

  it("sem endereço absoluto, fica de fora", () => {
    expect(JSON.parse(buildJobPostingJsonLd(base))).not.toHaveProperty("url");
    expect(JSON.parse(buildJobPostingJsonLd({ ...base, url: null }))).not.toHaveProperty("url");
  });
});
