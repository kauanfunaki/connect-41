import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ACOES,
  TIPOS_DE_CADASTRO,
  areaDaAcao,
  codigosDaArea,
  codigosDoTipo,
  codigosQueBatemComABusca,
  descricaoDaAcao,
  rotuloDaAcao,
  tiposQueBatemComABusca,
} from "./acoes";

function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome !== "generated" && nome !== "node_modules") arquivos(p, out);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) out.push(p);
  }
  return out;
}

/** O texto entre os parênteses de cada chamada `nome(` do arquivo. */
function argumentos(fonte: string, nome: string): string[] {
  const out: string[] = [];
  let i = 0;
  while ((i = fonte.indexOf(`${nome}(`, i)) !== -1) {
    const antes = fonte.slice(Math.max(0, i - 16), i);
    const inicio = i + nome.length + 1;
    i = inicio;
    if (/function\s+$/.test(antes) || /[A-Za-z0-9_]$/.test(antes)) continue; // a definição, ou outro nome que termina igual
    let fundo = 1;
    let j = inicio;
    while (j < fonte.length && fundo > 0) {
      if (fonte[j] === "(") fundo++;
      else if (fonte[j] === ")") fundo--;
      j++;
    }
    out.push(fonte.slice(inicio, j - 1));
  }
  return out;
}

/** O valor de `chave:` num objeto literal (até o fim da linha). */
function valorDaChave(arg: string, chave: string): string | null {
  return arg.match(new RegExp(`\\b${chave}\\s*:\\s*([^\\n]*)`))?.[1] ?? null;
}

const CODIGO = /["'`]([A-Za-z_]+(?:\.[A-Za-z_]+)+)["'`]/g;

// Ações montadas em tempo de execução: o teste precisa saber o que elas viram.
// Uma forma nova (mapa, texto montado) que não esteja aqui faz o teste falhar
// em "toda ação gravada tem forma conhecida".
const MONTADAS: Record<string, string[]> = {
  // solicitacoes/actions.ts — `solicitacao.${acao.toLowerCase()}` nas ações sem mensagem.
  "`solicitacao.${acao.toLowerCase()}`": ["solicitacao.assumir", "solicitacao.concluir", "solicitacao.cancelar", "solicitacao.reabrir"],
};

type Varredura = { codigos: Set<string>; tipos: Set<string>; desconhecidas: string[] };

function varrer(): Varredura {
  const codigos = new Set<string>();
  const tipos = new Set<string>();
  const desconhecidas: string[] = [];
  for (const arq of arquivos(path.join(process.cwd(), "src"))) {
    const fonte = readFileSync(arq, "utf8");
    const chamadas = [...argumentos(fonte, "logAudit"), ...argumentos(fonte, "registrarExclusao")];
    for (const arg of chamadas) {
      const acao = (valorDaChave(arg, "action") ?? valorDaChave(arg, "acao"))?.replace(/,\s*$/, "").trim();
      if (acao) {
        const literais = [...acao.matchAll(CODIGO)].map((m) => m[1]);
        const mapa = acao.match(/^([A-Z_][A-Z0-9_]*)\[/);
        if (MONTADAS[acao]) MONTADAS[acao].forEach((c) => codigos.add(c));
        else if (mapa) {
          // `MAPA[chave]`: os valores do objeto `const MAPA = { … }` do mesmo arquivo.
          const corpo = fonte.match(new RegExp(`const\\s+${mapa[1]}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
          const valores = [...corpo.matchAll(CODIGO)].map((m) => m[1]);
          if (valores.length === 0) desconhecidas.push(`${path.basename(arq)}: ${acao}`);
          valores.forEach((c) => codigos.add(c));
        } else if (literais.length === 0 || acao.includes("${")) desconhecidas.push(`${path.basename(arq)}: ${acao}`);
        else literais.forEach((c) => codigos.add(c));
      }
      const tipo = valorDaChave(arg, "entityType");
      // Só nome de tabela (PascalCase): o "pasta" de `tipo === "pasta" ? … : …` fica de fora.
      if (tipo) for (const m of tipo.matchAll(/["']([A-Z][a-z][A-Za-z]*)["']/g)) tipos.add(m[1]);
    }
  }
  return { codigos, tipos, desconhecidas };
}

const VARREDURA = varrer();

describe("nome em português para toda ação da auditoria", () => {
  it("a varredura acha as ações do código (se a busca quebrar, os testes abaixo passariam vazios)", () => {
    expect(VARREDURA.codigos.size).toBeGreaterThan(200);
    expect(VARREDURA.codigos).toContain("financeiro.entry.reversed");
    expect(VARREDURA.codigos).toContain("company.delete"); // registrarExclusao
    expect(VARREDURA.codigos).toContain("financeiro.client_request.resolved"); // mapa em pendencias
    expect(VARREDURA.codigos).toContain("solicitacao.assumir"); // texto montado
    expect(VARREDURA.codigos).toContain("portal.tela.liberada"); // ternário
  });

  it("toda ação gravada tem forma conhecida — texto montado novo entra em MONTADAS", () => {
    expect(VARREDURA.desconhecidas).toEqual([]);
  });

  it("todo código gravado pelo código tem frase — ação nova sem nome quebra este teste", () => {
    const semNome = [...VARREDURA.codigos].filter((c) => !(c in ACOES)).sort();
    expect(semNome).toEqual([]);
  });

  it("todo tipo de cadastro gravado tem nome", () => {
    expect(VARREDURA.tipos.size).toBeGreaterThan(40);
    const semNome = [...VARREDURA.tipos].filter((t) => !(t in TIPOS_DE_CADASTRO)).sort();
    expect(semNome).toEqual([]);
    expect(TIPOS_DE_CADASTRO.FinanceEntry).toBe("lançamento");
    expect(TIPOS_DE_CADASTRO.DriveFolder).toBe("pasta");
  });

  it("toda ação do catálogo tem área (nenhuma cai em Outros)", () => {
    const semArea = Object.keys(ACOES).filter((c) => areaDaAcao(c) === "outros");
    expect(semArea).toEqual([]);
  });

  it("frases sem espaço sobrando nem maiúscula no começo (quem fez vem antes)", () => {
    for (const [codigo, d] of Object.entries(ACOES)) {
      expect(d.frase, codigo).toBe(d.frase.trim());
      expect(d.frase[0], codigo).toBe(d.frase[0].toLowerCase());
    }
  });
});

describe("área pela começo do código", () => {
  it("o prefixo mais longo ganha", () => {
    expect(areaDaAcao("fiscal.document.edit")).toBe("fiscal");
    expect(areaDaAcao("financeiro.entry.reversed")).toBe("bpo");
    expect(areaDaAcao("drive.folder_rename")).toBe("arquivos");
    expect(areaDaAcao("drive.template_update")).toBe("configuracoes");
    expect(areaDaAcao("integration.omie.nfse_emitir")).toBe("bpo");
    expect(areaDaAcao("integration.connect")).toBe("configuracoes");
    expect(areaDaAcao("chatwoot.contact.linked")).toBe("conversas");
    expect(areaDaAcao("chatwoot.agent.linked")).toBe("configuracoes");
    expect(areaDaAcao("tenant.ai.update")).toBe("ia");
    expect(areaDaAcao("algo.que.nao.existe")).toBe("outros");
  });

  it("assinaturas, planos e o site ficam em Clientes e planos — inclusive os códigos que chegam com o PR #192", () => {
    for (const c of [
      "subscription.create",
      "subscription_plan.update",
      "subscription_plan.site.update",
      "site.prices.show",
      "site.prices.hide",
      "site.custom_card.show",
      "site.custom_card.hide",
    ]) {
      expect(ACOES[c], c).toBeDefined();
      expect(areaDaAcao(c), c).toBe("planos");
    }
  });

  it("filtra códigos por área e por tipo", () => {
    const lista = ["fiscal.document.edit", "fiscal.document.delete", "drive.file_upload", "company.delete"];
    expect(codigosDaArea(lista, "fiscal")).toEqual(["fiscal.document.edit", "fiscal.document.delete"]);
    expect(codigosDoTipo(lista, "excluiu")).toEqual(["fiscal.document.delete", "company.delete"]);
    expect(codigosDoTipo(lista, "criou")).toEqual(["drive.file_upload"]);
  });
});

describe("código fora do catálogo", () => {
  it("vira frase neutra, com o tipo pelo verbo", () => {
    expect(descricaoDaAcao("antigo.coisa.delete")).toMatchObject({ tipo: "excluiu" });
    expect(descricaoDaAcao("antigo.coisa.create").tipo).toBe("criou");
    expect(descricaoDaAcao("antigo.coisa.update").tipo).toBe("editou");
    expect(descricaoDaAcao("antigo.coisa.sync").tipo).toBe("outro");
    expect(descricaoDaAcao("antigo.coisa.sync").frase).toContain("antigo.coisa.sync");
  });

  it("rótulo com maiúscula para listas", () => {
    expect(rotuloDaAcao("financeiro.entry.reversed")).toBe("Estornou o lançamento");
  });
});

describe("busca por frase, área e tipo", () => {
  it("acha pela frase sem acento e pela área", () => {
    expect(codigosQueBatemComABusca("estornou")).toEqual(["financeiro.entry.reversed"]);
    expect(codigosQueBatemComABusca("lixeira")).toEqual(
      expect.arrayContaining(["drive.folder_delete", "drive.file_delete", "drive.file_restore"])
    );
    expect(codigosQueBatemComABusca("societario")).toContain("process.open");
    expect(codigosQueBatemComABusca("a")).toEqual([]);
  });

  it("acha o tipo de cadastro pelo nome", () => {
    expect(tiposQueBatemComABusca("lancamento")).toContain("FinanceEntry");
    expect(tiposQueBatemComABusca("pasta")).toEqual(expect.arrayContaining(["DriveFolder", "DriveTemplateFolder"]));
  });
});
