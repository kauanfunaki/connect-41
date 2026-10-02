import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { chaveDoCaminho } from "./caminho";
import { ARTIGOS, artigoDoCaminho, PARES_DE_CAMINHO } from "./artigos";
import { getModuleDef, getModuleRoute } from "@/lib/module-catalog";

describe("qual artigo explica a tela", () => {
  const pares = [
    { caminho: "/dre", chave: "bpo_dre" },
    { caminho: "/dre/economica", chave: "dre_economica" },
    { caminho: "/processos", chave: "societario_processos" },
  ];

  it("o caminho mais específico ganha, por segmento inteiro", () => {
    expect(chaveDoCaminho("/dre/economica", pares)).toBe("dre_economica");
    expect(chaveDoCaminho("/dre/economica/2026", pares)).toBe("dre_economica");
    expect(chaveDoCaminho("/dre/analises", pares)).toBe("bpo_dre");
    expect(chaveDoCaminho("/processos/abc-123", pares)).toBe("societario_processos");
    expect(chaveDoCaminho("/processosx", pares)).toBeNull();
    expect(chaveDoCaminho("/home", pares)).toBeNull();
  });
});

describe("os artigos", () => {
  it("cada chave aparece uma vez, e é um módulo do catálogo ou uma tela geral", () => {
    const chaves = ARTIGOS.map((a) => a.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const a of ARTIGOS) {
      if (a.chave.startsWith("geral:")) continue;
      expect(getModuleDef(a.chave), a.chave).toBeDefined();
    }
  });

  it("o artigo de módulo cobre a rota do módulo", () => {
    for (const a of ARTIGOS) {
      const rota = a.chave.startsWith("geral:") ? null : getModuleRoute(a.chave);
      if (rota) expect(a.caminhos, a.chave).toContain(rota);
    }
  });

  it("nenhum caminho é de dois artigos — o \"?\" não pode ficar em dúvida", () => {
    const caminhos = PARES_DE_CAMINHO.map((p) => p.caminho);
    expect(caminhos.filter((c, i) => caminhos.indexOf(c) !== i)).toEqual([]);
  });

  it("todo caminho é de uma tela que existe", () => {
    for (const { caminho, chave } of PARES_DE_CAMINHO) {
      expect(caminho.startsWith("/"), chave).toBe(true);
      expect(existsSync(path.join("src", "app", "(app)", ...caminho.split("/").filter(Boolean))), `${chave}: ${caminho}`).toBe(true);
    }
  });

  it("o \"?\" de cada rota de módulo acha o seu artigo", () => {
    for (const a of ARTIGOS) {
      for (const c of a.caminhos) expect(artigoDoCaminho(c)?.chave, c).toBe(a.chave);
    }
  });

  it("artigo com conteúdo: resumo, seções com passos, e texto de qualquer escritório", () => {
    for (const a of ARTIGOS) {
      expect(a.titulo.trim(), a.chave).not.toBe("");
      expect(a.resumo.length, a.chave).toBeGreaterThan(20);
      expect(a.secoes.length, a.chave).toBeGreaterThan(0);
      for (const s of a.secoes) expect(s.passos.length, `${a.chave} · ${s.titulo}`).toBeGreaterThan(1);
      // O Connect é de vários escritórios: o texto não fala "a 41".
      const texto = JSON.stringify(a);
      expect(texto, a.chave).not.toMatch(/\b(da|na|a|à|pela|com a) 41\b/i);
    }
  });
});
