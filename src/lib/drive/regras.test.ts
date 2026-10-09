import { describe, expect, it } from "vitest";
import {
  caminhoDaPasta,
  caminhoDoCliente,
  clienteVeCaminho,
  CHAVE_ENVIADOS,
  mapaDePastas,
  moverCriaCiclo,
  ordenarPastas,
  podeMexerNoCaminho,
  podeRestringirAoSetor,
  podeVerCaminho,
  raizesDoCliente,
  validarNomeDaPasta,
  validarNomeDoArquivo,
  type PastaDoDrive,
  type QuemPede,
} from "./regras";

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

const quem = (role: QuemPede["role"], sectors: string[] = [], subscriptionReadOnly = false): QuemPede => ({
  role,
  sectors,
  subscriptionReadOnly,
});

// Fiscal › 2026 › Notas;  DP (só dp) › Holerites;  Contábil (fechada) › Balanços (compartilhada)
const PASTAS = [
  pasta("fiscal", null),
  pasta("2026", "fiscal"),
  pasta("notas", "2026", { sharedWithPortal: true }),
  pasta("dp", null, { sectorCode: "dp" }),
  pasta("holerites", "dp"),
  pasta("contabil", null),
  pasta("balancos", "contabil", { sharedWithPortal: true }),
  pasta("enviados", null, { systemKey: CHAVE_ENVIADOS, sharedWithPortal: true }),
];
const MAPA = mapaDePastas(PASTAS);
const caminho = (id: string) => caminhoDaPasta(id, MAPA)!;

describe("caminhoDaPasta", () => {
  it("vai da raiz até a pasta", () => {
    expect(caminho("notas").map((p) => p.id)).toEqual(["fiscal", "2026", "notas"]);
    expect(caminho("fiscal").map((p) => p.id)).toEqual(["fiscal"]);
  });

  it("devolve null quando falta a pasta ou um pai", () => {
    expect(caminhoDaPasta("nao-existe", MAPA)).toBeNull();
    expect(caminhoDaPasta("orfa", mapaDePastas([pasta("orfa", "sumiu")]))).toBeNull();
  });

  it("não entra em laço com ciclo gravado no banco", () => {
    const ciclo = mapaDePastas([pasta("a", "b"), pasta("b", "a")]);
    expect(caminhoDaPasta("a", ciclo)).toBeNull();
  });
});

describe("quem vê e quem mexe", () => {
  it("pasta sem setor: todo mundo da equipe vê, e o READONLY não mexe", () => {
    expect(podeVerCaminho(quem("SECTOR_USER", ["bpo"]), caminho("notas"))).toBe(true);
    expect(podeMexerNoCaminho(quem("SECTOR_USER", ["bpo"]), caminho("notas"))).toBe(true);
    expect(podeVerCaminho(quem("READONLY"), caminho("notas"))).toBe(true);
    expect(podeMexerNoCaminho(quem("READONLY"), caminho("notas"))).toBe(false);
  });

  it("pasta do DP: só o DP e quem vê tudo, e vale para o que está dentro", () => {
    expect(podeVerCaminho(quem("SECTOR_USER", ["dp"]), caminho("holerites"))).toBe(true);
    expect(podeVerCaminho(quem("SECTOR_ADMIN", ["fiscal"]), caminho("holerites"))).toBe(false);
    expect(podeMexerNoCaminho(quem("SECTOR_USER", ["fiscal"]), caminho("holerites"))).toBe(false);
    expect(podeVerCaminho(quem("ADMIN"), caminho("holerites"))).toBe(true);
    expect(podeMexerNoCaminho(quem("ADMIN"), caminho("holerites"))).toBe(true);
  });

  it("assinatura vencida trava a escrita de todos, o admin inclusive", () => {
    expect(podeMexerNoCaminho(quem("ADMIN", [], true), caminho("notas"))).toBe(false);
    expect(podeVerCaminho(quem("ADMIN", [], true), caminho("notas"))).toBe(true);
  });

  it("só restringe a pasta a um setor quem age nele", () => {
    expect(podeRestringirAoSetor(quem("SECTOR_USER", ["dp"]), "dp")).toBe(true);
    expect(podeRestringirAoSetor(quem("SECTOR_USER", ["dp"]), "fiscal")).toBe(false);
    expect(podeRestringirAoSetor(quem("ADMIN"), "fiscal")).toBe(true);
    expect(podeRestringirAoSetor(quem("READONLY"), "fiscal")).toBe(false);
  });
});

describe("o que o cliente vê", () => {
  it("vê a pasta compartilhada e o que está dentro dela", () => {
    expect(clienteVeCaminho(caminho("notas"))).toBe(true);
    expect(clienteVeCaminho([...caminho("notas"), pasta("sub", "notas")])).toBe(true);
  });

  it("não vê a pasta de cima que não foi compartilhada", () => {
    expect(clienteVeCaminho(caminho("2026"))).toBe(false);
    expect(clienteVeCaminho(caminho("contabil"))).toBe(false);
  });

  it("nada que esteja na lixeira, nem dentro de pasta na lixeira", () => {
    const mapa = mapaDePastas([pasta("a", null, { deletedAt: new Date() }), pasta("b", "a", { sharedWithPortal: true })]);
    expect(clienteVeCaminho(caminhoDaPasta("b", mapa)!)).toBe(false);
  });

  it("o caminho do cliente começa na primeira pasta compartilhada", () => {
    expect(caminhoDoCliente(caminho("balancos")).map((p) => p.id)).toEqual(["balancos"]);
    expect(caminhoDoCliente([...caminho("notas"), pasta("sub", "notas")]).map((p) => p.id)).toEqual(["notas", "sub"]);
    expect(caminhoDoCliente(caminho("fiscal"))).toEqual([]);
  });

  it("as raízes do cliente são as compartilhadas que não estão dentro de outra compartilhada", () => {
    const dentro = pasta("dentro", "notas", { sharedWithPortal: true });
    expect(raizesDoCliente([...PASTAS, dentro]).map((p) => p.id).sort()).toEqual(["balancos", "enviados", "notas"]);
  });
});

describe("validarNomeDaPasta", () => {
  it("apara e junta espaços", () => {
    expect(validarNomeDaPasta("  Notas   de   entrada ")).toEqual({ ok: true, nome: "Notas de entrada" });
  });

  it("recusa vazio, barra, só pontos e nome longo", () => {
    expect(validarNomeDaPasta("   ").ok).toBe(false);
    expect(validarNomeDaPasta("2026/01").ok).toBe(false);
    expect(validarNomeDaPasta("a\\b").ok).toBe(false);
    expect(validarNomeDaPasta("..").ok).toBe(false);
    expect(validarNomeDaPasta("x".repeat(121)).ok).toBe(false);
    expect(validarNomeDaPasta("x".repeat(120)).ok).toBe(true);
  });

  it("troca caractere de controle por espaço", () => {
    const tab = String.fromCharCode(9);
    expect(validarNomeDaPasta(`Folha${tab}2026`)).toEqual({ ok: true, nome: "Folha 2026" });
  });
});

describe("validarNomeDoArquivo", () => {
  it("mantém a extensão do arquivo", () => {
    expect(validarNomeDoArquivo("contrato assinado", "contrato.pdf")).toEqual({ ok: true, nome: "contrato assinado.pdf" });
    expect(validarNomeDoArquivo("contrato assinado.pdf", "contrato.pdf")).toEqual({ ok: true, nome: "contrato assinado.pdf" });
    expect(validarNomeDoArquivo("contrato assinado.PDF", "contrato.pdf")).toEqual({ ok: true, nome: "contrato assinado.pdf" });
  });

  it("outra extensão digitada fica no nome, sem trocar o tipo", () => {
    expect(validarNomeDoArquivo("planilha.xlsx", "relatorio.pdf")).toEqual({ ok: true, nome: "planilha.xlsx.pdf" });
  });

  it("recusa vazio", () => {
    expect(validarNomeDoArquivo("  ", "a.pdf").ok).toBe(false);
  });
});

describe("moverCriaCiclo", () => {
  it("não deixa a pasta ir para dentro dela mesma nem de uma filha", () => {
    expect(moverCriaCiclo("fiscal", "fiscal", MAPA)).toBe(true);
    expect(moverCriaCiclo("fiscal", "notas", MAPA)).toBe(true);
  });

  it("deixa ir para outra pasta ou para o primeiro nível", () => {
    expect(moverCriaCiclo("notas", "contabil", MAPA)).toBe(false);
    expect(moverCriaCiclo("notas", null, MAPA)).toBe(false);
  });

  it("destino que não existe conta como ciclo, para a ação recusar", () => {
    expect(moverCriaCiclo("notas", "sumiu", MAPA)).toBe(true);
  });
});

describe("ordenarPastas", () => {
  it("modelo na ordem do modelo, depois Enviados pelo cliente, depois o resto por nome", () => {
    const pastas = [
      { name: "zeta", systemKey: null },
      { name: "Enviados pelo cliente", systemKey: CHAVE_ENVIADOS },
      { name: "Guias", systemKey: "modelo:g" },
      { name: "alfa", systemKey: null },
      { name: "Fiscal", systemKey: "modelo:f" },
      { name: "Pasta 10", systemKey: null },
      { name: "Pasta 2", systemKey: null },
    ];
    const posicao = new Map([["modelo:f", 0], ["modelo:g", 1]]);
    expect(ordenarPastas(pastas, posicao).map((p) => p.name)).toEqual([
      "Fiscal",
      "Guias",
      "Enviados pelo cliente",
      "alfa",
      "Pasta 2",
      "Pasta 10",
      "zeta",
    ]);
  });
});
