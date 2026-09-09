// Cliente dos endpoints `/api/integracao/` do painel do SPED.
//
// O Connect **não fala com o MySQL do SPED**, e isso é decisão, não limitação:
// o Connect é multi-tenant e não deve carregar credencial de banco de outro
// sistema; dois consumidores independentes no mesmo pool é como se esgota
// conexão; e a descompressão zstd com dicionário treinado já está resolvida do
// lado de lá. O único segredo que atravessa é um token de serviço.
//
// Contrato completo em Projects/Connect-41/Contrato-API-SPED-Documentos.

/** Um documento como o índice do SPED o entrega. Nomes em snake_case: é JSON de fora. */
export type DocumentoDoSped = {
  tipo: "nfe" | "cte" | "nfse";
  identificador: string;
  /** 44 dígitos em NF-e/CT-e; **null** em NFS-e municipal. */
  chave: string | null;
  cnpj_raiz: string;
  sentido: "entrada" | "saida" | "indefinido";
  competencia: string;
  numero: string;
  serie: string | null;
  data_emissao: string;
  cnpj_emitente: string | null;
  nome_emitente: string | null;
  cnpj_destinatario: string | null;
  nome_destinatario: string | null;
  /** **`null` não é zero** — anda junto com `detalhe: "parcial"`. */
  valor: string | number | null;
  detalhe: "completo" | "parcial";
  /** `false` = não existe XML armazenado; não pedir o PDF. */
  renderizavel: boolean;
  /** Lápide: o documento saiu da origem e viaja assim uma última vez. */
  removido: boolean;
  atualizado_em: string;
};

export type PaginaDeDocumentos = {
  documentos: DocumentoDoSped[];
  /** Continue paginando AGORA. `null` = a página atual foi a última. */
  proximo_cursor: string | null;
  /** Recomece daqui na PRÓXIMA sincronização. Guardar verbatim. */
  cursor_retomada: string | null;
  /** Informativo, para tela e log. **Nunca devolver à API.** */
  watermark?: string | null;
  /**
   * Quinta chave do envelope, declarada aqui para o próximo leitor não
   * redescobri-la: **este cliente não a usa**.
   *
   * Medida em produção em 2026-09-09 (`limite=1`, `alterado_desde` na origem):
   * veio `null`, enquanto `proximo_cursor` e `cursor_retomada` vieram com 96
   * caracteres e o `watermark` preenchido — que é a assinatura do modo
   * sincronização. Não está no contrato, e o lado do SPED ainda não documentou
   * o que ela significa quando vem preenchida.
   *
   * Quem retoma manda `cursor_retomada`; quem pagina manda `proximo_cursor`.
   * Enquanto não houver definição, não inventar uso para esta.
   */
  cursor_sincronizacao?: string | null;
};

export type CredenciaisSped = { baseUrl: string; token: string };

/**
 * Erro do SPED com o código do contrato preservado.
 *
 * O código importa mais que o status: `sem_xml_armazenado` (409) não é falha da
 * sincronização, é um documento catalogado sem XML — a tela desenha a linha com
 * a lacuna marcada em vez de sumir com ele.
 */
export class ErroDoSped extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string | null,
    mensagem: string
  ) {
    super(mensagem);
    this.name = "ErroDoSped";
  }

  /** Catalogado, mas sem XML guardado. Não é erro de integração. */
  get semXml(): boolean {
    return this.codigo === "sem_xml_armazenado" || this.status === 409;
  }

  /** Token errado, ausente, ou rota fora de `/api/integracao/`. */
  get naoAutenticado(): boolean {
    return this.status === 401;
  }
}

/**
 * Credenciais do ambiente.
 *
 * O token mora no `.env` e **não** no banco, ao contrário do Chatwoot. É o que
 * o contrato pede: um segredo só, que nunca passa por chat, para um serviço só
 * — não há um SPED por tenant. Guardá-lo cifrado numa tabela acrescentaria uma
 * chave de criptografia ao caminho sem acrescentar isolamento nenhum.
 */
export function credenciaisDoAmbiente(): CredenciaisSped | null {
  const baseUrl = process.env.SPED_API_URL?.replace(/\/+$/, "");
  const token = process.env.SPED_API_TOKEN;
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

/**
 * Corpo de erro do SPED, em qualquer um dos três formatos que já circularam.
 *
 * Levantado em 2026-09-09, ao ligar a integração pela primeira vez: o contrato
 * no vault promete `{"erro": "<codigo>"}` no topo, este cliente lia
 * `{"codigo": ...}`, e o que a API de fato devolve é o envelope padrão do
 * FastAPI para `HTTPException` — `{"detail": {"erro": "...", "tipo": "..."}}`.
 * Os três discordavam entre si.
 *
 * Ler os três em vez de eleger um: a alternativa era mudar o envelope do lado
 * do SPED, o que quebraria qualquer consumidor que já leia `detail.erro`, e
 * trocaria um descasamento por outro. Aqui é uma função, e ela sobrevive a
 * qualquer dos formatos virar o canônico.
 *
 * `detail` string é o formato do FastAPI quando o `detail` é texto simples
 * (`HTTPException(status_code=..., detail="mensagem")`) — vira mensagem, não
 * código, porque não é um identificador tipado.
 */
export type CorpoDeErro = {
  codigo?: unknown;
  erro?: unknown;
  detail?: unknown;
  mensagem?: unknown;
};

export function extrairErro(corpo: CorpoDeErro): { codigo: string | null; mensagem: string | null } {
  const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

  const detail = corpo.detail;
  const detailObjeto =
    detail !== null && typeof detail === "object" ? (detail as CorpoDeErro) : null;

  const codigo =
    texto(corpo.codigo) ??
    texto(corpo.erro) ??
    (detailObjeto ? texto(detailObjeto.erro) ?? texto(detailObjeto.codigo) : null);

  const mensagem = texto(corpo.mensagem) ?? texto(detail);

  return { codigo, mensagem };
}

const TIMEOUT_MS = 20_000;

async function pedir<T>(creds: CredenciaisSped, caminho: string, params: URLSearchParams): Promise<T> {
  const url = `${creds.baseUrl}/api/integracao/${caminho}?${params.toString()}`;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.token}`, Accept: "application/json" },
      signal: controle.signal,
      // O índice muda; cache de fetch aqui serviria dado velho como se fosse
      // sincronização.
      cache: "no-store",
    });
  } catch (err) {
    const motivo = err instanceof Error && err.name === "AbortError" ? "tempo esgotado" : "falha de rede";
    throw new ErroDoSped(0, null, `${motivo} ao chamar ${caminho}`);
  } finally {
    clearTimeout(relogio);
  }

  if (!resposta.ok) {
    // Três formatos possíveis — ver `extrairErro`. Se não vier JSON, sobra o status.
    let codigo: string | null = null;
    let detalhe = resposta.statusText;
    try {
      const { codigo: c, mensagem } = extrairErro((await resposta.json()) as CorpoDeErro);
      codigo = c;
      detalhe = mensagem ?? detalhe;
    } catch {
      // corpo não-JSON: fica o statusText
    }
    throw new ErroDoSped(resposta.status, codigo, `SPED ${resposta.status}: ${codigo ?? detalhe}`);
  }

  return (await resposta.json()) as T;
}

/**
 * Uma página da listagem.
 *
 * `cnpjRaiz` é obrigatório — do lado de lá, esquecê-lo é 422 e nunca "todos os
 * contribuintes". Por isso é parâmetro posicional aqui: não dá para omitir sem
 * o compilador reclamar.
 *
 * `cursor` e `alteradoDesde` são mutuamente exclusivos por desenho do laço: com
 * cursor guardado, o instante não entra; sem ele, é a primeira varredura.
 */
export async function listarDocumentos(
  creds: CredenciaisSped,
  cnpjRaiz: string,
  opcoes: { cursor?: string | null; alteradoDesde?: string; limite?: number } = {}
): Promise<PaginaDeDocumentos> {
  const params = new URLSearchParams({ cnpj_raiz: cnpjRaiz });
  // Teto do contrato é 1000; 500 é o tamanho que a medição do laço real usou.
  params.set("limite", String(Math.min(Math.max(opcoes.limite ?? 500, 1), 1000)));
  if (opcoes.cursor) {
    // Verbatim. O cursor é base64 opaco e carrega o desempate por
    // (tipo, identificador) além do instante — parsear ou "normalizar" aqui é
    // como se perde ou se repete lote inteiro.
    params.set("cursor", opcoes.cursor);
  } else {
    params.set("alterado_desde", opcoes.alteradoDesde ?? "2000-01-01 00:00:00");
  }
  return pedir<PaginaDeDocumentos>(creds, "documentos", params);
}

/**
 * CT-e de uma janela de **data de rota** — consulta ao vivo, sem ingestão.
 *
 * ─── Por que existe separada de `listarDocumentos` ───────────────────────────
 *
 * CT-e não entra na listagem padrão: `tipo` é opt-in do lado do SPED, e foi
 * pedido assim de propósito. O laço de sincronização chama a listagem sem
 * `tipo` e traz 228 mil documentos; se CT-e viesse junto, viraria dezenas de
 * milhões sem ninguém ter decidido.
 *
 * ─── Por que a janela é `data_rota` e não competência ────────────────────────
 *
 * Foi a competência que pedimos, e o lado do SPED recusou com dado: `data_rota`
 * é a única dimensão indexada, e ela **não coincide** com a competência da
 * chave. Numa janela de 29/12 a 03/01 a divisão real é 59% dez e 41% jan. Um
 * parâmetro chamado `competencia` que filtrasse por rota devolveria mês errado
 * e — pior — perderia documento do mês certo com rota no mês vizinho, que é o
 * erro sem conserto deste lado. Pedir `competencia` com `tipo=cte` é recusado
 * com `filtro_nao_suportado`, em vez de ignorado em silêncio.
 *
 * A `competencia` de cada linha vem exata, do AAMM da chave: agrupar por ela é
 * trabalho nosso, sobre o resultado.
 *
 * ─── O que NÃO vem ──────────────────────────────────────────────────────────
 *
 * `valor` chega `null` com `detalhe: "parcial"` — o `vPrest` só existe dentro
 * do XML, que é o caminho dos 138 GB. Consequência prática: CT-e desta rota
 * **não vira lançamento**, porque `podeLancar` recusa `sem_valor`. Serve para
 * consulta e para abrir o PDF, não para o financeiro.
 *
 * O cursor carrega a janela além da âncora `(data_rota, chave)`. Reusá-lo com
 * outra janela é `cursor_invalido`, e não meio resultado em silêncio.
 */
export async function listarCtePorRota(
  creds: CredenciaisSped,
  cnpjRaiz: string,
  janela: { de: string; ate: string },
  opcoes: { cursor?: string | null; limite?: number } = {}
): Promise<PaginaDeDocumentos> {
  const params = new URLSearchParams({ cnpj_raiz: cnpjRaiz, tipo: "cte" });
  params.set("limite", String(Math.min(Math.max(opcoes.limite ?? 500, 1), 1000)));
  if (opcoes.cursor) {
    // Verbatim, como o outro laço: o cursor é opaco e carrega a janela dentro.
    params.set("cursor", opcoes.cursor);
  } else {
    params.set("data_rota_de", janela.de);
    params.set("data_rota_ate", janela.ate);
  }
  return pedir<PaginaDeDocumentos>(creds, "documentos", params);
}

/** Metadado de um documento. 404 quando a raiz não bate — nunca 403, que confirmaria a existência. */
export async function obterDocumento(
  creds: CredenciaisSped,
  cnpjRaiz: string,
  tipo: string,
  identificador: string
): Promise<DocumentoDoSped> {
  return pedir<DocumentoDoSped>(
    creds,
    `documentos/${encodeURIComponent(tipo)}/${encodeURIComponent(identificador)}`,
    new URLSearchParams({ cnpj_raiz: cnpjRaiz })
  );
}

/**
 * PDF de um documento, como bytes.
 *
 * Não passa por `pedir` porque a resposta não é JSON. O 409
 * `sem_xml_armazenado` continua sendo tratado como `ErroDoSped.semXml`: é a
 * segunda das duas defesas, para a corrida entre a sincronização e a realidade.
 */
export async function obterPdf(
  creds: CredenciaisSped,
  cnpjRaiz: string,
  tipo: string,
  identificador: string
): Promise<ArrayBuffer> {
  const url =
    `${creds.baseUrl}/api/integracao/documentos/${encodeURIComponent(tipo)}/` +
    `${encodeURIComponent(identificador)}/pdf?cnpj_raiz=${encodeURIComponent(cnpjRaiz)}`;
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: "no-store",
  });
  if (!resposta.ok) {
    let codigo: string | null = null;
    try {
      codigo = extrairErro((await resposta.json()) as CorpoDeErro).codigo;
    } catch {
      // PDF com erro nem sempre devolve JSON
    }
    throw new ErroDoSped(resposta.status, codigo, `SPED ${resposta.status} ao buscar PDF`);
  }
  return resposta.arrayBuffer();
}
