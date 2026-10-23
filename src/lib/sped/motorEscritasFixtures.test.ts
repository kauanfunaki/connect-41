import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

// As requisições e respostas reais das escritas de §13 (API-CONNECT §13.13),
// copiadas de `tests/fixtures/connect_v1/escritas/*.json` do repositório do
// motor (`ferramentas/gerar_fixtures_connect.py --escritas`). Para cada uma:
// o Connect monta a MESMA requisição (método, caminho, ator, chave, corpo ou
// partes do multipart) e a resposta passa pelo esquema zod da rota — ou, nos
// erros, chega com o código e a frase certos.

vi.mock("server-only", () => ({}));
const { criarClienteDoMotor, ErroDoMotor } = await import("./motor");

const DIR = path.resolve(__dirname, "../../../tests/fixtures/connect_v1/escritas");

type Parte = { campo: string; nome?: string; tamanho?: number; sha256?: string; conteudo?: string; conteudo_base64?: string; valor?: string };
type Fixture = {
  requisicao: { metodo: string; caminho: string; ator: { id: string; nome: string; email: string; tenant?: string }; cabecalhos: Record<string, string>; corpo?: Record<string, unknown>; partes?: Parte[]; content_type?: string };
  resposta: { status: number; corpo: Record<string, unknown>; x_custo?: string; retry_after?: string; idempotent_replay?: string; location?: string };
};
const ler = (nome: string): Fixture => JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8"));
type Cliente = ReturnType<typeof criarClienteDoMotor>;
type Escrita = { ator: Fixture["requisicao"]["ator"]; chave?: string };
const R = "17122471";

const bytesDa = (p: Parte) => (p.conteudo_base64 !== undefined ? Buffer.from(p.conteudo_base64, "base64") : Buffer.from(p.conteudo ?? "", "utf8"));
const arquivoDa = (p: Parte) => new File([bytesDa(p)], p.nome!);
const arquivosDe = (f: Fixture) => (f.requisicao.partes ?? []).filter((p) => p.nome !== undefined).map(arquivoDa);
const campoDe = (f: Fixture, campo: string) => f.requisicao.partes?.find((p) => p.campo === campo && p.valor !== undefined)?.valor;
const corpo = <T,>(f: Fixture) => f.requisicao.corpo as T;
const idDoCaminho = (f: Fixture) => Number(f.requisicao.caminho.match(/\/(\d+)\//)![1]);

/** Fixture → a chamada do cliente que monta aquela requisição. */
const CHAMADAS: Record<string, (c: Cliente, f: Fixture, w: Escrita) => Promise<unknown>> = {
  cobertura_apurar: (c, f, w) => c.apurarCobertura(R, corpo(f), w),
  cobertura_apurar_replay: (c, f, w) => c.apurarCobertura(R, corpo(f), w),
  erro_cobertura_em_andamento: (c, f, w) => c.apurarCobertura(R, corpo(f), w),
  erro_execucao_duplicada: (c, f, w) => c.apurarCobertura(R, corpo(f), w),
  erro_idempotencia_conflito: (c, f, w) => c.apurarCobertura(R, corpo(f), w),
  erro_token_sem_escrita: (c, f, w) => c.apurarCobertura(R, corpo(f), w),
  quarentena_resolver: (c, f, w) => c.resolverRejeitado(R, idDoCaminho(f), corpo(f), w),
  erro_quarentena_nao_encontrado: (c, f, w) => c.resolverRejeitado(R, idDoCaminho(f), corpo(f), w),
  documentos_envio: (c, f, w) => c.enviarDocumentos(R, arquivosDe(f), w),
  pagamento_decidir: (c, f, w) => c.decidirPagamento(R, corpo(f), w),
  erro_pagamento_nao_aceitavel: (c, f, w) => c.decidirPagamento(R, corpo(f), w),
  pagamento_corrigir: (c, f, w) => c.corrigirPagamento(R, corpo(f), w),
  erro_pagamento_corrigir_aceite_recusado: (c, f, w) => c.corrigirPagamento(R, corpo(f), w),
  // O Connect nunca manda número em dinheiro; aqui se força, para ver o 422 com o campo.
  erro_parametro_invalido_valor_numero: (c, f, w) => c.corrigirPagamento(R, corpo(f), w),
  contrato_informar: (c, f, w) => c.informarContrato(R, corpo(f), w),
  erro_contrato_sem_tratativa: (c, f, w) => c.informarContrato(R, corpo(f), w),
  arquivo_apurar_cte: (c, f, w) => c.apurarCteDoArquivo(R, idDoCaminho(f), w),
  erro_motor_ocupado: (c, f, w) => c.apurarCteDoArquivo(R, idDoCaminho(f), w),
  erro_obrigacao_incompativel: (c, f, w) => c.apurarCteDoArquivo(R, idDoCaminho(f), w),
  simulacao: (c, f, w) => c.gravarSimulacao(R, corpo(f), w),
  erro_simulacao_linha: (c, f, w) => c.gravarSimulacao(R, corpo(f), w),
  combustivel_apurar: (c, f, w) => c.apurarCombustivel(R, corpo(f), w),
  conferencia_documentos_envio: (c, f, w) => c.conferirRelatorioOmie(R, arquivosDe(f)[0], campoDe(f, "competencia"), w),
  erro_arquivo_invalido: (c, f, w) => c.conferirRelatorioOmie(R, arquivosDe(f)[0], campoDe(f, "competencia"), w),
  conferencia_documento_decidir: (c, f, w) => c.decidirDocumentoDaConferencia(R, idDoCaminho(f), corpo(f), w),
  confronto_envio: (c, f, w) => c.confrontarPlanilha(R, arquivosDe(f)[0], campoDe(f, "competencia"), w),
  // Parte com nome errado o Connect não monta (a parte sai de `ENVIOS`): só a resposta é conferida.
  erro_parte_desconhecida: (c, _f, w) => c.enviarDocumentos(R, [new File(["%PDF"], "a.pdf")], w),
  // Sem chave o Connect nem chama (abaixo).
  erro_idempotencia_ausente: (c, f, w) => c.apurarCobertura(R, corpo(f), { ...w, chave: "c41:00000000-0000-0000-0000-000000000000" }),
};
const SEM_CONFERIR_REQUISICAO = new Set(["erro_parte_desconhecida", "erro_idempotencia_ausente"]);

function servir(f: Fixture) {
  const r = f.resposta;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (r.x_custo) headers["X-Custo"] = r.x_custo;
  if (r.retry_after) headers["Retry-After"] = r.retry_after;
  if (r.idempotent_replay) headers["Idempotent-Replay"] = r.idempotent_replay;
  if (r.location) headers.Location = r.location;
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers });
  });
  const c = criarClienteDoMotor({ baseUrl: "https://motor", token: "t-leitura", tokenEscrita: "t-escrita" }, { fetch: fetch as unknown as typeof globalThis.fetch, esperar: async () => {} });
  return { c, fetch, chamadas };
}

const escritaDa = (f: Fixture): Escrita => ({ ator: f.requisicao.ator, chave: f.requisicao.cabecalhos["Idempotency-Key"] });

async function partesDoCorpo(init: RequestInit) {
  const h = init.headers as Record<string, string>;
  const form = await new Response(init.body as BodyInit, { headers: { "Content-Type": h["Content-Type"] } }).formData();
  const partes: Parte[] = [];
  for (const [campo, v] of form.entries()) {
    if (typeof v === "string") partes.push({ campo, valor: v });
    else {
      const b = Buffer.from(await v.arrayBuffer());
      partes.push({ campo, nome: v.name, tamanho: b.length, sha256: createHash("sha256").update(b).digest("hex") });
    }
  }
  return partes;
}

describe("fixtures reais das escritas (§13)", () => {
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();

  it("toda fixture tem a sua chamada no cliente, e toda chamada tem fixture", () => {
    expect(arquivos).toEqual(Object.keys(CHAMADAS).sort());
  });

  it.each(arquivos.filter((a) => !SEM_CONFERIR_REQUISICAO.has(a)))("%s: o Connect monta a mesma requisição", async (nome) => {
    const f = ler(nome);
    const { c, chamadas } = servir(f);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await CHAMADAS[nome](c, f, escritaDa(f)).catch(() => null);
    expect(chamadas).toHaveLength(1);
    const { url, init } = chamadas[0];
    const h = init.headers as Record<string, string>;
    expect(init.method).toBe(f.requisicao.metodo);
    expect(url).toBe(`https://motor${f.requisicao.caminho}`);
    expect(h.Authorization).toBe("Bearer t-escrita");
    expect(JSON.parse(Buffer.from(h["X-Connect-Ator"], "base64url").toString("utf8"))).toEqual(f.requisicao.ator);
    expect(h["Idempotency-Key"]).toBe(f.requisicao.cabecalhos["Idempotency-Key"]);
    if (f.requisicao.partes) {
      expect(h["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
      // Content-Length declarado e exato (§13.0.9: o motor confere antes de ler).
      expect(Number(h["Content-Length"])).toBe((init.body as Uint8Array).byteLength);
      const esperadas = f.requisicao.partes.map((p) => (p.nome !== undefined ? { campo: p.campo, nome: p.nome, tamanho: p.tamanho, sha256: p.sha256 } : { campo: p.campo, valor: p.valor }));
      const enviadas = await partesDoCorpo(init);
      const ordem = (x: Parte[]) => [...x].sort((a, b) => (a.nome ? 1 : 0) - (b.nome ? 1 : 0));
      expect(ordem(enviadas)).toEqual(ordem(esperadas));
    } else if (f.requisicao.corpo) {
      expect(h["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual(f.requisicao.corpo);
    } else {
      expect(init.body).toBeUndefined();
    }
  });

  it.each(arquivos.filter((a) => !a.startsWith("erro_")))("%s: a resposta passa pelo esquema, com a classe de custo certa", async (nome) => {
    const f = ler(nome);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { c, fetch } = servir(f);
    await expect(CHAMADAS[nome](c, f, escritaDa(f))).resolves.toBeDefined();
    expect(aviso).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });

  it.each(arquivos.filter((a) => a.startsWith("erro_")))("%s: chega como ErroDoMotor com status e código do motor", async (nome) => {
    const f = ler(nome);
    const { c } = servir(f);
    const e = (await CHAMADAS[nome](c, f, escritaDa(f)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect(e).toBeInstanceOf(ErroDoMotor);
    expect([e.status, e.codigo]).toEqual([f.resposta.status, f.resposta.corpo.codigo]);
  });

  it("sem Idempotency-Key, a apuração da cobertura nem sai do Connect", async () => {
    const f = ler("erro_idempotencia_ausente");
    const { c, fetch } = servir(f);
    await expect(c.apurarCobertura(R, corpo(f), { ator: f.requisicao.ator })).rejects.toMatchObject({ codigo: "idempotencia_ausente" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("os três envios de arquivo também exigem a chave", async () => {
    const f = ler("documentos_envio");
    const { c, fetch } = servir(f);
    await expect(c.enviarDocumentos(R, arquivosDe(f), { ator: f.requisicao.ator })).rejects.toMatchObject({ codigo: "idempotencia_ausente" });
    await expect(c.conferirRelatorioOmie(R, new File(["x"], "a.csv"), undefined, { ator: f.requisicao.ator })).rejects.toMatchObject({ codigo: "idempotencia_ausente" });
    await expect(c.confrontarPlanilha(R, new File(["x"], "a.xlsx"), undefined, { ator: f.requisicao.ator })).rejects.toMatchObject({ codigo: "idempotencia_ausente" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("202 da cobertura devolve a Execucao; o replay vem igual", async () => {
    for (const nome of ["cobertura_apurar", "cobertura_apurar_replay"]) {
      const f = ler(nome);
      const { c } = servir(f);
      const e = (await CHAMADAS[nome](c, f, escritaDa(f))) as { id: number; acao: string; estado: string };
      expect([e.id, e.acao, e.estado]).toEqual([38, "cobertura", "pendente"]);
    }
  });

  it("409 cobertura_em_andamento e execucao_duplicada trazem a frase e o existente", async () => {
    const f = ler("erro_cobertura_em_andamento");
    const e = (await CHAMADAS.erro_cobertura_em_andamento(servir(f).c, f, escritaDa(f)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect(e.message).toBe("essa competência já está sendo apurada.");
    expect(e.definitivo).toBe(true);
    const d = ler("erro_execucao_duplicada");
    const e2 = (await CHAMADAS.erro_execucao_duplicada(servir(d).c, d, escritaDa(d)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect((e2.corpo.existente as { id: number }).id).toBe(38);
  });

  it("503 motor_ocupado numa escrita pesada: mensagem amigável, Retry-After e nenhuma nova tentativa", async () => {
    const f = ler("erro_motor_ocupado");
    const { c, fetch } = servir(f);
    const e = (await CHAMADAS.erro_motor_ocupado(c, f, escritaDa(f)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect([e.status, e.ocupado, e.retryAfter]).toEqual([503, true, 5]);
    expect(e.message).toMatch(/tente em alguns segundos/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("422 pagamento_nao_aceitavel na correção traz a linha já corrigida e o registro", async () => {
    const f = ler("erro_pagamento_corrigir_aceite_recusado");
    const e = (await CHAMADAS.erro_pagamento_corrigir_aceite_recusado(servir(f).c, f, escritaDa(f)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect(e.codigo).toBe("pagamento_nao_aceitavel");
    expect((e.corpo.pagamento as { valor_corrigido: string }).valor_corrigido).toBe("12.00");
    expect(e.corpo.registro_ids).toEqual([284]);
    expect(e.message).toMatch(/^não dá para aceitar/);
  });

  it("422 de validação chega com os campos do motor", async () => {
    for (const [nome, campo] of [["erro_parametro_invalido_valor_numero", "valor"], ["erro_contrato_sem_tratativa", "tratativa"], ["erro_simulacao_linha", "linha"], ["erro_parte_desconhecida", "outra"]] as const) {
      const f = ler(nome);
      const e = (await CHAMADAS[nome](servir(f).c, f, escritaDa(f)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
      expect(e.campos?.[campo]).toBeTruthy();
    }
  });

  it("403 token_sem_escrita tem a mensagem do Connect, não a do motor", async () => {
    const f = ler("erro_token_sem_escrita");
    const e = (await CHAMADAS.erro_token_sem_escrita(servir(f).c, f, escritaDa(f)).catch((x) => x)) as InstanceType<typeof ErroDoMotor>;
    expect(e.message).toMatch(/token de escrita configurado/);
  });
});
