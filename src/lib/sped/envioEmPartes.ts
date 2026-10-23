// O envio de documentos acima de 25 MiB, em partes (API-CONNECT §14.4),
// 23/10/2026. Puro: roda no navegador, e os testes o exercitam com uma API
// falsa.
//
// ─── O caminho dos bytes ────────────────────────────────────────────────────
//
// navegador ──8 MiB──▶ rota do Connect ──stream──▶ motor
//
// O navegador nunca fala com o motor nem vê token dele: cada parte vai a
// `/api/fiscal/sped/uploads/{id}/partes/{n}`, que confere o portão de §13
// (agir no módulo, raiz no alcance, token de escrita) e o dono da sessão
// (`X-Upload-Token`, assinado pelo Connect) e repassa o corpo ao motor como
// stream. 8 MiB por parte cabe no teto do proxy (26 MB, `next.config.ts`).
//
// ─── A ordem ────────────────────────────────────────────────────────────────
//
// 1. Cria a sessão (Idempotency-Key derivada do gesto: a nova tentativa da
//    criação devolve a mesma sessão).
// 2. Lê o arquivo parte a parte, **na ordem**, alimentando o SHA-256 do
//    arquivo inteiro (incremental, `./sha256`); cada parte que o motor ainda
//    não tem sai com o seu `X-Parte-SHA256`, até duas por vez.
// 3. Conclui com o SHA-256 do arquivo inteiro.
//
// Retomar é rodar de novo com a mesma sessão: o motor diz, em `GET
// /uploads/{id}`, as partes que já tem, e só as que faltam saem (o arquivo é
// relido do disco local para o SHA-256, o que é rápido). Resposta perdida na
// conclusão: consulta a sessão; `concluida` → concluir de novo, que é replay
// idempotente e devolve o mesmo relatório.

const MiB = 1024 * 1024;

/** `tamanho_parte` do motor (§14.4): toda parte tem isto, menos a última. */
export const TAMANHO_DA_PARTE = 8 * MiB;
/** O teto da sessão: 500 MiB, o `LIMITE_ENVIO_MB` do painel. */
export const TETO_DO_UPLOAD = 500 * MiB;
/** O teto do `POST /documentos` (§13.3) menos o envelope do multipart: acima disto, partes. */
export const LIMITE_DO_ENVIO_DIRETO = 25 * MiB - 64 * 1024;
/** Partes em voo ao mesmo tempo (§14.6: "duas ou três por vez"). */
export const PARTES_EM_PARALELO = 2;
/** Novas tentativas de uma parte (rede, 5xx, parte corrompida). Parte é leve e o PUT é idempotente. */
export const TENTATIVAS_POR_PARTE = 3;
/** Extensões aceitas por §13.3 numa sessão (um arquivo por sessão). */
export const EXTENSOES_DO_UPLOAD = ["xml", "csv", "zip", "pdf", "jpg", "jpeg", "png"] as const;
/** Quantas vezes consultar a sessão enquanto o motor conclui (5 s cada, o teto do gunicorn é 300 s). */
const CONSULTAS_NA_CONCLUSAO = 60;

const extensao = (nome: string) => (nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "");

export type ArquivoLocal = { name: string; size: number; slice(inicio: number, fim: number): { arrayBuffer(): Promise<ArrayBuffer> } };

export type ModoDoEnvio = { modo: "direto" } | { modo: "partes" } | { modo: "recusado"; motivo: string };

/**
 * Qual rota o lote escolhido usa (§14.6): até 25 MiB, `POST /documentos`;
 * acima, uma sessão de upload por arquivo, até 500 MiB no total.
 */
export function modoDoEnvio(arquivos: readonly { name: string; size: number }[]): ModoDoEnvio {
  const total = arquivos.reduce((s, a) => s + a.size, 0);
  if (total <= LIMITE_DO_ENVIO_DIRETO) return { modo: "direto" };
  if (total > TETO_DO_UPLOAD) return { modo: "recusado", motivo: `O lote passa de 500 MB, o limite do envio em partes. Divida em lotes menores ou use a importação por pasta.` };
  const ruim = arquivos.find((a) => problemaDoNome(a.name));
  if (ruim) return { modo: "recusado", motivo: problemaDoNome(ruim.name)! };
  const vazio = arquivos.find((a) => a.size === 0);
  if (vazio) return { modo: "recusado", motivo: `O arquivo ${vazio.name} está vazio.` };
  return { modo: "partes" };
}

/** O nome que o motor aceita numa sessão (§14.4): 1 a 255, sem barra, extensão de §13.3. */
export function problemaDoNome(nome: string): string | null {
  if (!nome || nome.length > 255) return "O nome do arquivo tem de ter de 1 a 255 caracteres.";
  if (/[\\/]/.test(nome)) return `Nome de arquivo inválido: ${nome}.`;
  if (!(EXTENSOES_DO_UPLOAD as readonly string[]).includes(extensao(nome))) return `Acima de 25 MB vão em partes só .zip, .xml, .csv, .pdf e imagens; ${nome} não é. Compacte o lote num .zip.`;
  return null;
}

export const partesEsperadas = (tamanho: number, tamanhoParte = TAMANHO_DA_PARTE) => Math.max(1, Math.ceil(tamanho / tamanhoParte));

/** Os bytes da parte `numero` (1..N): todas com `tamanhoParte`, menos a última. */
export function faixaDaParte(numero: number, tamanho: number, tamanhoParte = TAMANHO_DA_PARTE): { inicio: number; fim: number; tamanho: number } {
  const n = partesEsperadas(tamanho, tamanhoParte);
  if (!Number.isInteger(numero) || numero < 1 || numero > n) throw new RangeError(`parte ${numero} fora de 1..${n}`);
  const inicio = (numero - 1) * tamanhoParte;
  const fim = Math.min(inicio + tamanhoParte, tamanho);
  return { inicio, fim, tamanho: fim - inicio };
}

/** As partes que o motor ainda não tem, em ordem. */
export function partesQueFaltam(u: { partes_esperadas: number; partes_recebidas: readonly number[] }): number[] {
  const tem = new Set(u.partes_recebidas);
  return Array.from({ length: u.partes_esperadas }, (_, i) => i + 1).filter((n) => !tem.has(n));
}

/** Bytes que o motor já tem, pelas partes recebidas. */
export function bytesRecebidos(partes: readonly number[], tamanho: number, tamanhoParte = TAMANHO_DA_PARTE): number {
  return [...new Set(partes)].reduce((s, n) => {
    try { return s + faixaDaParte(n, tamanho, tamanhoParte).tamanho; } catch { return s; }
  }, 0);
}

// ─── A orquestração ──────────────────────────────────────────────────────────

/** O que a API do Connect devolve: a mesma forma de `ResultadoDoMotor`. */
export type Resposta<T> = { ok: true; mensagem: string; dados?: T } | { ok: false; mensagem: string; codigo?: string | null; detalhe?: Record<string, unknown>; renovarChave: boolean };

export type UploadNoConnect = { id: string; tamanho_parte: number; partes_esperadas: number; partes_recebidas: number[]; estado: "aberta" | "concluindo" | "concluida"; importacao_id: number | null; expira_em: string | null };

/** A sessão do lado do navegador: o id, o token do dono e, quando já calculado, o SHA-256 do arquivo. */
export type SessaoDoEnvio = { id: string; token: string; tamanhoParte: number; partesEsperadas: number; sha256?: string };

export type ApiDoUpload<R> = {
  criar(nome: string, tamanho: number): Promise<Resposta<{ upload: UploadNoConnect; token: string }>>;
  ver(s: SessaoDoEnvio): Promise<Resposta<UploadNoConnect>>;
  parte(s: SessaoDoEnvio, numero: number, bytes: Uint8Array<ArrayBuffer>, sha256: string): Promise<Resposta<{ partes_recebidas: number[] }>>;
  concluir(s: SessaoDoEnvio, sha256: string): Promise<Resposta<R>>;
};

export type ProgressoDoEnvio = { fase: "criando" | "enviando" | "concluindo" | "consultando"; enviados: number; total: number; parte?: number };

export type DepsDoEnvio<R> = {
  api: ApiDoUpload<R>;
  /** SHA-256 de uma parte (Web Crypto no navegador). */
  sha256DaParte(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
  /** O SHA-256 incremental do arquivo inteiro. */
  novoHash(): { update(b: Uint8Array): unknown; hex(): string };
  esperar(ms: number): Promise<void>;
  aoProgresso?(p: ProgressoDoEnvio): void;
  /** Cancelar: para entre as partes; quem cancela apaga a sessão (DELETE). */
  sinal?: AbortSignal;
  paralelas?: number;
  /** Logo depois de criar a sessão: quem chama a guarda para retomar ou cancelar. */
  aoAbrir?(s: SessaoDoEnvio): void;
};

export type FimDoEnvio<R> =
  | { ok: true; dados: R; sessao: SessaoDoEnvio; mensagem: string }
  | { ok: false; mensagem: string; codigo: string | null; sessao: SessaoDoEnvio | null; retomavel: boolean };

const cancelado = <R,>(sessao: SessaoDoEnvio | null): FimDoEnvio<R> => ({ ok: false, mensagem: "Envio cancelado.", codigo: "cancelado", sessao, retomavel: false });

/** Falha de transporte ou 5xx: vale repetir a mesma coisa. */
const transitoria = (r: { ok: false; codigo?: string | null; renovarChave: boolean }) => !r.renovarChave || r.codigo === "falha_de_rede" || r.codigo === "tempo_esgotado";

export type DesfechoDaConclusao = "pronto" | "consultar" | "reenviar_faltantes" | "reenviar_todas" | "parar";

/**
 * O que fazer com a resposta do `concluir` (§14.4):
 * - resposta perdida (rede, tempo esgotado, 5xx) ou `upload_em_andamento`:
 *   consultar a sessão — pode ter concluído;
 * - `upload_incompleto`: mandar as que faltam e concluir de novo;
 * - `sha256_divergente`: a sessão continua aberta, reenviar todas;
 * - `motor_ocupado` e o resto: parar. Conclusão é pesada e **não** se repete
 *   sozinha: a tela oferece "concluir de novo", e a sessão continua aberta.
 */
export function depoisDaConclusao(r: Resposta<unknown>): DesfechoDaConclusao {
  if (r.ok) return "pronto";
  if (r.codigo === "motor_ocupado") return "parar";
  if (r.codigo === "upload_em_andamento" || transitoria(r)) return "consultar";
  if (r.codigo === "upload_incompleto") return "reenviar_faltantes";
  if (r.codigo === "sha256_divergente") return "reenviar_todas";
  return "parar";
}

/** Envia (ou retoma) um arquivo em partes e conclui. Nunca lança: o fim diz se dá para retomar. */
export async function enviarEmPartes<R>(arquivo: ArquivoLocal, deps: DepsDoEnvio<R>, retomar: SessaoDoEnvio | null = null): Promise<FimDoEnvio<R>> {
  const { api } = deps;
  const total = arquivo.size;
  const avisar = (p: Omit<ProgressoDoEnvio, "total">) => deps.aoProgresso?.({ ...p, total });
  let sessao: SessaoDoEnvio;
  let recebidas: number[] = [];

  if (!retomar) {
    avisar({ fase: "criando", enviados: 0 });
    const c = await api.criar(arquivo.name, arquivo.size);
    if (!c.ok || !c.dados) return { ok: false, mensagem: c.mensagem, codigo: c.ok ? null : c.codigo ?? null, sessao: null, retomavel: !c.ok && transitoria(c) };
    const u = c.dados.upload;
    sessao = { id: u.id, token: c.dados.token, tamanhoParte: u.tamanho_parte, partesEsperadas: u.partes_esperadas };
    recebidas = u.partes_recebidas;
    deps.aoAbrir?.(sessao);
  } else {
    sessao = retomar;
    const v = await api.ver(sessao);
    if (!v.ok || !v.dados) {
      const perdida = !v.ok && v.codigo === "nao_encontrado";
      return { ok: false, mensagem: perdida ? "A sessão deste envio venceu ou foi apagada no motor. Envie o arquivo de novo." : v.mensagem, codigo: v.ok ? null : v.codigo ?? null, sessao: perdida ? null : sessao, retomavel: !perdida };
    }
    // Concluída (a aba fechou antes da resposta): as partes já foram apagadas;
    // só falta o SHA-256 para pedir o relatório de novo (replay).
    recebidas = v.dados.estado === "concluida" ? Array.from({ length: sessao.partesEsperadas }, (_, i) => i + 1) : v.dados.partes_recebidas;
  }
  if (sessao.partesEsperadas !== partesEsperadas(total, sessao.tamanhoParte)) {
    return { ok: false, mensagem: "O arquivo escolhido não é o desta sessão (o tamanho mudou). Envie de novo.", codigo: "parte_invalida", sessao: null, retomavel: false };
  }

  let forcar: Set<number> | null = null;
  for (let rodada = 0; rodada < 3; rodada++) {
    const r: Awaited<ReturnType<typeof mandarPartes<R>>> = await mandarPartes(arquivo, sessao, recebidas, forcar, deps);
    if (r.fim) return r.fim;
    sessao = r.sessao;
    if (deps.sinal?.aborted) return cancelado(sessao);

    const fim = await concluirComConsulta(sessao, deps, total);
    if (fim.fim) return fim.fim;
    if (fim.desfecho === "reenviar_faltantes") { forcar = new Set(fim.faltam); recebidas = recebidas.filter((n) => !forcar!.has(n)); continue; }
    if (fim.desfecho === "reenviar_todas") { forcar = null; recebidas = []; sessao = { ...sessao, sha256: undefined }; continue; }
  }
  return { ok: false, mensagem: "O motor não aceitou as partes depois de reenviar. Cancele e envie de novo.", codigo: "sha256_divergente", sessao, retomavel: false };
}

/** Lê todas as partes na ordem (para o SHA-256 do arquivo) e manda as que faltam, até `paralelas` por vez. */
async function mandarPartes<R>(arquivo: ArquivoLocal, sessao: SessaoDoEnvio, recebidas: number[], forcar: Set<number> | null, deps: DepsDoEnvio<R>): Promise<{ fim: FimDoEnvio<R>; sessao?: undefined } | { fim: null; sessao: SessaoDoEnvio }> {
  const total = arquivo.size;
  const tem = new Set(recebidas);
  const faltam = partesQueFaltam({ partes_esperadas: sessao.partesEsperadas, partes_recebidas: recebidas }).filter((n) => !forcar || forcar.has(n) || !tem.has(n));
  // Já tem tudo e o SHA-256 já foi calculado (retomar só a conclusão): nem relê o arquivo.
  if (faltam.length === 0 && sessao.sha256) return { fim: null, sessao };

  let enviados = bytesRecebidos([...tem], total, sessao.tamanhoParte);
  const avisar = (parte?: number) => deps.aoProgresso?.({ fase: "enviando", enviados, total, parte });
  avisar();
  const hash = deps.novoHash();
  const emVoo = new Set<Promise<void>>();
  let falha: FimDoEnvio<R> | null = null;
  const precisa = new Set(faltam);

  const mandar = async (numero: number, bytes: Uint8Array<ArrayBuffer>) => {
    const sha = await deps.sha256DaParte(bytes);
    for (let t = 1; ; t++) {
      if (deps.sinal?.aborted || falha) return;
      const r = await deps.api.parte(sessao, numero, bytes, sha);
      if (r.ok) { enviados += bytes.byteLength; avisar(numero); return; }
      const repetir = t < TENTATIVAS_POR_PARTE && (transitoria(r) || r.codigo === "parte_corrompida");
      if (!repetir) {
        falha ??= { ok: false, mensagem: `Parte ${numero} de ${sessao.partesEsperadas}: ${r.mensagem}`, codigo: r.codigo ?? null, sessao, retomavel: r.codigo !== "upload_encerrado" && r.codigo !== "nao_encontrado" };
        return;
      }
      await deps.esperar(1000 * t);
    }
  };

  for (let n = 1; n <= sessao.partesEsperadas; n++) {
    if (deps.sinal?.aborted) break;
    if (falha) break;
    const { inicio, fim } = faixaDaParte(n, total, sessao.tamanhoParte);
    const bytes = new Uint8Array(await arquivo.slice(inicio, fim).arrayBuffer());
    hash.update(bytes);
    if (!precisa.has(n)) continue;
    const p: Promise<void> = mandar(n, bytes).finally(() => emVoo.delete(p));
    emVoo.add(p);
    if (emVoo.size >= (deps.paralelas ?? PARTES_EM_PARALELO)) await Promise.race(emVoo);
  }
  await Promise.all(emVoo);
  if (deps.sinal?.aborted) return { fim: cancelado(sessao) };
  if (falha) return { fim: falha };
  return { fim: null, sessao: { ...sessao, sha256: hash.hex() } };
}

async function concluirComConsulta<R>(sessao: SessaoDoEnvio, deps: DepsDoEnvio<R>, total: number): Promise<{ fim: FimDoEnvio<R>; desfecho?: undefined; faltam?: undefined } | { fim: null; desfecho: "reenviar_faltantes" | "reenviar_todas"; faltam: number[] }> {
  const sha = sessao.sha256!;
  deps.aoProgresso?.({ fase: "concluindo", enviados: total, total });
  let r = await deps.api.concluir(sessao, sha);
  for (let consulta = 0; ; consulta++) {
    const d = depoisDaConclusao(r);
    if (r.ok) {
      if (r.dados === undefined) return { fim: { ok: false, mensagem: "O Connect não recebeu o relatório da importação.", codigo: "resposta_invalida", sessao, retomavel: true } };
      return { fim: { ok: true, dados: r.dados, sessao, mensagem: r.mensagem } };
    }
    if (d === "reenviar_faltantes") {
      const faltam = Array.isArray(r.detalhe?.faltam) ? (r.detalhe!.faltam as unknown[]).filter((x): x is number => typeof x === "number") : [];
      return { fim: null, desfecho: "reenviar_faltantes", faltam };
    }
    if (d === "reenviar_todas") return { fim: null, desfecho: "reenviar_todas", faltam: [] };
    if (d === "parar" || consulta >= CONSULTAS_NA_CONCLUSAO) {
      return { fim: { ok: false, mensagem: r.mensagem, codigo: r.codigo ?? null, sessao, retomavel: r.codigo !== "upload_encerrado" } };
    }
    // Resposta perdida ou conclusão em andamento: a sessão diz o que houve.
    if (deps.sinal?.aborted) return { fim: cancelado(sessao) };
    await deps.esperar(5000);
    deps.aoProgresso?.({ fase: "consultando", enviados: total, total });
    const v = await deps.api.ver(sessao);
    if (v.ok && v.dados?.estado === "concluida") { r = await deps.api.concluir(sessao, sha); continue; }
    if (v.ok && v.dados?.estado === "concluindo") { r = { ok: false, mensagem: "A conclusão ainda está rodando no motor.", codigo: "upload_em_andamento", renovarChave: false }; continue; }
    if (v.ok && v.dados?.estado === "aberta") {
      // A conclusão não chegou a acontecer (ou falhou do lado de lá): a sessão está intacta.
      return { fim: { ok: false, mensagem: "A conclusão não terminou no motor. Use “Concluir de novo”: as partes já enviadas ficam.", codigo: r.codigo ?? null, sessao, retomavel: true } };
    }
    if (!v.ok && v.codigo === "nao_encontrado") return { fim: { ok: false, mensagem: "A sessão deste envio venceu ou foi apagada no motor. Envie o arquivo de novo.", codigo: "nao_encontrado", sessao: null, retomavel: false } };
    // A consulta também falhou: segue consultando, até o limite.
    if (!v.ok) r = { ok: false, mensagem: v.mensagem, codigo: "falha_de_rede", renovarChave: false };
  }
}

// ─── A API do Connect, no navegador ──────────────────────────────────────────

export const CABECALHO_DO_TOKEN = "X-Upload-Token";

/**
 * As chamadas às rotas do Connect (`/api/fiscal/sped/uploads`). Falha de
 * rede vira `Resposta` com `renovarChave: false`, como nas Server Actions.
 */
export function apiDoConnect<R>(raiz: string, gesto: string, opcoes: { fetch?: typeof fetch; sinal?: AbortSignal } = {}): ApiDoUpload<R> & { apagar(s: SessaoDoEnvio): Promise<Resposta<undefined>> } {
  const f = opcoes.fetch ?? globalThis.fetch.bind(globalThis);
  const base = "/api/fiscal/sped/uploads";
  const q = `raiz=${encodeURIComponent(raiz)}`;
  async function chamar<T>(url: string, init: RequestInit, comSinal = true): Promise<Resposta<T>> {
    try {
      const resposta = await f(url, { ...init, signal: comSinal ? opcoes.sinal : undefined, cache: "no-store" });
      try {
        return (await resposta.json()) as Resposta<T>;
      } catch {
        return { ok: false, mensagem: `O Connect respondeu ${resposta.status} sem corpo. Tente de novo.`, codigo: resposta.status >= 500 ? "falha_de_rede" : null, renovarChave: resposta.status < 500 };
      }
    } catch {
      if (comSinal && opcoes.sinal?.aborted) return { ok: false, mensagem: "Envio cancelado.", codigo: "cancelado", renovarChave: true };
      return { ok: false, mensagem: "Falha de conexão com o Connect.", codigo: "falha_de_rede", renovarChave: false };
    }
  }
  const comToken = (s: SessaoDoEnvio, extra: Record<string, string> = {}) => ({ [CABECALHO_DO_TOKEN]: s.token, ...extra });
  return {
    criar: (nome, tamanho) => chamar(`${base}?${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, tamanho, gesto }) }),
    ver: (s) => chamar(`${base}/${s.id}?${q}`, { method: "GET", headers: comToken(s) }),
    parte: (s, n, bytes, sha256) => chamar(`${base}/${s.id}/partes/${n}?${q}`, { method: "PUT", headers: comToken(s, { "Content-Type": "application/octet-stream", "X-Parte-SHA256": sha256 }), body: bytes }),
    concluir: (s, sha256) => chamar(`${base}/${s.id}/concluir?${q}`, { method: "POST", headers: comToken(s, { "Content-Type": "application/json" }), body: JSON.stringify({ sha256 }) }),
    // Sem o sinal: apagar vem justamente depois de cancelar.
    apagar: (s) => chamar(`${base}/${s.id}?${q}`, { method: "DELETE", headers: comToken(s) }, false),
  };
}
