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
    // O corpo de erro traz `codigo`; se não vier JSON, o status é o que se tem.
    let codigo: string | null = null;
    let detalhe = resposta.statusText;
    try {
      const corpo = (await resposta.json()) as { codigo?: string; mensagem?: string; detail?: string };
      codigo = corpo.codigo ?? null;
      detalhe = corpo.mensagem ?? corpo.detail ?? detalhe;
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
      const corpo = (await resposta.json()) as { codigo?: string };
      codigo = corpo.codigo ?? null;
    } catch {
      // PDF com erro nem sempre devolve JSON
    }
    throw new ErroDoSped(resposta.status, codigo, `SPED ${resposta.status} ao buscar PDF`);
  }
  return resposta.arrayBuffer();
}
