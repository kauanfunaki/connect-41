import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { ErroDoSped, type DocumentoParaXml, type XmlsDoMotor } from "@/lib/sped/client";
import {
  MENSAGEM_MOTOR_FORA,
  MENSAGEM_SEM_ROTA,
  TAMANHO_DO_LOTE,
  buscarLote,
  identificadorDoMotor,
  medirZip,
  mensagemDoMotor,
  naEmpresa,
  nomeNaFila,
  posicaoNoAcervo,
  proximoLote,
  restantesDepois,
  selecionarDoAcervo,
  type CandidatoDoAcervo,
  type DocumentoDoAcervo,
} from "./acervo";

// Dados fictícios: empresas "emp-a"/"emp-b", chaves de 44 dígitos montadas à mão.
const chave = (n: number) => `35261011222333000181550010000${String(n).padStart(6, "0")}123456789`;
const nfe = (n: number, companyId = "emp-a"): DocumentoDoAcervo => ({ id: `doc-${String(n).padStart(5, "0")}`, companyId, dedupKey: chave(n), spedTipo: "nfe", spedIdentificador: chave(n) });
const nfse = (n: number, companyId = "emp-a"): DocumentoDoAcervo => ({ id: `nfse-${String(n).padStart(5, "0")}`, companyId, dedupKey: `NFSE:11222333000181:A1:${n}:2026-10`, spedTipo: "nfse", spedIdentificador: `nfse-${n}` });
const vazio = { naEscrituracao: new Set<string>(), naFila: new Set<string>() };

describe("identificador do motor", () => {
  it("é o par gravado pela sincronização, sem derivar da chave", () => {
    expect(identificadorDoMotor(nfe(1))).toEqual({ tipo: "nfe", identificador: chave(1) });
    // A NFS-e não tem chave de acesso: o identificador é o do índice, não o dedupKey.
    expect(identificadorDoMotor(nfse(7))).toEqual({ tipo: "nfse", identificador: "nfse-7" });
  });

  it("devolve o tipo do motor (a NFC-e é nfe lá) e o identificador como veio", () => {
    expect(identificadorDoMotor({ spedTipo: "nfe", spedIdentificador: " abc-1 " })).toEqual({ tipo: "nfe", identificador: " abc-1 " });
    expect(identificadorDoMotor({ spedTipo: "cte", spedIdentificador: chave(2) })).toEqual({ tipo: "cte", identificador: chave(2) });
  });

  it("sem o par, ou com tipo fora do contrato, não inventa", () => {
    expect(identificadorDoMotor({ spedTipo: null, spedIdentificador: chave(1) })).toBeNull();
    expect(identificadorDoMotor({ spedTipo: "nfe", spedIdentificador: null })).toBeNull();
    expect(identificadorDoMotor({ spedTipo: "nfe", spedIdentificador: "   " })).toBeNull();
    expect(identificadorDoMotor({ spedTipo: "NFCE", spedIdentificador: chave(1) })).toBeNull();
  });

  it("o nome na fila é o do arquivo dentro do zip, saneado como o motor saneia", () => {
    expect(nomeNaFila({ tipo: "nfe", identificador: chave(1) })).toBe(`${chave(1)}.xml`);
    // Fora de [0-9A-Za-z._-] vira "_" (sped_generator#64); a pasta do tipo some no corte da fila.
    expect(nomeNaFila({ tipo: "nfse", identificador: "municipio/123:A 1" })).toBe("municipio_123_A_1.xml");
    expect(nomeNaFila({ tipo: "nfse", identificador: "ok-1.2_x" })).toBe("ok-1.2_x.xml");
  });
});

describe("seleção do acervo", () => {
  it("fica de fora o que já está na escrituração da empresa, na fila da empresa ou sem identificador", () => {
    const docs = [nfe(1), nfe(2), nfe(3), nfse(4), { ...nfe(5), spedIdentificador: null }, nfe(6, "emp-b")];
    const s = selecionarDoAcervo(docs, {
      naEscrituracao: new Set([naEmpresa("emp-a", chave(1)), naEmpresa("emp-a", chave(6))]),
      naFila: new Set([naEmpresa("emp-a", `${chave(2)}.xml`)]),
    });
    expect(s.naEscrituracao).toBe(1);
    expect(s.naFila).toBe(1);
    expect(s.semIdentificador).toBe(1);
    // O documento 6 é de outra empresa: a escrituração da emp-a não conta para ele.
    expect(s.aPedir.map((d) => d.id)).toEqual(["doc-00003", "nfse-00004", "doc-00006"]);
    expect(s.aPedir[1].motor).toEqual({ tipo: "nfse", identificador: "nfse-4" });
  });

  it("o mesmo documento do motor em duas linhas da empresa vira um pedido só", () => {
    const s = selecionarDoAcervo([nfe(1), { ...nfe(1), id: "doc-outra", dedupKey: "outra" }], vazio);
    expect(s.aPedir).toHaveLength(1);
  });

  it("ordena por empresa e id, que é a ordem do cursor", () => {
    const s = selecionarDoAcervo([nfe(3, "emp-b"), nfe(2), nfe(1, "emp-b")], vazio);
    expect(s.aPedir.map(posicaoNoAcervo)).toEqual(["emp-a|doc-00002", "emp-b|doc-00001", "emp-b|doc-00003"]);
  });
});

describe("lote de 500", () => {
  const aPedir = selecionarDoAcervo([...Array.from({ length: 1200 }, (_, i) => nfe(i)), ...Array.from({ length: 30 }, (_, i) => nfe(5000 + i, "emp-b"))], vazio).aPedir;

  it("pede no máximo 500, de uma empresa só, andando pelo cursor", () => {
    const l1 = proximoLote(aPedir, null);
    expect(l1).toHaveLength(TAMANHO_DO_LOTE);
    const l2 = proximoLote(aPedir, posicaoNoAcervo(l1[499]));
    expect(l2).toHaveLength(500);
    const l3 = proximoLote(aPedir, posicaoNoAcervo(l2[499]));
    expect(l3).toHaveLength(200);
    expect(new Set(l3.map((d) => d.companyId))).toEqual(new Set(["emp-a"]));
    const l4 = proximoLote(aPedir, posicaoNoAcervo(l3[199]));
    expect(l4).toHaveLength(30);
    expect(l4[0].companyId).toBe("emp-b");
    expect(proximoLote(aPedir, posicaoNoAcervo(l4[29]))).toEqual([]);
  });

  it("não passa de 500 nem com tamanho maior, e respeita o tamanho menor", () => {
    expect(proximoLote(aPedir, null, 900)).toHaveLength(500);
    expect(proximoLote(aPedir, null, 120)).toHaveLength(120);
    expect(proximoLote(aPedir, null, 0)).toHaveLength(1);
  });

  it("conta o que falta depois do cursor", () => {
    expect(restantesDepois(aPedir, null)).toBe(1230);
    expect(restantesDepois(aPedir, posicaoNoAcervo(aPedir[499]))).toBe(730);
  });
});

/** O motor falso: monta o zip dos documentos pedidos, sem os que ele "não tem". */
function motorFalso(opcoes: { semXml?: Set<string>; naoEncontrados?: Set<string>; tamanhoDoXml?: number } = {}) {
  const pedidos: DocumentoParaXml[][] = [];
  const pedir = vi.fn(async (documentos: DocumentoParaXml[]): Promise<XmlsDoMotor> => {
    pedidos.push(documentos);
    const arquivos: Record<string, Uint8Array> = {};
    let semXml = 0, naoEncontrados = 0;
    for (const d of documentos) {
      if (opcoes.semXml?.has(d.identificador)) { semXml++; continue; }
      if (opcoes.naoEncontrados?.has(d.identificador)) { naoEncontrados++; continue; }
      arquivos[`${d.tipo}/${d.identificador}.xml`] = strToU8(`<nfeProc>${"x".repeat(opcoes.tamanhoDoXml ?? 10)}${d.identificador}</nfeProc>`);
    }
    const noZip = Object.keys(arquivos).length;
    const bytes = noZip ? zipSync(arquivos, { level: 0 }) : new Uint8Array(0);
    return { bytes: new Uint8Array(bytes), pedidos: documentos.length, noZip, semXml, naoEncontrados };
  });
  return { pedir, pedidos };
}

const candidatos = (n: number): CandidatoDoAcervo[] => selecionarDoAcervo(Array.from({ length: n }, (_, i) => nfe(i)), vazio).aPedir;

describe("buscar o lote no motor falso", () => {
  it("soma os contadores e põe na fila só o que veio no zip", async () => {
    const lote = candidatos(5);
    const { pedir } = motorFalso({ semXml: new Set([chave(1)]), naoEncontrados: new Set([chave(3)]) });
    const enfileirar = vi.fn(async (bytes: Uint8Array) => Array.from({ length: medirZip(bytes).arquivos }, (_, i) => `imp-${i}`));
    const r = await buscarLote(lote, { pedir, enfileirar });
    expect(r.contadores).toEqual({ naFila: 3, semXml: 1, naoEncontrados: 1, grandesDemais: 0, cteFora: 0 });
    expect(r.ids).toHaveLength(3);
    expect(r.cobertos).toHaveLength(5);
    expect(enfileirar).toHaveBeenCalledTimes(1);
  });

  it("zip sem nenhum XML não vai para a fila", async () => {
    const lote = candidatos(2);
    const { pedir } = motorFalso({ semXml: new Set([chave(0), chave(1)]) });
    const enfileirar = vi.fn(async () => ["x"]);
    const r = await buscarLote(lote, { pedir, enfileirar });
    expect(enfileirar).not.toHaveBeenCalled();
    expect(r.contadores).toEqual({ naFila: 0, semXml: 2, naoEncontrados: 0, grandesDemais: 0, cteFora: 0 });
    expect(r.cobertos).toHaveLength(2);
  });

  it("conta o CT-e que não veio, que a tela mostra como esperado", async () => {
    const cte = (n: number): DocumentoDoAcervo => ({ id: `cte-${n}`, companyId: "emp-a", dedupKey: `cte-${n}`, spedTipo: "cte", spedIdentificador: `cte-${n}` });
    const lote = selecionarDoAcervo([nfe(1), cte(1), cte(2), cte(3)], vazio).aPedir;
    // O motor só tem o CT-e 2 (renderizado ou de frete tomado); os outros dois voltam "não encontrados".
    const { pedir } = motorFalso({ naoEncontrados: new Set(["cte-1", "cte-3"]) });
    const r = await buscarLote(lote, { pedir, enfileirar: async (bytes) => Array.from({ length: medirZip(bytes).arquivos }, (_, i) => `imp-${i}`) });
    expect(r.contadores).toMatchObject({ naFila: 2, naoEncontrados: 2, cteFora: 2 });
  });

  it("zip vazio (válido) não vai para a fila; os CT-e pedidos contam como fora", async () => {
    const lote = selecionarDoAcervo([{ id: "cte-9", companyId: "emp-a", dedupKey: "cte-9", spedTipo: "cte", spedIdentificador: "cte-9" }], vazio).aPedir;
    const enfileirar = vi.fn(async () => ["x"]);
    const pedir = async (): Promise<XmlsDoMotor> => ({ bytes: new Uint8Array(zipSync({})), pedidos: 1, noZip: 0, semXml: 0, naoEncontrados: 1 });
    const r = await buscarLote(lote, { pedir, enfileirar });
    expect(enfileirar).not.toHaveBeenCalled();
    expect(r.contadores).toMatchObject({ naFila: 0, naoEncontrados: 1, cteFora: 1 });
  });

  it("zip acima do limite é pedido de novo pela metade, e o tamanho que coube vale para o próximo", async () => {
    const lote = candidatos(8);
    const { pedir, pedidos } = motorFalso({ tamanhoDoXml: 100 });
    const enfileirar = vi.fn(async (bytes: Uint8Array) => Array.from({ length: medirZip(bytes).arquivos }, (_, i) => `imp-${i}`));
    // O limite é o tamanho do zip de dois documentos: oito e quatro passam dele, dois cabem.
    const limiteDoZip = (await motorFalso({ tamanhoDoXml: 100 }).pedir(lote.slice(0, 2).map((d) => d.motor))).bytes.length;
    const r = await buscarLote(lote, { pedir, enfileirar, tamanho: 8, limiteDoZip });
    expect(pedidos.map((p) => p.length)).toEqual([8, 4, 2]);
    expect(r.cobertos).toHaveLength(2);
    expect(r.tamanho).toBe(2);
    expect(r.contadores.naFila).toBe(2);
  });

  it("sem precisar diminuir, devolve o tamanho de antes (o lote pode ter vindo menor por acabar a empresa)", async () => {
    const r = await buscarLote(candidatos(3), { ...motorFalso(), enfileirar: async () => ["a", "b", "c"], tamanho: 500 });
    expect(r.tamanho).toBe(500);
  });

  it("um documento sozinho maior que a fila aceita é contado e pulado, sem travar a rodada", async () => {
    const lote = candidatos(1);
    const { pedir } = motorFalso({ tamanhoDoXml: 2000 });
    const enfileirar = vi.fn(async () => ["x"]);
    const r = await buscarLote(lote, { pedir, enfileirar, limiteDoZip: 100, limiteExpandido: 100 });
    expect(enfileirar).not.toHaveBeenCalled();
    expect(r.contadores.grandesDemais).toBe(1);
    expect(r.cobertos).toHaveLength(1);
  });

  it("o 404 do motor sobe para quem chamou, sem nada na fila", async () => {
    const enfileirar = vi.fn(async () => ["x"]);
    const pedir = vi.fn(async () => { throw new ErroDoSped(404, "rota_de_xml_ausente", "SPED 404"); });
    await expect(buscarLote(candidatos(3), { pedir, enfileirar })).rejects.toBeInstanceOf(ErroDoSped);
    expect(enfileirar).not.toHaveBeenCalled();
  });
});

describe("mensagem do motor", () => {
  it("404 diz que falta a rota no motor", () => {
    expect(mensagemDoMotor(new ErroDoSped(404, "rota_de_xml_ausente", "x"))).toBe(MENSAGEM_SEM_ROTA);
    expect(MENSAGEM_SEM_ROTA).toBe("O motor ainda não tem a rota de XML; é preciso atualizar o motor.");
  });

  it("erro de rede diz que o motor está fora do ar", () => {
    expect(mensagemDoMotor(new ErroDoSped(0, null, "falha de rede ao chamar documentos/xml"))).toBe(MENSAGEM_MOTOR_FORA);
  });

  it("token recusado e corpo inválido têm mensagem própria; o que não é do motor segue adiante", () => {
    expect(mensagemDoMotor(new ErroDoSped(401, null, "x"))).toMatch(/credencial/);
    expect(mensagemDoMotor(new ErroDoSped(400, null, "x"))).toMatch(/recusou o pedido de XML/);
    expect(mensagemDoMotor(new ErroDoSped(400, "quantidade_invalida", "x"))).toMatch(/\(quantidade_invalida\)/);
    expect(mensagemDoMotor(new ErroDoSped(503, null, "x"))).toMatch(/503/);
    expect(mensagemDoMotor(new Error("outra coisa"))).toBeNull();
  });
});
