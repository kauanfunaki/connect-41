// A conferência do financeiro (Bloco B, Fase B4, 12/11/2026): as partes puras de `FinanceiroService`
// (`src/domain/conciliacao_bancaria/financeiro.py`), sem banco. O serviço que lê e grava fica em
// `servidor/financeiro.ts`; os tipos da tela, em `financeiroTipos.ts`.
//
// O que o banco guarda (`snapshot` e as listas de ids dos vínculos) tem as MESMAS chaves e valores do
// original: snake_case, como o `model_dump(mode="json")` do pydantic, com o dinheiro como o texto do
// `Decimal` ("-350.00"). Por isso os tipos `…Py` daqui são em snake_case, e as funções `…ParaTela`
// fazem a conversão para a tela. O `_hash` é o mesmo da revisão (B3): `hashJson`.
//
// Cada função devolve a recusa do original (mesma frase, mesma ordem de conferência) ou o resultado.
// Os ids novos vêm de um gerador recebido por parâmetro, para o teste-gabarito ser determinístico.

import { compara, dec, ehZero, modulo, reescala, somaTodos, subtrai, texto, type Dec } from "../motor/decimal";
import { removerAcentos } from "../motor/texto";
import type { RazaoConta } from "./razaoTipos";
import { hashJson, ordemComoOExtrato, type JsonPy, type TransacaoDaRevisao } from "./revisao";
import type { ConsultaSispag } from "./sispag";
import type { ExtratoDetalhado } from "./extratoDetalhado";
import type {
  AnaliseFinanceiro,
  CodigoErroFinanceiro,
  DocumentoFinanceiro,
  FonteFinanceiro,
  LinhaFinanceiro,
  LinhaFinanceiroJson,
  ResumoAnaliseFinanceiro,
  Sentido,
  SugestaoFinanceiro,
  SugestoesFinanceiro,
  TipoComparacao,
  TipoDocumentoFinanceiro,
  TipoFonteFinanceiro,
  VinculoFinanceiro,
} from "./financeiroTipos";

export { ordemComoOExtrato };

// ─── Resultado e limites ────────────────────────────────────────────────────

/** A recusa: a frase do original e, quando a tela trata de um jeito próprio, o código. */
export type RecusaFinanceiro = { ok: false; erro: string; codigo?: CodigoErroFinanceiro };
export type ResultadoFinanceiro<T> = { ok: true; valor: T } | RecusaFinanceiro;

/** `ValidationError` (422) do original. */
const invalido = (erro: string, codigo?: CodigoErroFinanceiro): RecusaFinanceiro => (codigo ? { ok: false, erro, codigo } : { ok: false, erro });
/** `ConflictError` (409) do original. */
const conflito = (erro: string, codigo: CodigoErroFinanceiro = "CONFLITO"): RecusaFinanceiro => ({ ok: false, erro, codigo });

/** Uma recusa no meio de uma montagem (`raise` do original); as funções exportadas a devolvem. */
class Recusa extends Error {
  constructor(readonly recusa: RecusaFinanceiro) {
    super(recusa.erro);
  }
}

function capturar<T>(f: () => T): ResultadoFinanceiro<T> {
  try {
    return { ok: true, valor: f() };
  } catch (e) {
    if (e instanceof Recusa) return e.recusa;
    throw e;
  }
}

/**
 * `conciliacao_revisao_max_linhas`, `conciliacao_revisao_max_fontes`,
 * `conciliacao_financeiro_max_documentos_mb` e `conciliacao_financeiro_max_snapshot_mb`
 * (`core/config.py`, em bytes aqui) e o `MAX_VALOR`.
 */
export type LimitesDoFinanceiro = { maxLinhas: number; maxFontes: number; maxDocumentosBytes: number; maxSnapshotBytes: number; maxValor: Dec };

export const LIMITES_DO_FINANCEIRO: LimitesDoFinanceiro = {
  maxLinhas: 20_000,
  maxFontes: 32,
  maxDocumentosBytes: 100 * 1024 * 1024,
  maxSnapshotBytes: 64 * 1024 * 1024,
  maxValor: dec("9999999999999.99"),
};

export const ANALISE_NAO_ENCONTRADA = "Análise do financeiro não encontrada nesta empresa.";
export const CONTA_ATIVA_NAO_ENCONTRADA = "Conta bancária ativa não encontrada nesta empresa.";
export const VERSAO_DESATUALIZADA = "Outra pessoa alterou esta análise. Atualize a tela e confira a seleção.";
export const ANALISE_MUDOU = "A análise mudou. Atualize a tela.";
export const ARQUIVO_REPETIDO = "Este arquivo já foi adicionado à análise.";
export const ORIGINAL_NAO_ENCONTRADO = "Arquivo original não encontrado nesta análise.";
export const RESPONSAVEL_PADRAO = "Usuário da conferência";
export const AVISO_EXTRATO_ALTERADO =
  "O extrato de origem mudou. Vínculos antigos continuam consultáveis; novas relações com EXTRATO exigem outra análise. SISPAG e razão continuam independentes.";
export const AVISO_SEM_EXTRATO =
  "Nenhum movimento bancário no período. Importe o extrato e crie uma nova análise, ou compare com SISPAG/razão.";

// ─── `_valor`, `_nome`, `_banco_compativel` ─────────────────────────────────

const ZERO = dec("0");

/** `_valor`: o valor cabe nas colunas e não tem fração de centavo; devolve com 2 casas. */
export function valorDaConferencia(valor: Dec, limites: LimitesDoFinanceiro = LIMITES_DO_FINANCEIRO): Dec {
  const centavos = reescala(valor, -2);
  if (compara(modulo(valor), limites.maxValor) > 0 || compara(valor, centavos) !== 0) {
    throw new Recusa(invalido("Há valores inválidos ou acima do limite monetário da conferência."));
  }
  return centavos;
}

/** `str.isprintable()` de um caractere: nem controle, formato, substituto, uso privado, não atribuído nem separador (só o espaço passa). */
function imprimivel(c: string): boolean {
  return c === " " || !/^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Z}]$/u.test(c);
}

/** `_nome`: um nome de upload não é caminho nem cabeçalho HTTP confiável. */
export function nomeDoArquivo(nome: string): string {
  const base = nome.replace(/\\/g, "/").split("/").pop() ?? "";
  const limpo = [...base].filter(imprimivel).slice(0, 255).join("");
  return limpo || "documento";
}

/** O tipo de mídia gravado do original, pela extensão do nome (`{"pdf": …, "xls": …, "xlsx": …}`). */
export function mediaTypeDoNome(nome: string): string | null {
  const extensao = nome.slice(nome.lastIndexOf(".") + 1).toLowerCase();
  const tipos: Record<string, string> = {
    pdf: "application/pdf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return Object.hasOwn(tipos, extensao) ? tipos[extensao] : null;
}

const GENERICOS = new Set(["BANCO", "COOPERATIVA", "DE", "DO", "DA", "S", "A"]);

/** Os tokens que identificam um banco: maiúsculas sem acento, sem os termos genéricos. */
function tokensDoBanco(texto: string): Set<string> {
  const normalizado = removerAcentos(texto.toUpperCase());
  return new Set((normalizado.match(/[A-Z]+/g) ?? []).filter((t) => !GENERICOS.has(t)));
}

/**
 * `_banco_compativel`: o banco declarado é o cadastrado? Comparar tokens evita aceitar uma sigla
 * que seja só parte de outra palavra.
 */
export function bancoCompativel(declarado: string, cadastrado: string): boolean {
  const a = tokensDoBanco(declarado);
  const b = tokensDoBanco(cadastrado);
  const contido = (x: Set<string>, y: Set<string>) => [...x].every((t) => y.has(t));
  return a.size > 0 && b.size > 0 && (contido(a, b) || contido(b, a));
}

/** `re.sub(r"\D", "", texto)`: o `\d` do Python é qualquer dígito decimal Unicode. */
function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\P{Nd}/gu, "");
}

// ─── O snapshot, como o banco o guarda ──────────────────────────────────────

/** `FonteFinanceiro.model_dump(mode="json")` */
export type FontePy = {
  id: string;
  tipo: TipoFonteFinanceiro;
  nome_arquivo: string;
  banco: string | null;
  avisos: string[];
  tem_original: boolean;
};

/** `LinhaFinanceiroResponse.model_dump(mode="json")`: valor com sinal (+ entrada, − saída) e 2 casas. */
export type LinhaPy = {
  id: string;
  ordem: number | null;
  ordem_fonte: string | null;
  fonte_id: string;
  tipo_fonte: TipoFonteFinanceiro;
  sentido: Sentido;
  data: string;
  valor: string;
  historico: string;
  favorecido: string | null;
  documento: string | null;
  documento_favorecido: string | null;
  categoria: string | null;
  parcela: string | null;
  banco: string | null;
  referencia: string;
  observacao: string | null;
};

/** O snapshot da análise. `titulos_abertos` só aparece depois do primeiro documento, como no original. */
export type SnapshotFinanceiroPy = {
  fontes: FontePy[];
  linhas: LinhaPy[];
  titulos_abertos?: LinhaPy[];
  avisos: string[];
};

type CamposDaLinha = {
  data: string;
  valor: Dec;
  historico: string;
  referencia: string;
  id?: string;
  ordem?: number | null;
  ordem_fonte?: string | null;
  favorecido?: string | null;
  documento?: string | null;
  documento_favorecido?: string | null;
  categoria?: string | null;
  parcela?: string | null;
  banco?: string | null;
  observacao?: string | null;
};

/**
 * `_linha`: o valor conferido (`_valor`), diferente de zero, e a linha com o id recebido ou um novo
 * (o id novo é gerado depois das duas conferências, como o `id or uuid4()` do original).
 */
export function linhaDoSnapshot(
  fonteId: string,
  tipo: TipoFonteFinanceiro,
  c: CamposDaLinha,
  novoId: () => string,
  limites: LimitesDoFinanceiro = LIMITES_DO_FINANCEIRO,
): LinhaPy {
  const valor = valorDaConferencia(c.valor, limites);
  if (ehZero(valor)) throw new Recusa(invalido("Um movimento de conferência deve ter valor diferente de zero."));
  return {
    id: c.id ?? novoId(),
    ordem: c.ordem ?? null,
    ordem_fonte: c.ordem_fonte ?? null,
    fonte_id: fonteId,
    tipo_fonte: tipo,
    sentido: valor.negativo ? "SAIDA" : "ENTRADA",
    data: c.data,
    valor: texto(valor),
    historico: c.historico,
    favorecido: c.favorecido ?? null,
    documento: c.documento ?? null,
    documento_favorecido: c.documento_favorecido ?? null,
    categoria: c.categoria ?? null,
    parcela: c.parcela ?? null,
    banco: c.banco ?? null,
    referencia: c.referencia,
    observacao: c.observacao ?? null,
  };
}

/** `_limites`: linhas (inclusive os títulos em aberto) e documentos (inclusive o extrato) acumulados. */
export function conferirLimites(linhas: number, fontes: number, limites: LimitesDoFinanceiro = LIMITES_DO_FINANCEIRO): RecusaFinanceiro | null {
  if (linhas > limites.maxLinhas || fontes > limites.maxFontes) {
    return invalido("A análise excede o limite de linhas ou documentos. Divida a conferência em períodos menores.");
  }
  return null;
}

/**
 * O tamanho em bytes do `json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))`: o
 * `JSON.stringify` escapa os mesmos caracteres (aspas, barra e controles) com as mesmas formas, e a
 * ordem das chaves não muda o tamanho.
 */
export function bytesDoSnapshot(snapshot: SnapshotFinanceiroPy): number {
  return Buffer.byteLength(JSON.stringify(snapshot), "utf8");
}

/** `_validar_snapshot`: o orçamento dos originais comprimidos não limita a expansão de texto. */
export function conferirSnapshot(snapshot: SnapshotFinanceiroPy, limites: LimitesDoFinanceiro = LIMITES_DO_FINANCEIRO): RecusaFinanceiro | null {
  if (bytesDoSnapshot(snapshot) > limites.maxSnapshotBytes) {
    return invalido("Os dados extraídos excedem o limite desta análise. Divida os documentos ou o período, sem truncar informações.");
  }
  return null;
}

// ─── Extrato: identidade e criação ──────────────────────────────────────────

/** O UUID como o Python o ordena (pelo inteiro): os 32 dígitos hexadecimais em minúsculas. */
function porUuid(a: string, b: string): number {
  const x = a.toLowerCase().replace(/-/g, "");
  const y = b.toLowerCase().replace(/-/g, "");
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Um item de `_identidade_extrato`. */
export type IdentidadeTransacaoPy = {
  id: string;
  data: string;
  valor: string;
  dc: string;
  historico: string;
  ordem: number | null;
  saldo: string | null;
  /** `str(t.importacao_id)`: "None" quando a transação não tem lote, como no original. */
  importacao: string;
};

/**
 * `_identidade_extrato`: o documento bancário em ordem de id, sem status de classificação nem
 * timestamps do NEO (que mudam sem mudar o extrato).
 */
export function identidadeDoExtrato(transacoes: readonly TransacaoDaRevisao[], limites: LimitesDoFinanceiro = LIMITES_DO_FINANCEIRO): string {
  const itens: IdentidadeTransacaoPy[] = [...transacoes]
    .sort((a, b) => porUuid(a.id, b.id))
    .map((t) => ({
      id: t.id,
      data: t.data,
      valor: texto(valorDaConferencia(t.valor, limites)),
      dc: t.dc,
      historico: t.historico,
      ordem: t.ordem,
      saldo: t.saldoApos !== null ? texto(valorDaConferencia(t.saldoApos, limites)) : null,
      importacao: t.importacaoId ?? "None",
    }));
  return hashJson(itens as unknown as JsonPy);
}

/**
 * `criar` depois das leituras: o limite, a fonte EXTRATO (sem original), uma linha por transação (o
 * id da linha é o da transação), o aviso de período sem extrato, a identidade do extrato e o tamanho.
 * `transacoes` já vem em `ordemComoOExtrato`.
 */
export function criacaoDaAnalise(e: {
  bancoSigla: string;
  transacoes: readonly TransacaoDaRevisao[];
  novoId: () => string;
  limites?: LimitesDoFinanceiro;
}): ResultadoFinanceiro<{ snapshot: SnapshotFinanceiroPy; extratoHash: string }> {
  const limites = e.limites ?? LIMITES_DO_FINANCEIRO;
  return capturar(() => {
    const tamanho = conferirLimites(e.transacoes.length, 1, limites);
    if (tamanho) throw new Recusa(tamanho);
    const fonte: FontePy = { id: e.novoId(), tipo: "EXTRATO", nome_arquivo: "Extrato já importado", banco: e.bancoSigla, avisos: [], tem_original: false };
    const linhas = e.transacoes.map((t) =>
      linhaDoSnapshot(
        fonte.id,
        "EXTRATO",
        {
          id: t.id,
          data: t.data,
          // `t.valor * (1 if t.dc == "C" else -1)`
          valor: t.dc === "C" ? t.valor : { ...t.valor, negativo: !t.valor.negativo },
          historico: t.historico,
          referencia: `Transação ${t.id}`,
          banco: e.bancoSigla,
          ordem: t.ordem,
          ordem_fonte: t.importacaoId ? t.importacaoId : null,
        },
        e.novoId,
        limites,
      ),
    );
    const avisos = e.transacoes.length === 0 ? [AVISO_SEM_EXTRATO] : [];
    const extratoHash = identidadeDoExtrato(e.transacoes, limites);
    const snapshot: SnapshotFinanceiroPy = { fontes: [fonte], linhas, avisos };
    const grande = conferirSnapshot(snapshot, limites);
    if (grande) throw new Recusa(grande);
    return { snapshot, extratoHash };
  });
}

// ─── Documentos ─────────────────────────────────────────────────────────────

export const TIPOS_DE_DOCUMENTO: readonly TipoDocumentoFinanceiro[] = ["FINANCEIRO", "SISPAG", "RAZAO", "EXTRATO_DETALHADO"];

/**
 * As conferências de `adicionar_documento` antes de ler o arquivo, depois de `validar_conteudo`: o
 * mesmo arquivo já na análise e o orçamento dos originais (`tamanhoAtual` é a soma dos já guardados).
 */
export function conferirOriginal(e: {
  jaExiste: boolean;
  tamanhoAtual: number;
  tamanho: number;
  limites?: LimitesDoFinanceiro;
}): RecusaFinanceiro | null {
  if (e.jaExiste) return conflito(ARQUIVO_REPETIDO);
  if (e.tamanhoAtual + e.tamanho > (e.limites ?? LIMITES_DO_FINANCEIRO).maxDocumentosBytes) {
    return invalido("Os originais excedem o limite de armazenamento desta análise.");
  }
  return null;
}

/**
 * O que o original confere antes de chamar o leitor: o SISPAG e o extrato detalhado lidos são do
 * Itaú (números de conta coincidentes não provam o banco), e o tipo é um dos quatro.
 */
export function antesDaLeitura(tipo: string, bancoSigla: string): RecusaFinanceiro | null {
  if (tipo === "SISPAG" && !bancoCompativel("ITAU", bancoSigla)) {
    return invalido("A consulta SISPAG é do Itaú. Selecione uma conta desse banco.");
  }
  if (tipo === "EXTRATO_DETALHADO" && !bancoCompativel("ITAU", bancoSigla)) {
    return invalido("O extrato detalhado lido é do Itaú. Selecione uma conta desse banco.");
  }
  if (!(TIPOS_DE_DOCUMENTO as readonly string[]).includes(tipo)) return invalido("Tipo de documento não suportado.");
  return null;
}

/** O que o leitor do tipo devolveu. */
export type LeituraDoDocumento =
  | { tipo: "FINANCEIRO"; documento: DocumentoFinanceiro }
  | { tipo: "SISPAG"; sispag: ConsultaSispag }
  | { tipo: "RAZAO"; razao: RazaoConta }
  | { tipo: "EXTRATO_DETALHADO"; extrato: Pick<ExtratoDetalhado, "agencia" | "conta" | "diasConferidos" | "movimentos"> };

/** A conta bancária da análise, como as conferências dos documentos a usam (`AgenciaBancaria`). */
export type AgenciaDoFinanceiro = {
  bancoSigla: string;
  agencia: string;
  numero: string;
  digito: string | null;
  /** A `descricao` do original ("ITAU 1234 56789 0"). */
  descricao: string;
  temContaContabil: boolean;
};

/** `confirmar_empresa`: CNPJ divergente é recusado mesmo com confirmação; sem CNPJ, a pessoa confirma. */
export function confirmarEmpresa(cnpj: string | null, empresa: { cnpj: string; razaoSocial: string }, confirmar: boolean): RecusaFinanceiro | null {
  if (cnpj && soDigitos(cnpj) !== soDigitos(empresa.cnpj)) return invalido("O documento enviado pertence a outra empresa.");
  if (!cnpj && !confirmar) {
    return invalido(`O arquivo não informa CNPJ do emissor. Confirme que pertence a ${empresa.razaoSocial}.`, "CONFIRMAR_EMPRESA");
  }
  return null;
}

/** `_conferir_sispag` (`service.py`): a consulta é desta empresa e desta conta. */
function conferirSispag(sispag: ConsultaSispag, empresaCnpj: string, agencia: AgenciaDoFinanceiro): RecusaFinanceiro | null {
  if (sispag.cnpj && soDigitos(empresaCnpj) !== sispag.cnpj) return invalido(`A consulta do SISPAG é de outra empresa (CNPJ ${sispag.cnpj}).`);
  const conta = soDigitos(sispag.conta);
  const esperado = soDigitos(agencia.agencia) + soDigitos(agencia.numero);
  if (conta && esperado && !conta.startsWith(esperado)) {
    return invalido(`A consulta do SISPAG é da conta ${sispag.conta}, e a conciliação é de ${agencia.descricao}. Envie o SISPAG desta conta.`);
  }
  return null;
}

const CAMPOS_FORA_DA_IDENTIDADE = new Set(["id", "fonte_id", "referencia", "ordem", "ordem_fonte"]);

/** A identidade de uma linha do financeiro entre arquivos: a linha sem ids, referência e ordem. */
export function identidadeDaLinhaFinanceiro(linha: LinhaPy): string {
  const campos: { [k: string]: JsonPy } = {};
  for (const [k, v] of Object.entries(linha)) if (!CAMPOS_FORA_DA_IDENTIDADE.has(k)) campos[k] = v as JsonPy;
  return hashJson(campos);
}

const comprimento = (s: string) => [...s].length;

/**
 * `adicionar_documento` depois da leitura: as conferências do tipo (banco, empresa, conta), as linhas
 * (cada uma por `_linha`), a empresa, "sem movimentos", os limites, os avisos (repetição entre
 * arquivos do financeiro, fora do período, sem CNPJ), a fonte e o tamanho do snapshot, nessa ordem.
 * Devolve o snapshot novo (o recebido não é alterado) e o que vai para a auditoria.
 */
export function incorporarDocumento(e: {
  analise: { periodoInicio: string; periodoFim: string; snapshot: SnapshotFinanceiroPy };
  leitura: LeituraDoDocumento;
  /** O nome já limpo (`nomeDoArquivo`). */
  nome: string;
  agencia: AgenciaDoFinanceiro;
  /** A conta contábil vinculada à conta bancária, lida desta empresa (só para o Razão; `null` se não achada). */
  contaContabil: { codigo: string; contaNumero: number | null } | null;
  empresa: { cnpj: string; razaoSocial: string };
  confirmarEmpresa: boolean;
  fonteId: string;
  novoId: () => string;
  limites?: LimitesDoFinanceiro;
}): ResultadoFinanceiro<{ snapshot: SnapshotFinanceiroPy; linhas: number }> {
  const limites = e.limites ?? LIMITES_DO_FINANCEIRO;
  const { leitura, agencia, fonteId } = e;
  const tipo = leitura.tipo;
  const linha = (c: CamposDaLinha) => linhaDoSnapshot(fonteId, tipo, c, e.novoId, limites);
  return capturar(() => {
    let banco: string | null = null;
    let avisos: string[] = [];
    let cnpj: string | null = null;
    let linhas: LinhaPy[] = [];
    let titulos: LinhaPy[] = [];
    if (leitura.tipo === "FINANCEIRO") {
      const d = leitura.documento;
      banco = d.banco;
      avisos = [...d.avisos];
      cnpj = d.cnpj;
      if (banco && !bancoCompativel(banco, agencia.bancoSigla)) {
        throw new Recusa(invalido(`O relatório declara o banco ${banco}, diferente da conta selecionada. Abra uma análise da conta correta.`));
      }
      const campos = (l: LinhaFinanceiro): CamposDaLinha => ({
        data: l.data,
        valor: l.valor,
        historico: l.historico,
        referencia: l.referencia,
        favorecido: l.favorecido,
        documento: l.documento,
        documento_favorecido: l.documentoFavorecido,
        categoria: l.categoria,
        banco: l.banco,
        observacao: l.observacao,
      });
      linhas = d.linhas.map((l, i) => linha({ ...campos(l), parcela: l.parcela, ordem: i, ordem_fonte: fonteId }));
      // Os títulos em aberto não levam parcela nem ordem (como no original).
      titulos = d.titulosAbertos.map((t) => linha(campos(t)));
      if (!banco) {
        avisos.push("Banco não informado no arquivo; seus movimentos não foram atribuídos à conta selecionada. A relação será confirmada manualmente.");
      }
    } else if (leitura.tipo === "SISPAG") {
      // Este leitor reconhece a consulta de pagamentos do Itaú, não um relatório universal.
      const s = leitura.sispag;
      cnpj = s.cnpj;
      banco = agencia.bancoSigla;
      const recusa = conferirSispag(s, e.empresa.cnpj, agencia);
      if (recusa) throw new Recusa(recusa);
      if (s.pagamentos.some((p) => p.efetuado && compara(p.valor, ZERO) <= 0)) {
        throw new Recusa(invalido("O valor normalizado de um pagamento efetuado deve ser positivo."));
      }
      s.pagamentos.forEach((p, i) => {
        if (!p.efetuado) return;
        linhas.push(
          linha({
            data: p.data,
            valor: { ...p.valor, negativo: !p.valor.negativo },
            historico: p.tipo,
            favorecido: p.favorecido,
            documento_favorecido: p.documento,
            referencia: `Pagamento efetuado ${i + 1}`,
            ordem: i,
            ordem_fonte: fonteId,
            banco,
          }),
        );
      });
      if (!s.conta) avisos.push("SISPAG sem identificação de conta: confira a origem antes de registrar.");
      avisos.push("Somente pagamentos com status efetuado entram na comparação; nenhuma classificação é executada.");
    } else if (leitura.tipo === "RAZAO") {
      const r = leitura.razao;
      cnpj = r.cnpj;
      if (agencia.temContaContabil) {
        const conta = e.contaContabil;
        if (!conta || !(conta.codigo === r.contaClassificacao || String(conta.contaNumero ?? "None") === r.contaCodigo)) {
          throw new Recusa(invalido("O razão não corresponde à conta contábil vinculada ao banco."));
        }
      } else {
        avisos.push("O banco não tem conta contábil vinculada. Confira que o razão é da conta banco selecionada.");
      }
      banco = agencia.bancoSigla;
      r.lancamentos.forEach((l, i) => {
        if (ehZero(l.valor)) return;
        linhas.push(
          linha({
            data: l.data,
            valor: l.valor,
            historico: l.historico,
            referencia: `Lançamento ${i + 1} · lote ${l.lote}`,
            categoria: r.contaDescricao,
            banco,
            observacao: `Conta ${r.contaCodigo} · ${r.contaClassificacao} · contrapartida ${l.contrapartida}`,
          }),
        );
      });
    } else {
      const x = leitura.extrato;
      banco = agencia.bancoSigla;
      const digitos = (t: string | null) => soDigitos(t).replace(/^0+/, "");
      if (x.agencia && x.conta) {
        // O extrato imprime "0012287-0"; o cadastro pode ter o dígito à parte ou não ter.
        const conta = digitos(x.conta);
        const numero = digitos(agencia.numero);
        const mesmaConta = agencia.digito
          ? conta === numero + soDigitos(agencia.digito)
          : conta.startsWith(numero) && comprimento(conta) - comprimento(numero) <= 1;
        if (digitos(x.agencia) !== digitos(agencia.agencia) || !mesmaConta) {
          throw new Recusa(invalido(`O extrato detalhado é da agência ${x.agencia} conta ${x.conta}, e a análise é de ${agencia.descricao}.`));
        }
      } else {
        avisos.push("Extrato sem agência/conta declaradas: confira a origem antes de registrar.");
      }
      linhas = x.movimentos.map((m, i) =>
        linha({
          data: m.data,
          valor: m.valor,
          historico: m.lancamento,
          favorecido: m.razaoSocial || null,
          documento_favorecido: m.documento || null,
          referencia: `Linha ${m.linha} do extrato detalhado`,
          observacao: m.resgateAplicacao ? "Resgate da aplicação automática" : null,
          ordem: i,
          ordem_fonte: fonteId,
          banco,
        }),
      );
      avisos.push(`${linhas.length} movimentos lidos; saldos de ${x.diasConferidos} dia(s) conferidos, incluindo a aplicação automática.`);
    }

    const empresa = confirmarEmpresa(cnpj, e.empresa, e.confirmarEmpresa);
    if (empresa) throw new Recusa(empresa);
    if (linhas.length === 0 && titulos.length === 0) throw new Recusa(invalido("Não há movimentos válidos para comparação neste documento."));
    const atual = e.analise.snapshot;
    const snapshot: SnapshotFinanceiroPy = structuredClone(atual);
    const tamanho = conferirLimites(
      snapshot.linhas.length + linhas.length + (snapshot.titulos_abertos ?? []).length + titulos.length,
      snapshot.fontes.length + 1,
      limites,
    );
    if (tamanho) throw new Recusa(tamanho);
    if (tipo === "FINANCEIRO") {
      const existentes = new Set(snapshot.linhas.filter((l) => l.tipo_fonte === "FINANCEIRO").map(identidadeDaLinhaFinanceiro));
      if (linhas.some((l) => existentes.has(identidadeDaLinhaFinanceiro(l)))) {
        avisos.push(
          "Há movimentos com os mesmos dados em outro arquivo do financeiro desta análise. Foram preservados; confira se são repetições antes de compor valores.",
        );
      }
    }
    if (linhas.some((l) => l.data < e.analise.periodoInicio || l.data > e.analise.periodoFim)) {
      avisos.push("Há movimentos fora do período da análise. Confira a data e explique relações entre períodos distintos.");
    }
    if (!cnpj) avisos.push("CNPJ do emissor ausente; empresa confirmada explicitamente pelo usuário.");
    snapshot.fontes.push({ id: fonteId, tipo, nome_arquivo: e.nome, banco, avisos, tem_original: true });
    snapshot.linhas.push(...linhas);
    snapshot.titulos_abertos = [...(snapshot.titulos_abertos ?? []), ...titulos];
    const grande = conferirSnapshot(snapshot, limites);
    if (grande) throw new Recusa(grande);
    return { snapshot, linhas: linhas.length };
  });
}

// ─── Vínculos ───────────────────────────────────────────────────────────────

/** Tipo de comparação → (documento base à esquerda, origem à direita): `PARES` de `sugestoes_financeiro.py`. */
export const PARES: Record<TipoComparacao, readonly [TipoFonteFinanceiro, TipoFonteFinanceiro]> = {
  EXTRATO: ["FINANCEIRO", "EXTRATO"],
  SISPAG: ["FINANCEIRO", "SISPAG"],
  RAZAO: ["FINANCEIRO", "RAZAO"],
  RAZAO_SISPAG: ["RAZAO", "SISPAG"],
  RAZAO_DETALHADO: ["RAZAO", "EXTRATO_DETALHADO"],
};

/** `TIPO_POR_PAR` */
export function tipoDoPar(base: string, origem: string): TipoComparacao | null {
  for (const [tipo, [b, o]] of Object.entries(PARES) as [TipoComparacao, readonly [string, string]][]) {
    if (b === base && o === origem) return tipo;
  }
  return null;
}

export const TIPOS_DE_COMPARACAO = Object.keys(PARES) as TipoComparacao[];

/** Um vínculo já gravado, no que a validação de um novo e as sugestões precisam (chaves do original). */
export type VinculoGravadoPy = { estado: string; tipo_comparacao: string; financeiro_ids: readonly string[]; comparacao_ids: readonly string[] };

/** O que a validação usa do envelope de `sugerir`: a versão e, de cada sugestão, o id, os lados e o critério. */
export type SugestoesPy = {
  versao: number;
  items: readonly { id: string; financeiro_ids: readonly string[]; comparacao_ids: readonly string[]; criterio: string }[];
};

export const EXTRATO_MUDOU_SUGESTOES = "O extrato mudou. Crie uma análise com os movimentos atuais.";

/** `sugestoes` antes de `sugerir`: com o Extrato, só enquanto ele é o da criação. */
export function conferirSugestoes(tipo: TipoComparacao, extratoValido: boolean): RecusaFinanceiro | null {
  return tipo === "EXTRATO" && !extratoValido ? conflito(EXTRATO_MUDOU_SUGESTOES, "EXTRATO_ALTERADO") : null;
}

export type VinculoValidado = {
  tipo: TipoComparacao;
  financeiroIds: string[];
  comparacaoIds: string[];
  totalFinanceiro: Dec;
  totalComparacao: Dec;
  /** Comparação − base. */
  diferenca: Dec;
  criterio: string | null;
};

const mesmoConjunto = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((i) => y.has(i));
};

/**
 * `_validar_vinculo`: todas as regras de uma conferência, sem gravar nada, na ordem do original. Os
 * ids já vêm canônicos (`entradasFinanceiro.ts`). `sugestoesDoTipo` é chamada no máximo uma vez por
 * tipo (o lote guarda num cache) e devolve o envelope de `sugerir` ou a recusa de `conferirSugestoes`.
 */
export function validarVinculo(e: {
  snapshot: SnapshotFinanceiroPy;
  periodoInicio: string;
  periodoFim: string;
  extratoValido: boolean;
  vinculos: readonly VinculoGravadoPy[];
  financeiroIds: readonly string[];
  comparacaoIds: readonly string[];
  observacao: string;
  sugestaoId: string | null;
  versao: number;
  sugestoesDoTipo: (tipo: TipoComparacao) => ResultadoFinanceiro<SugestoesPy>;
  limites?: LimitesDoFinanceiro;
}): ResultadoFinanceiro<VinculoValidado> {
  const limites = e.limites ?? LIMITES_DO_FINANCEIRO;
  const idsF = [...e.financeiroIds];
  const idsC = [...e.comparacaoIds];
  return capturar(() => {
    if (new Set(idsF).size !== idsF.length || new Set(idsC).size !== idsC.length) {
      throw new Recusa(invalido("Selecione cada movimento uma única vez."));
    }
    const linhas = new Map(e.snapshot.linhas.map((l) => [l.id, l]));
    if ([...idsF, ...idsC].some((i) => !linhas.has(i))) throw new Recusa(invalido("Há movimentos que não pertencem à análise."));
    const bases = new Set(idsF.map((i) => linhas.get(i)!.tipo_fonte));
    if (bases.size !== 1 || ![...bases].every((b) => b === "FINANCEIRO" || b === "RAZAO")) {
      throw new Recusa(invalido("O painel base aceita linhas de um único documento: financeiro ou razão da conta banco."));
    }
    const origens = new Set(idsC.map((i) => linhas.get(i)!.tipo_fonte));
    const tipo = origens.size === 1 ? tipoDoPar([...bases][0], [...origens][0]) : null;
    if (tipo === null) {
      throw new Recusa(
        invalido("Compare o financeiro com uma única origem (extrato, SISPAG ou razão), ou o razão com o SISPAG ou com o extrato detalhado."),
      );
    }
    let criterio: string | null = null;
    if (e.sugestaoId) {
      const sugestoes = e.sugestoesDoTipo(tipo);
      if (!sugestoes.ok) throw new Recusa(sugestoes);
      const sugestao = sugestoes.valor.items.find(
        (s) => s.id === e.sugestaoId && mesmoConjunto(s.financeiro_ids, idsF) && mesmoConjunto(s.comparacao_ids, idsC),
      );
      if (!sugestao || sugestoes.valor.versao !== e.versao) throw new Recusa(conflito("A sugestão mudou. Atualize a análise."));
      criterio = sugestao.criterio;
    }
    if (tipo === "EXTRATO" && !e.extratoValido) {
      throw new Recusa(conflito("O extrato mudou. Crie uma nova análise para confirmar relações com os movimentos atuais.", "EXTRATO_ALTERADO"));
    }
    const valores = new Map<string, Dec>();
    for (const i of [...idsF, ...idsC]) valores.set(i, valorDaConferencia(dec(linhas.get(i)!.valor), limites));
    const sinais = new Set([...valores.values()].map((v) => compara(v, ZERO) > 0));
    if ([...valores.values()].some(ehZero) || sinais.size !== 1) {
      throw new Recusa(invalido("Compare somente entradas com entradas ou saídas com saídas, sem misturar naturezas."));
    }
    for (const v of e.vinculos) {
      if (v.estado === "ATIVO" && v.tipo_comparacao === tipo && (idsF.some((i) => v.financeiro_ids.includes(i)) || idsC.some((i) => v.comparacao_ids.includes(i)))) {
        throw new Recusa(conflito("Um movimento já foi vinculado nesta comparação. Desfaça a conferência anterior para reutilizá-lo."));
      }
    }
    const totalFinanceiro = valorDaConferencia(somaTodos(idsF.map((i) => modulo(valores.get(i)!))), limites);
    const totalComparacao = valorDaConferencia(somaTodos(idsC.map((i) => modulo(valores.get(i)!))), limites);
    const diferenca = subtrai(totalComparacao, totalFinanceiro);
    if (!ehZero(diferenca) && !e.observacao) throw new Recusa(invalido("Justifique a diferença antes de registrar a conferência."));
    const todas = [...idsF, ...idsC].map((i) => linhas.get(i)!);
    if (new Set(todas.map((l) => l.data)).size > 1 && !e.observacao) {
      throw new Recusa(invalido("Explique a relação entre movimentos de datas diferentes."));
    }
    if (todas.some((l) => l.data < e.periodoInicio || l.data > e.periodoFim) && !e.observacao) {
      throw new Recusa(invalido("Explique a relação com movimentos fora do período desta análise."));
    }
    return { tipo, financeiroIds: idsF, comparacaoIds: idsC, totalFinanceiro, totalComparacao, diferenca, criterio };
  });
}

/** Uma sugestão marcada no lote, com os ids já canônicos. */
export type SugestaoMarcada = { sugestaoId: string; financeiroIds: readonly string[]; comparacaoIds: readonly string[] };

/**
 * `vincular_sugestoes` antes de gravar: cada sugestão passa por `validarVinculo` contra a MESMA versão
 * (o id da sugestão inclui a versão), com as sugestões de cada tipo calculadas uma vez só, e duas
 * sugestões do lote não podem dividir um movimento no mesmo tipo de comparação. Tudo ou nada.
 */
export function validarLote(e: Omit<Parameters<typeof validarVinculo>[0], "financeiroIds" | "comparacaoIds" | "sugestaoId"> & {
  sugestoes: readonly SugestaoMarcada[];
}): ResultadoFinanceiro<{ sugestaoId: string; validado: VinculoValidado }[]> {
  const cache = new Map<TipoComparacao, ResultadoFinanceiro<SugestoesPy>>();
  const doTipo = (tipo: TipoComparacao) => {
    if (!cache.has(tipo)) cache.set(tipo, e.sugestoesDoTipo(tipo));
    return cache.get(tipo)!;
  };
  const usados = new Set<string>();
  const validados: { sugestaoId: string; validado: VinculoValidado }[] = [];
  for (const item of e.sugestoes) {
    const v = validarVinculo({ ...e, financeiroIds: item.financeiroIds, comparacaoIds: item.comparacaoIds, sugestaoId: item.sugestaoId, sugestoesDoTipo: doTipo });
    if (!v.ok) return v;
    const chaves = [...v.valor.financeiroIds, ...v.valor.comparacaoIds].map((i) => `${v.valor.tipo}\u0001${i}`);
    if (chaves.some((c) => usados.has(c))) return invalido("Duas sugestões marcadas usam o mesmo movimento. Confirme somente uma delas.");
    for (const c of chaves) usados.add(c);
    validados.push({ sugestaoId: item.sugestaoId, validado: v.valor });
  }
  return { ok: true, valor: validados };
}

/** Os dados da auditoria de um vínculo criado (`financeiro.vinculo_criado`). */
export function dadosDoVinculoCriado(vinculoId: string, v: VinculoValidado, sugestaoId: string | null): Record<string, unknown> {
  return { vinculo_id: vinculoId, tipo: v.tipo, diferenca: texto(v.diferenca), sugestao_id: sugestaoId, criterio: v.criterio };
}

/** `desfazer`: o vínculo existe nesta análise e ainda está ativo. Vale mesmo com o extrato alterado. */
export function conferirDesfazer(vinculo: { estado: string } | null): RecusaFinanceiro | null {
  if (!vinculo) return { ok: false, erro: "Conferência não encontrada nesta análise.", codigo: "NAO_ENCONTRADA" };
  if (vinculo.estado !== "ATIVO") return conflito("Esta conferência já foi desfeita.");
  return null;
}

// ─── Snapshot e vínculos para a tela ────────────────────────────────────────

export function fonteParaTela(f: FontePy): FonteFinanceiro {
  return { id: f.id, tipo: f.tipo, nomeArquivo: f.nome_arquivo, banco: f.banco, avisos: [...f.avisos], temOriginal: f.tem_original };
}

export function linhaParaTela(l: LinhaPy): LinhaFinanceiroJson {
  return {
    id: l.id,
    ordem: l.ordem,
    ordemFonte: l.ordem_fonte,
    fonteId: l.fonte_id,
    tipoFonte: l.tipo_fonte,
    sentido: l.sentido,
    data: l.data,
    valor: l.valor,
    historico: l.historico,
    favorecido: l.favorecido,
    documento: l.documento,
    documentoFavorecido: l.documento_favorecido,
    categoria: l.categoria,
    parcela: l.parcela,
    banco: l.banco,
    referencia: l.referencia,
    observacao: l.observacao,
  };
}

/**
 * `obter`: o resumo, as fontes, as linhas e os títulos em aberto do snapshot, os vínculos e os avisos.
 * Com o extrato alterado, um aviso a mais (e só as conferências com o Extrato ficam bloqueadas).
 */
export function analiseParaTela(
  resumo: ResumoAnaliseFinanceiro,
  snapshot: SnapshotFinanceiroPy,
  vinculos: readonly VinculoFinanceiro[],
  extratoValido: boolean,
): AnaliseFinanceiro {
  const avisos = [...snapshot.avisos];
  if (!extratoValido) avisos.push(AVISO_EXTRATO_ALTERADO);
  return {
    ...resumo,
    fontes: snapshot.fontes.map(fonteParaTela),
    linhas: snapshot.linhas.map(linhaParaTela),
    titulosAbertos: (snapshot.titulos_abertos ?? []).map(linhaParaTela),
    vinculos: [...vinculos],
    avisos,
    extratoValido,
  };
}

const paraCamel = (k: string) => k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());

function chavesEmCamel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(chavesEmCamel);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [paraCamel(k), chavesEmCamel(x)]));
  return v;
}

/** O envelope de `sugerir` (`{ versao, tipo_comparacao, items, avisos }`) como a tela o recebe (camelCase). */
export function sugestoesParaTela(envelope: unknown): SugestoesFinanceiro {
  const c = chavesEmCamel(envelope) as { versao: number; tipoComparacao: TipoComparacao; items?: SugestaoFinanceiro[]; itens?: SugestaoFinanceiro[]; avisos?: string[] };
  return { versao: c.versao, tipoComparacao: c.tipoComparacao, itens: c.items ?? c.itens ?? [], avisos: c.avisos ?? [] };
}

/** O envelope de `sugerir` no que a validação usa, aceitando as chaves do original ou em camelCase. */
export function sugestoesParaValidar(envelope: unknown): SugestoesPy {
  const c = chavesEmCamel(envelope) as {
    versao: number;
    items?: { id: string; financeiroIds: string[]; comparacaoIds: string[]; criterio: string }[];
    itens?: { id: string; financeiroIds: string[]; comparacaoIds: string[]; criterio: string }[];
  };
  return {
    versao: c.versao,
    items: (c.items ?? c.itens ?? []).map((s) => ({ id: s.id, financeiro_ids: s.financeiroIds, comparacao_ids: s.comparacaoIds, criterio: s.criterio })),
  };
}
