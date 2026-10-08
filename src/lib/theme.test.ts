import { afterEach, describe, expect, it, vi } from "vitest";
import { SCRIPT_DO_TEMA, readPreferencia, semEscolhaSegueOAparelho } from "./theme";

// O tema sem cookie (08/10/2026): o portal do cliente segue o aparelho, e a
// equipe continua no claro. O script do <head> roda antes da pintura, então o
// teste o executa de verdade contra um navegador de mentira.

type Navegador = {
  atributo: string;
  ouvintes: (() => void)[];
  escuro: boolean;
  executar: () => void;
  trocarAparelho: (escuro: boolean) => void;
};

function navegador({ cookie, caminho, escuro, atributo = "light" }: { cookie: string; caminho: string; escuro: boolean; atributo?: string }): Navegador {
  const n: Navegador = {
    atributo,
    ouvintes: [],
    escuro,
    executar: () => {},
    trocarAparelho: (e) => {
      n.escuro = e;
      for (const f of n.ouvintes) f();
    },
  };
  const document = {
    cookie,
    documentElement: { setAttribute: (_nome: string, valor: string) => void (n.atributo = valor) },
  };
  const window = {
    matchMedia: () => ({
      get matches() {
        return n.escuro;
      },
      addEventListener: (_evento: string, f: () => void) => n.ouvintes.push(f),
    }),
  };
  const location = { pathname: caminho };
  n.executar = () => new Function("document", "window", "location", SCRIPT_DO_TEMA)(document, window, location);
  return n;
}

describe("SCRIPT_DO_TEMA", () => {
  it("portal sem cookie, aparelho no escuro: escuro antes da pintura", () => {
    const n = navegador({ cookie: "", caminho: "/portal", escuro: true });
    n.executar();
    expect(n.atributo).toBe("dark");
  });

  it("portal sem cookie acompanha a troca do aparelho com a tela aberta", () => {
    const n = navegador({ cookie: "outro=1", caminho: "/portal/login", escuro: false });
    n.executar();
    expect(n.atributo).toBe("light");
    n.trocarAparelho(true);
    expect(n.atributo).toBe("dark");
  });

  it("equipe sem cookie: fica no claro do servidor, mesmo com o aparelho no escuro", () => {
    const n = navegador({ cookie: "", caminho: "/home", escuro: true });
    n.executar();
    n.trocarAparelho(true);
    expect(n.atributo).toBe("light");
  });

  it("/portalzinho não é o portal", () => {
    const n = navegador({ cookie: "", caminho: "/portalzinho", escuro: true });
    n.executar();
    expect(n.atributo).toBe("light");
  });

  it("escolha gravada de claro ou escuro vale nos dois lados, sem seguir o aparelho", () => {
    for (const caminho of ["/portal", "/home"]) {
      const claro = navegador({ cookie: "theme=light", caminho, escuro: true });
      claro.executar();
      claro.trocarAparelho(true);
      expect(claro.atributo).toBe("light");

      const escuro = navegador({ cookie: "a=1; theme=dark", caminho, escuro: false, atributo: "dark" });
      escuro.executar();
      escuro.trocarAparelho(false);
      expect(escuro.atributo).toBe("dark");
    }
  });

  it("theme=system segue o aparelho nos dois lados, como desde 30/09", () => {
    for (const caminho of ["/portal/conta", "/configuracoes"]) {
      const n = navegador({ cookie: "theme=system", caminho, escuro: true });
      n.executar();
      expect(n.atributo).toBe("dark");
      n.trocarAparelho(false);
      expect(n.atributo).toBe("light");
    }
  });
});

describe("semEscolhaSegueOAparelho", () => {
  it("só as rotas do portal", () => {
    expect(semEscolhaSegueOAparelho("/portal")).toBe(true);
    expect(semEscolhaSegueOAparelho("/portal/conta")).toBe(true);
    expect(semEscolhaSegueOAparelho("/portalzinho")).toBe(false);
    expect(semEscolhaSegueOAparelho("/home")).toBe(false);
    expect(semEscolhaSegueOAparelho("/")).toBe(false);
  });
});

describe("readPreferencia", () => {
  afterEach(() => vi.unstubAllGlobals());

  function ler(cookie: string, caminho: string, atributo = "light") {
    vi.stubGlobal("document", { cookie, documentElement: { getAttribute: () => atributo } });
    vi.stubGlobal("window", { location: { pathname: caminho } });
    return readPreferencia();
  }

  it("sem cookie: do aparelho no portal, o tema da tela na equipe", () => {
    expect(ler("", "/portal/conta")).toBe("system");
    expect(ler("", "/configuracoes")).toBe("light");
    expect(ler("", "/configuracoes", "dark")).toBe("dark");
  });

  it("com cookie, o que está gravado", () => {
    expect(ler("theme=light", "/portal/conta")).toBe("light");
    expect(ler("theme=dark", "/portal/conta")).toBe("dark");
    expect(ler("theme=system", "/configuracoes")).toBe("system");
  });
});
