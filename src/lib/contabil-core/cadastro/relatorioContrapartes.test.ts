// Gabarito do leitor das relações fiscais (scripts/contabil-core/gabarito_contrapartes.py): o que o
// `ler_relatorio_contrapartes` do Contábil Core devolve para cada planilha inventada, e a validação
// de `ContraparteDadosCadastrais` para entradas variadas.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ErroDeRelatorio, lerRelatorioContrapartes, type RelatorioContrapartes } from "./relatorioContrapartes";
import { validarDadosCadastrais } from "./dadosCadastrais";
import { casefoldPy } from "./casefold";

type LinhaPy = {
  numero_linha: number;
  documento: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  conta_numero: number | null;
  dados_cadastrais: [string, string][];
  documento_valido: boolean;
  erro_documento: string | null;
};
type ResultadoPy =
  | { erro: { motivo: string; mensagem: string } }
  | { excecao: string }
  | {
      tipo: string;
      planilha: string;
      titulo: string | null;
      empresa: string | null;
      empresa_documento: string | null;
      campos_reconhecidos: string[];
      campos_ignorados: string[];
      linhas: LinhaPy[];
    };

const pasta = join(__dirname, "gabarito");

/** O resultado do porte no formato do gabarito (dados cadastrais como pares, para conferir a ordem). */
function comoPy(r: RelatorioContrapartes): ResultadoPy {
  return {
    tipo: r.tipo,
    planilha: r.planilha,
    titulo: r.titulo,
    empresa: r.empresa,
    empresa_documento: r.empresaDocumento,
    campos_reconhecidos: r.camposReconhecidos,
    campos_ignorados: r.camposIgnorados,
    linhas: r.linhas.map((l) => ({
      numero_linha: l.numeroLinha,
      documento: l.documento,
      razao_social: l.razaoSocial,
      nome_fantasia: l.nomeFantasia,
      conta_numero: l.contaNumero,
      dados_cadastrais: Object.entries(l.dadosCadastrais),
      documento_valido: l.documentoValido,
      erro_documento: l.erroDocumento,
    })),
  };
}

function lerComoPy(bytes: Uint8Array, nome: string): ResultadoPy {
  try {
    return comoPy(lerRelatorioContrapartes(bytes, nome));
  } catch (e) {
    if (e instanceof ErroDeRelatorio) return { erro: { motivo: e.motivo, mensagem: e.message } };
    throw e;
  }
}

const arquivos = readdirSync(pasta)
  .filter((n) => n.startsWith("contrapartes-") && !n.endsWith(".json"))
  .sort();

describe("lerRelatorioContrapartes × ler_relatorio_contrapartes", () => {
  it("o gabarito existe", () => expect(arquivos.length).toBeGreaterThanOrEqual(30));

  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const esperado = JSON.parse(readFileSync(join(pasta, `${arquivo}.json`), "utf8")) as ResultadoPy;
      const bytes = new Uint8Array(readFileSync(join(pasta, arquivo)));
      const nome = arquivo.slice("contrapartes-".length);
      if ("excecao" in esperado) {
        // O original deixa escapar a exceção do xlrd (vira erro 500); o porte recusa com mensagem.
        expect(lerComoPy(bytes, nome)).toMatchObject({ erro: { motivo: "xls_invalido" } });
        return;
      }
      expect(lerComoPy(bytes, nome)).toEqual(esperado);
    });
  }
});

describe("validarDadosCadastrais × ContraparteDadosCadastrais", () => {
  const casos = JSON.parse(readFileSync(join(pasta, "dados-cadastrais.json"), "utf8")) as {
    entrada: Record<string, unknown>;
    saida: { ok: Record<string, string | null> } | { erro: string };
  }[];
  for (const [i, { entrada, saida }] of casos.entries()) {
    it(`caso ${i}: ${JSON.stringify(entrada).slice(0, 60)}`, () => {
      const v = validarDadosCadastrais(entrada);
      if ("ok" in saida) expect(v).toEqual({ ok: true, dados: saida.ok });
      else expect(v).toMatchObject({ ok: false, campo: saida.erro });
    });
  }
});

describe("casefoldPy", () => {
  it("cobre o que o toLowerCase não faz", () => {
    expect(casefoldPy("Straße ẞ")).toBe("strasse ss");
    expect(casefoldPy("ΟΔΟΣ")).toBe("οδοσ");
    expect(casefoldPy("ı")).toBe("ı");
    expect(casefoldPy("ﬁ")).toBe("fi");
    expect(casefoldPy("İ")).toBe("i̇");
  });
});
