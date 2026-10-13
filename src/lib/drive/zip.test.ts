import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { caminhoNaLixeira, type PastaDoDrive } from "./regras";
import {
  MAX_ARQUIVOS_NO_ZIP,
  MAX_BYTES_NO_ZIP,
  MAX_NOME_NO_ZIP,
  contentDispositionDeAnexo,
  criarNomeador,
  montarConteudoDoZip,
  nomeDoZip,
  nomeSeguroNoZip,
  problemaDoZip,
  streamDoZip,
  type ArquivoParaOZip,
  type EntradaDoZip,
} from "./zip";

// O zip da pasta sem banco e sem disco: o que entra, com que nome, o teto e
// os bytes que saem (abertos de volta com o próprio fflate).

const pasta = (id: string, parentId: string | null, extra: Partial<PastaDoDrive> = {}): PastaDoDrive => ({
  id,
  name: id,
  parentId,
  companyId: "emp",
  sectorCode: null,
  systemKey: null,
  sharedWithPortal: false,
  deletedAt: null,
  ...extra,
});

const arquivo = (id: string, folderId: string, extra: Partial<ArquivoParaOZip> = {}): ArquivoParaOZip => ({
  id,
  name: `${id}.pdf`,
  sizeBytes: 10,
  mimeType: "application/pdf",
  storageKey: `t/${id}.pdf`,
  folderId,
  createdAt: new Date("2026-10-01T12:00:00Z"),
  deletedAt: null,
  ...extra,
});

const foraDaLixeira = (caminho: PastaDoDrive[]) => !caminhoNaLixeira(caminho);
const caminhos = (entradas: EntradaDoZip[]) => entradas.map((e) => e.caminho);

describe("nomeSeguroNoZip", () => {
  it("barra e `..` nunca sobem de pasta: o nome vira um pedaço só", () => {
    expect(nomeSeguroNoZip("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(nomeSeguroNoZip("..\\..\\Windows\\win.ini")).toBe(".._.._Windows_win.ini");
    expect(nomeSeguroNoZip("..")).toBe("sem nome");
    expect(nomeSeguroNoZip(".")).toBe("sem nome");
  });

  it("troca os caracteres que o Windows não aceita", () => {
    expect(nomeSeguroNoZip('a:b*c?d"e<f>g|h.pdf')).toBe("a_b_c_d_e_f_g_h.pdf");
  });

  it("tira controle, espaço sobrando e ponto ou espaço do fim", () => {
    expect(nomeSeguroNoZip("a\u0000b\nc\td.pdf")).toBe("a b c d.pdf");
    expect(nomeSeguroNoZip("  contrato .  ")).toBe("contrato");
    expect(nomeSeguroNoZip("   ")).toBe("sem nome");
    expect(nomeSeguroNoZip(null)).toBe("sem nome");
  });

  it("nome de dispositivo do Windows ganha um _ na frente; parecido não", () => {
    expect(nomeSeguroNoZip("CON")).toBe("_CON");
    expect(nomeSeguroNoZip("nul.txt")).toBe("_nul.txt");
    expect(nomeSeguroNoZip("com1.pdf")).toBe("_com1.pdf");
    expect(nomeSeguroNoZip("Console.pdf")).toBe("Console.pdf");
    expect(nomeSeguroNoZip("auxiliar.xlsx")).toBe("auxiliar.xlsx");
  });

  it("mantém os acentos, na forma composta (o mesmo nome vindo do Mac e do Windows)", () => {
    expect(nomeSeguroNoZip("Certidões.pdf")).toBe("Certidões.pdf");
    expect(nomeSeguroNoZip("Certidões.pdf")).toBe(nomeSeguroNoZip("Certidões.pdf"));
  });

  it("corta nome comprido sem perder a extensão", () => {
    const nome = nomeSeguroNoZip(`${"a".repeat(300)}.pdf`);
    expect([...nome].length).toBe(MAX_NOME_NO_ZIP);
    expect(nome.endsWith(".pdf")).toBe(true);
  });
});

describe("nomes repetidos", () => {
  it("ganham (2), (3) — sem diferenciar maiúscula, como o Windows", () => {
    const nomear = criarNomeador();
    expect(["Guia.pdf", "guia.pdf", "GUIA.PDF"].map((n) => nomear(n, false))).toEqual(["Guia.pdf", "guia (2).pdf", "GUIA (3).PDF"]);
  });

  it("pasta e arquivo dividem os nomes; pasta não tem extensão", () => {
    const nomear = criarNomeador();
    expect(nomear("2026", true)).toBe("2026");
    expect(nomear("2026", false)).toBe("2026 (2)");
    expect(nomear("Notas.2026", true)).toBe("Notas.2026");
    expect(nomear("Notas.2026", true)).toBe("Notas.2026 (2)");
  });

  it("o sufixo não colide com um arquivo que já se chamava assim", () => {
    const nomear = criarNomeador();
    const nomes = ["Guia (2).pdf", "Guia.pdf", "Guia.pdf"].map((n) => nomear(n, false));
    expect(nomes).toEqual(["Guia (2).pdf", "Guia.pdf", "Guia (3).pdf"]);
  });

  it("nomes que só ficam iguais depois de limpos também", () => {
    const nomear = criarNomeador();
    expect([nomear("a:b.pdf", false), nomear("a?b.pdf", false), nomear("a_b.pdf", false)]).toEqual(["a_b.pdf", "a_b (2).pdf", "a_b (3).pdf"]);
  });
});

describe("montarConteudoDoZip", () => {
  const pastas = [
    pasta("raiz", null, { name: "Fiscal" }),
    pasta("p2026", "raiz", { name: "2026" }),
    pasta("jan", "p2026", { name: "Janeiro" }),
    pasta("vazia", "raiz", { name: "Vazia" }),
    pasta("velha", "raiz", { name: "Velha", deletedAt: new Date() }),
    pasta("dentro-da-velha", "velha", { name: "Dentro" }),
    pasta("vizinha", null, { name: "Contábil" }),
  ];
  const arquivos = [
    arquivo("a", "raiz"),
    arquivo("b", "p2026", { sizeBytes: 20 }),
    arquivo("c", "jan", { sizeBytes: 30 }),
    arquivo("apagado", "raiz", { deletedAt: new Date() }),
    arquivo("na-velha", "dentro-da-velha"),
    arquivo("da-vizinha", "vizinha"),
  ];

  it("leva as subpastas com a estrutura, a partir da pasta baixada (ela não vira pasta no zip)", () => {
    const zip = montarConteudoDoZip({ raizId: "raiz", pastas, arquivos, alcanca: foraDaLixeira })!;
    expect(caminhos(zip.entradas)).toEqual(["a.pdf", "2026/", "2026/b.pdf", "2026/Janeiro/", "2026/Janeiro/c.pdf", "Vazia/"]);
    expect(zip).toMatchObject({ arquivos: 3, bytes: 60, pastas: 3 });
  });

  it("baixar uma subpasta começa nela", () => {
    const zip = montarConteudoDoZip({ raizId: "p2026", pastas, arquivos, alcanca: foraDaLixeira })!;
    expect(caminhos(zip.entradas)).toEqual(["b.pdf", "Janeiro/", "Janeiro/c.pdf"]);
  });

  it("nada da lixeira: nem arquivo apagado, nem pasta apagada, nem o que está dentro dela", () => {
    const ids = montarConteudoDoZip({ raizId: "raiz", pastas, arquivos, alcanca: foraDaLixeira })!
      .entradas.flatMap((e) => (e.tipo === "arquivo" ? [e.arquivo.id] : []));
    expect(ids).not.toContain("apagado");
    expect(ids).not.toContain("na-velha");
    expect(ids).not.toContain("da-vizinha");
  });

  it("pasta barrada pela régua sai com tudo que está dentro, e o nome dela não aparece", () => {
    // A régua barra "2026", mas deixaria passar "Janeiro" sozinha: não basta,
    // a pasta de cima tem de ter entrado.
    const alcanca = (c: PastaDoDrive[]) => c.at(-1)!.id !== "p2026";
    const zip = montarConteudoDoZip({ raizId: "raiz", pastas, arquivos, alcanca })!;
    expect(caminhos(zip.entradas)).toEqual(["a.pdf", "Vazia/", "Velha/", "Velha/Dentro/", "Velha/Dentro/na-velha.pdf"]);
    expect(caminhos(zip.entradas).join()).not.toContain("2026");
  });

  it("a própria pasta barrada (ou que não existe) não dá zip", () => {
    expect(montarConteudoDoZip({ raizId: "velha", pastas, arquivos, alcanca: foraDaLixeira })).toBeNull();
    expect(montarConteudoDoZip({ raizId: "nao-existe", pastas, arquivos, alcanca: foraDaLixeira })).toBeNull();
  });

  it("nomes repetidos e perigosos dentro da mesma pasta", () => {
    const zip = montarConteudoDoZip({
      raizId: "r",
      pastas: [pasta("r", null), pasta("x", "r", { name: ".." }), pasta("y", "r", { name: "guia.pdf" })],
      arquivos: [
        arquivo("1", "r", { name: "Guia.pdf" }),
        arquivo("2", "r", { name: "guia.pdf", createdAt: new Date("2026-10-02T12:00:00Z") }),
        arquivo("3", "r", { name: "../../segredo.pdf" }),
        arquivo("4", "x", { name: "dentro.pdf" }),
      ],
      alcanca: () => true,
    })!;
    // A pasta "guia.pdf" fica com o nome; os dois arquivos "guia.pdf" ganham sufixo.
    expect(caminhos(zip.entradas)).toEqual([".._.._segredo.pdf", "Guia (2).pdf", "guia (3).pdf", "sem nome/", "sem nome/dentro.pdf", "guia.pdf/"]);
    for (const c of caminhos(zip.entradas)) {
      expect(c.split("/").filter(Boolean)).not.toContain("..");
      expect(c).not.toContain("\\");
    }
  });

  it("ciclo gravado no banco não trava a montagem", () => {
    const comCiclo = [pasta("r", null), pasta("a", "b"), pasta("b", "a")];
    const zip = montarConteudoDoZip({ raizId: "r", pastas: comCiclo, arquivos: [arquivo("1", "a")], alcanca: () => true })!;
    expect(zip.entradas).toEqual([]);
  });
});

describe("teto", () => {
  it("pasta sem arquivo (nem nas subpastas) não vira zip", () => {
    expect(problemaDoZip({ arquivos: 0, bytes: 0, pastas: 3 })).toMatchObject({ status: 422 });
  });

  it(`até ${MAX_ARQUIVOS_NO_ZIP} arquivos e ${MAX_BYTES_NO_ZIP / 1024 ** 3} GB passa`, () => {
    expect(problemaDoZip({ arquivos: MAX_ARQUIVOS_NO_ZIP, bytes: MAX_BYTES_NO_ZIP, pastas: 50 })).toBeNull();
  });

  it("arquivo a mais: mensagem com o número e o caminho de saída", () => {
    const p = problemaDoZip({ arquivos: MAX_ARQUIVOS_NO_ZIP + 1, bytes: 10, pastas: 0 });
    expect(p?.status).toBe(413);
    expect(p?.erro).toBe("A pasta tem 1.001 arquivos, e o zip leva até 1.000. Baixe as subpastas uma de cada vez.");
  });

  it("tamanho a mais", () => {
    const p = problemaDoZip({ arquivos: 10, bytes: MAX_BYTES_NO_ZIP + 1, pastas: 0 });
    expect(p?.status).toBe(413);
    expect(p?.erro).toContain("o zip leva até 1,0 GB");
  });

  it("subpasta demais", () => {
    expect(problemaDoZip({ arquivos: 1, bytes: 1, pastas: 1001 })?.status).toBe(413);
  });
});

describe("nome do arquivo baixado", () => {
  it("empresa e caminho, legíveis e seguros", () => {
    expect(nomeDoZip(["Comércio Ltda", "Fiscal", "2026"])).toBe("Comércio Ltda - Fiscal - 2026.zip");
    expect(nomeDoZip(["Indústria S/A", "Guias"])).toBe("Indústria S_A - Guias.zip");
    expect(nomeDoZip([null, "Modelos"])).toBe("Modelos.zip");
    expect(nomeDoZip([])).toBe("Arquivos.zip");
  });

  it("Content-Disposition com acento: filename* em UTF-8 e filename em ASCII", () => {
    const nome = "Padaria D'Ávila (matriz) - Guias*.zip";
    const cabecalho = contentDispositionDeAnexo(nome);
    expect(cabecalho).toContain(`filename="Padaria D'Avila (matriz) - Guias*.zip"`);
    const utf8 = /filename\*=UTF-8''(.+)$/.exec(cabecalho)![1];
    expect(utf8).not.toMatch(/['()*\s]/);
    expect(decodeURIComponent(utf8)).toBe(nome);
  });

  it("o filename ASCII não quebra o cabeçalho com aspas ou barra", () => {
    expect(contentDispositionDeAnexo('a"b\\c%.zip')).toContain('filename="a_b_c_.zip"');
  });
});

describe("streamDoZip", () => {
  const enc = new TextEncoder();
  const bytesDe = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

  it("gera um zip que abre, com as pastas, os acentos e o conteúdo de cada arquivo", async () => {
    const zip = montarConteudoDoZip({
      raizId: "r",
      pastas: [pasta("r", null), pasta("c", "r", { name: "Certidões" }), pasta("v", "r", { name: "Vazia" })],
      arquivos: [
        arquivo("1", "r", { name: "nota.xml", mimeType: "application/xml" }),
        arquivo("2", "c", { name: "certidão negativa.pdf" }),
      ],
      alcanca: () => true,
    })!;
    const conteudos: Record<string, string> = { "1": "<nfe>".repeat(500), "2": "%PDF-1.4 certidão" };
    const aoTerminar = vi.fn();
    const bytes = await bytesDe(streamDoZip(zip.entradas, { ler: async (a) => enc.encode(conteudos[a.id]), aoTerminar }));

    const aberto = unzipSync(bytes);
    expect(Object.keys(aberto).sort()).toEqual(["Certidões/", "Certidões/certidão negativa.pdf", "Vazia/", "nota.xml"]);
    expect(strFromU8(aberto["nota.xml"])).toBe(conteudos["1"]);
    expect(strFromU8(aberto["Certidões/certidão negativa.pdf"])).toBe(conteudos["2"]);
    // XML vai comprimido: o zip inteiro fica menor que o texto repetido.
    expect(bytes.length).toBeLessThan(conteudos["1"].length);
    await vi.waitFor(() => expect(aoTerminar).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "1" })]), true));
    expect(aoTerminar.mock.calls[0][0]).toHaveLength(2);
  });

  it("arquivo que sumiu do armazenamento fica de fora, e não conta como baixado", async () => {
    const entradas: EntradaDoZip[] = [
      { tipo: "arquivo", caminho: "a.pdf", arquivo: arquivo("a", "r") },
      { tipo: "arquivo", caminho: "b.pdf", arquivo: arquivo("b", "r") },
    ];
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const aoTerminar = vi.fn();
    const bytes = await bytesDe(streamDoZip(entradas, { ler: async (a) => (a.id === "a" ? null : enc.encode("b")), aoTerminar }));
    erro.mockRestore();
    expect(Object.keys(unzipSync(bytes))).toEqual(["b.pdf"]);
    await vi.waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(aoTerminar.mock.calls[0][0].map((a: ArquivoParaOZip) => a.id)).toEqual(["b"]);
  });

  it("um arquivo por vez: só lê o próximo quando quem baixa pede mais", async () => {
    const entradas: EntradaDoZip[] = ["a", "b", "c"].map((id) => ({ tipo: "arquivo", caminho: `${id}.pdf`, arquivo: arquivo(id, "r") }));
    const lidos: string[] = [];
    const aoTerminar = vi.fn();
    const leitor = streamDoZip(entradas, {
      ler: async (a) => {
        lidos.push(a.id);
        return enc.encode(a.id);
      },
      aoTerminar,
    }).getReader();
    await leitor.read();
    expect(lidos.length).toBeLessThan(3);
    await leitor.cancel();
    await vi.waitFor(() => expect(aoTerminar).toHaveBeenCalled());
    expect(aoTerminar.mock.calls[0][1]).toBe(false);
  });
});
