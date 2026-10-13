// Emissão de NFS-e pelo Connect, com o Omie por baixo (Fase 2 do plano de
// 23/09/2026 — o Kauan decidiu seguir com ele em 13/10/2026; emissor próprio
// fora do Omie ficou para os sócios avaliarem).
//
// Funções puras: montar o que vai ao Omie e ler o que volta. Quem chama o Omie
// e grava é ./emissaoServidor.ts.
//
// ── De onde vieram os nomes ─────────────────────────────────────────────────
//
// Da documentação pública do Omie — a página de cada módulo em
// app.omie.com.br/api/v1/{módulo}/ (aberta sem chave), conferida em 13/10/2026 —
// e **não** de resposta real:
//
//   servicos/os       IncluirOS → { cCodIntOS, nCodOS, cNumOS, cCodStatus, cDescStatus }
//                     StatusOS  → { cFaturada, cCancelada, cAmbiente, dDtFat, cHrFat,
//                                   ListaRpsNfse: [{ cStatusRps, cStatusLote, nNfse,
//                                   cCodVerif, cCNPJ, cUrlNfse, mensagens: [...] }] }
//                     ListarOS (só na prévia)
//   servicos/osp      FaturarOS, CancelarOS (com `cCancelarNfse`: "S" cancela a
//                     NFS-e na prefeitura — o padrão do Omie também é "S")
//   geral/clientes    ListarClientes → clientes_cadastro[]
//   servicos/servico  ListarCadastroServico → cadastros[] (no máximo 50 por página)
//
// A regra do projeto é que adaptador só vai para produção depois de ver a
// resposta de verdade. Por isso tudo aqui lê de forma defensiva — campo ausente
// vira nulo, lista com outro nome vira lista vazia, status desconhecido fica
// "processando" com o código na mensagem — e a mensagem do Omie vai para a
// tela como veio. A prévia (scripts/omie-previa-emissao.ts) mostra a forma
// real antes da primeira nota.

import { saoPauloParts } from "@/lib/agenda";
import { chaveDeDeduplicacao } from "@/lib/fiscal/documentos";
import { formatCnpj, formatCpf } from "@/lib/format";
import { ErroDoOmie, type EmpresaDaConta } from "./cliente";
import { instanteDoOmie } from "./notas";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v: unknown): string => texto(v).replace(/\D/g, "");
/** Objeto, ou o primeiro objeto de uma lista: a documentação chama alguns blocos de "array" e mostra objeto. */
const umObjeto = (v: unknown): Obj => (Array.isArray(v) ? obj(v.find((x) => x && typeof x === "object")) : obj(v));
/** Código do Omie (inteiro, às vezes grande) como texto. Zero e vazio não são código. */
function codigo(v: unknown): string | null {
  const t = texto(v);
  return /^\d{1,20}$/.test(t) && !/^0+$/.test(t) ? t : null;
}
function numeroOuNulo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
function simNao(v: unknown): boolean | null {
  const t = texto(v).toUpperCase();
  return t === "S" ? true : t === "N" ? false : null;
}
function totalDePaginas(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

// ─── Listas para a tela ─────────────────────────────────────────────────────

export type ClienteDoOmie = {
  /** `codigo_cliente_omie` — o que vai no `nCodCli` da OS. */
  codigo: string;
  nome: string;
  /** CNPJ ou CPF, só dígitos. */
  documento: string | null;
  cidade: string | null;
};

/** Uma página de `ListarClientes`. Cliente inativo no Omie não entra na lista. */
export function clientesDaPagina(corpo: unknown): { clientes: ClienteDoOmie[]; totalDePaginas: number } {
  const o = obj(corpo);
  const lista = Array.isArray(o.clientes_cadastro) ? o.clientes_cadastro : [];
  const clientes: ClienteDoOmie[] = [];
  for (const item of lista) {
    const c = obj(item);
    const cod = codigo(c.codigo_cliente_omie);
    const nome = texto(c.razao_social) || texto(c.nome_fantasia);
    if (!cod || !nome || simNao(c.inativo) === true) continue;
    const doc = digitos(c.cnpj_cpf);
    const cidade = [texto(c.cidade), texto(c.estado)].filter(Boolean).join(" / ");
    clientes.push({ codigo: cod, nome: nome.slice(0, 180), documento: doc.length === 11 || doc.length === 14 ? doc : null, cidade: cidade || null });
  }
  return { clientes, totalDePaginas: totalDePaginas(o.total_de_paginas) };
}

export type ServicoDoOmie = {
  /** `nCodServ` — o que vai no `nCodServico` da OS. */
  codigo: string;
  /** O código que a empresa deu ao serviço no Omie (`cCodigo`). */
  codigoInterno: string | null;
  descricao: string;
  precoUnitario: number | null;
  /** Categoria do serviço no Omie (`cCodCateg`) — vai na OS, que pede categoria. */
  categoria: string | null;
};

/** Uma página de `ListarCadastroServico`. Serviço inativo não entra. */
export function servicosDaPagina(corpo: unknown): { servicos: ServicoDoOmie[]; totalDePaginas: number } {
  const o = obj(corpo);
  const lista = Array.isArray(o.cadastros) ? o.cadastros : [];
  const servicos: ServicoDoOmie[] = [];
  for (const item of lista) {
    const s = obj(item);
    const cod = codigo(obj(s.intListar).nCodServ);
    const cab = umObjeto(s.cabecalho);
    const descricao = texto(cab.cDescricao) || texto(umObjeto(s.descricao).cDescrCompleta);
    if (!cod || !descricao || simNao(obj(s.info).inativo) === true) continue;
    servicos.push({
      codigo: cod,
      codigoInterno: texto(cab.cCodigo) || null,
      descricao: descricao.slice(0, 180),
      precoUnitario: numeroOuNulo(cab.nPrecoUnit),
      categoria: texto(cab.cCodCateg) || null,
    });
  }
  return { servicos, totalDePaginas: totalDePaginas(o.nTotPaginas) };
}

// ─── Quem emite ─────────────────────────────────────────────────────────────

export type ConferenciaDoEmissor = { pode: true; empresasNaConta: number } | { pode: false; motivo: string };

function documentoFormatado(doc: string): string {
  return doc.length === 11 ? formatCpf(doc) : formatCnpj(doc);
}

/**
 * A nota sai pela empresa da conta do Omie, e não pela empresa escolhida no
 * Connect: a OS não tem campo de emitente. Então só se emite pela empresa do
 * Connect cujo documento está na conta.
 *
 * É o caso de 13/10/2026: ELIO RUBENS e ER DIAS foram cadastradas com a mesma
 * App Key. Sem esta conferência, emitir "pela ELIO RUBENS" sairia com o CNPJ da
 * conta — nota de uma empresa em nome da outra.
 */
export function conferirEmissor(empresas: EmpresaDaConta[], documentoDaEmpresa: string | null): ConferenciaDoEmissor {
  const doc = digitos(documentoDaEmpresa);
  if (!doc) return { pode: false, motivo: "A empresa não tem CNPJ (nem CPF) no Connect para conferir com a conta do Omie." };
  if (empresas.length === 0) return { pode: false, motivo: "O Omie não devolveu empresa nenhuma nesta conta — não dá para conferir por qual CNPJ a nota sairia." };
  if (empresas.some((e) => e.cnpj === doc)) return { pode: true, empresasNaConta: empresas.length };
  const daConta = empresas
    .map((e) => `${e.cnpj ? documentoFormatado(e.cnpj) : "sem CNPJ"} (${e.razaoSocial || "sem nome"})`)
    .join(", ");
  return {
    pode: false,
    motivo: `A conta do Omie cadastrada nesta empresa é de outro documento: ${daConta}. A nota sairia por lá, e não por esta empresa — emita pela empresa dona da conta.`,
  };
}

// ─── O pedido ───────────────────────────────────────────────────────────────

export type PedidoDeNfse = {
  tomadorCodigo: string;
  servicoCodigo: string;
  valorCentavos: number;
  competencia: string;
  descricao: string | null;
};

/** Decimal(12,2): até 9.999.999.999,99. */
const MAXIMO_EM_CENTAVOS = 999_999_999_999;
export const MAXIMO_DA_DESCRICAO = 2000;

/**
 * Só a competência do mês corrente, por enquanto.
 *
 * A OS do Omie não tem campo de competência na documentação (13/10/2026): a
 * NFS-e sai com a data do faturamento. Aceitar outro mês gravaria no Connect
 * uma competência que a nota não tem. Se a prévia ou o piloto mostrarem um
 * caminho, é aqui que se abre.
 */
export function competenciaPermitida(competencia: string, competenciaAtual: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return "Competência inválida.";
  if (competencia === competenciaAtual) return null;
  const [ano, mes] = competenciaAtual.split("-");
  return `O Omie não recebe a competência pela API: a nota sai com a data do faturamento, em ${mes}/${ano}. Para nota de outra competência, emita pela tela do Omie.`;
}

export function validarPedido(
  bruto: { tomadorCodigo: string; servicoCodigo: string; valorCentavos: number | null; competencia: string; descricao: string },
  competenciaAtual: string
): { ok: true; pedido: PedidoDeNfse } | { ok: false; erro: string } {
  const tomador = codigo(bruto.tomadorCodigo);
  if (!tomador) return { ok: false, erro: "Escolha o tomador na lista do Omie." };
  const servico = codigo(bruto.servicoCodigo);
  if (!servico) return { ok: false, erro: "Escolha o serviço na lista do Omie." };
  const valor = bruto.valorCentavos;
  if (valor === null || !Number.isSafeInteger(valor) || valor <= 0) return { ok: false, erro: "Informe o valor da nota." };
  if (valor > MAXIMO_EM_CENTAVOS) return { ok: false, erro: "Valor acima do que o Connect guarda." };
  const erroDaCompetencia = competenciaPermitida(bruto.competencia.trim(), competenciaAtual);
  if (erroDaCompetencia) return { ok: false, erro: erroDaCompetencia };
  const descricao = bruto.descricao.trim();
  if (descricao.length > MAXIMO_DA_DESCRICAO) return { ok: false, erro: `A descrição passa de ${MAXIMO_DA_DESCRICAO} caracteres.` };
  return {
    ok: true,
    pedido: { tomadorCodigo: tomador, servicoCodigo: servico, valorCentavos: valor, competencia: bruto.competencia.trim(), descricao: descricao || null },
  };
}

/** "dd/mm/aaaa" de hoje em Brasília — o formato de data do Omie. */
export function dataDoOmie(agora: Date): string {
  const [ano, mes, dia] = saoPauloParts(agora).dateKey.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * O `param` do `IncluirOS`. O mínimo: o cadastro do serviço no Omie (código
 * municipal, LC 116, tributação, alíquotas) vale para tudo o que não vai aqui —
 * a configuração fiscal mora no Omie, e o Connect não a duplica.
 *
 * - `cCodIntOS` é o id da emissão: pedir duas vezes a mesma OS volta "já
 *   cadastrado para o código de integração", e é por ele que se pergunta ao
 *   Omie por uma OS cuja resposta se perdeu.
 * - Etapa "10" (primeira coluna do Omie); quem fatura é o `FaturarOS` logo depois.
 * - `cDescServ` só quando a pessoa escreveu: em branco vale a descrição do cadastro.
 * - Sem bloco de e-mail: vale o que a conta do Omie já faz ao faturar.
 */
export function parametrosDoIncluirOS(p: {
  emissaoId: string;
  pedido: PedidoDeNfse;
  categoria: string | null;
  hoje: string;
}): Record<string, unknown> {
  const item: Record<string, unknown> = {
    nCodServico: Number(p.pedido.servicoCodigo),
    nQtde: 1,
    nValUnit: p.pedido.valorCentavos / 100,
  };
  if (p.pedido.descricao) item.cDescServ = p.pedido.descricao;
  const param: Record<string, unknown> = {
    Cabecalho: {
      cCodIntOS: p.emissaoId,
      nCodCli: Number(p.pedido.tomadorCodigo),
      dDtPrevisao: p.hoje,
      cEtapa: "10",
      nQtdeParc: 1,
    },
    ServicosPrestados: [item],
  };
  if (p.categoria) param.InformacoesAdicionais = { cCodCateg: p.categoria };
  return param;
}

// ─── O que volta ────────────────────────────────────────────────────────────

export type RespostaDaOS = { codigoOS: string | null; numeroOS: string | null; codigoStatus: string | null; descricaoStatus: string | null };

/** Resposta de `IncluirOS`, `FaturarOS` e `CancelarOS` — todas com o mesmo formato na documentação. */
export function lerRespostaDaOS(corpo: unknown): RespostaDaOS {
  const o = obj(corpo);
  return {
    codigoOS: codigo(o.nCodOS),
    numeroOS: texto(o.cNumOS) || null,
    codigoStatus: texto(o.cCodStatus) || null,
    descricaoStatus: texto(o.cDescStatus).slice(0, 2000) || null,
  };
}

export type MensagemDaPrefeitura = { codigo: string | null; descricao: string; correcao: string | null; situacao: string | null };

export type RpsDaOS = {
  /** 001 aguardando envio · 002 enviado, processando · 003 erro · 004 sucesso · 005 cancelado. */
  status: string | null;
  numeroNfse: string | null;
  codigoVerificacao: string | null;
  cnpjPrestador: string | null;
  url: string | null;
  mensagens: MensagemDaPrefeitura[];
};

export type StatusDaOS = {
  codigoOS: string | null;
  numeroOS: string | null;
  faturada: boolean | null;
  cancelada: boolean | null;
  ambiente: "P" | "H" | null;
  /** Data e hora do faturamento, de Brasília. */
  faturadaEm: Date | null;
  /** "dd/mm/aaaa" do faturamento, como veio — a competência sai dele. */
  dataDoFaturamento: string | null;
  rps: RpsDaOS[];
};

/** Resposta de `StatusOS`. */
export function lerStatusDaOS(corpo: unknown): StatusDaOS {
  const o = obj(corpo);
  const ambiente = texto(o.cAmbiente).toUpperCase();
  const lista = Array.isArray(o.ListaRpsNfse) ? o.ListaRpsNfse : [];
  const dataDoFaturamento = /^\d{2}\/\d{2}\/\d{4}$/.test(texto(o.dDtFat)) ? texto(o.dDtFat) : null;
  return {
    codigoOS: codigo(o.nCodOS),
    numeroOS: texto(o.cNumOS) || null,
    faturada: simNao(o.cFaturada),
    cancelada: simNao(o.cCancelada),
    ambiente: ambiente === "P" || ambiente === "H" ? ambiente : null,
    faturadaEm: instanteDoOmie(o.dDtFat, o.cHrFat),
    dataDoFaturamento,
    rps: lista.map((item) => {
      const r = obj(item);
      const nfse = texto(r.nNfse).replace(/^0+(?=\d)/, "");
      const cnpj = digitos(r.cCNPJ);
      const msgs = Array.isArray(r.mensagens) ? r.mensagens : [];
      return {
        status: texto(r.cStatusRps) || texto(r.cStatusLote) || null,
        numeroNfse: nfse && nfse !== "0" ? nfse.slice(0, 20) : null,
        codigoVerificacao: texto(r.cCodVerif).slice(0, 50) || null,
        cnpjPrestador: cnpj.length === 14 || cnpj.length === 11 ? cnpj : null,
        url: texto(r.cUrlNfse) || texto(r.cUrlPdfDest) || null,
        mensagens: msgs
          .map((m) => obj(m))
          .map((m) => ({
            codigo: texto(m.cCodigo) || null,
            descricao: texto(m.cDescricao),
            correcao: texto(m.cCorrecao) || null,
            situacao: texto(m.cSituacao).toUpperCase() || null,
          }))
          .filter((m) => m.descricao),
      };
    }),
  };
}

/** As mensagens da prefeitura em texto, as de erro primeiro. Vazio vira `null`. */
export function mensagensEmTexto(mensagens: MensagemDaPrefeitura[]): string | null {
  const ordem = (m: MensagemDaPrefeitura) => (m.situacao === "ERRO" ? 0 : m.situacao === "ALERTA" ? 1 : 2);
  const linhas = [...mensagens]
    .sort((a, b) => ordem(a) - ordem(b))
    .map((m) => `${m.codigo ? `${m.codigo}: ` : ""}${m.descricao}${m.correcao ? ` — ${m.correcao}` : ""}`);
  return linhas.length > 0 ? linhas.join("\n").slice(0, 4000) : null;
}

export type NfseAutorizada = { numero: string; codigoVerificacao: string | null; cnpjPrestador: string | null; url: string | null };

export type Desfecho =
  | { estado: "PROCESSANDO"; mensagem: string | null; aguardandoFaturamento: boolean }
  | { estado: "AUTORIZADA"; nfse: NfseAutorizada; mensagem: string | null }
  | { estado: "REJEITADA"; mensagem: string }
  | { estado: "CANCELADA"; mensagem: string };

/**
 * O que o `StatusOS` diz da nota. Vale o RPS mais recente (o último da lista:
 * um reenvio gera outro), e o número da NFS-e é o sinal mais forte de
 * autorização — status desconhecido com número é nota emitida.
 */
export function desfechoDoStatus(s: StatusDaOS): Desfecho {
  if (s.cancelada === true) return { estado: "CANCELADA", mensagem: "Cancelada no Omie." };
  const rps = s.rps.at(-1);
  if (!rps) {
    return {
      estado: "PROCESSANDO",
      mensagem: s.faturada === false ? "O Omie ainda não faturou a OS." : null,
      aguardandoFaturamento: s.faturada !== true,
    };
  }
  const mensagens = mensagensEmTexto(rps.mensagens);
  if (rps.status === "003") {
    return { estado: "REJEITADA", mensagem: mensagens ?? "A prefeitura recusou o RPS (status 003), sem mensagem no Omie. Veja a OS na tela do Omie." };
  }
  if (rps.status === "005") return { estado: "CANCELADA", mensagem: mensagens ?? "O RPS consta como cancelado no Omie." };
  if (rps.numeroNfse) {
    return {
      estado: "AUTORIZADA",
      nfse: { numero: rps.numeroNfse, codigoVerificacao: rps.codigoVerificacao, cnpjPrestador: rps.cnpjPrestador, url: rps.url },
      mensagem: mensagens,
    };
  }
  const conhecido = rps.status === "001" || rps.status === "002" || rps.status === "004";
  return {
    estado: "PROCESSANDO",
    mensagem: conhecido ? mensagens : `Situação do RPS que o Connect não conhece: ${rps.status ?? "vazia"}.${mensagens ? `\n${mensagens}` : ""}`,
    aguardandoFaturamento: false,
  };
}

// ─── Erros do Omie que mudam o caminho ──────────────────────────────────────

/** `IncluirOS` repetido com o mesmo `cCodIntOS`: a OS já existe lá. */
export function ehOsJaCadastrada(err: unknown): boolean {
  return err instanceof ErroDoOmie && /j[aá] cadastrad[oa] para o c[oó]digo de integra/i.test(err.message);
}

/** A OS procurada não existe no Omie. */
export function ehNaoEncontrada(err: unknown): boolean {
  return err instanceof ErroDoOmie && /n[aã]o (cadastrad|encontrad|localizad)|n[aã]o existe/i.test(err.message);
}

/**
 * Sem resposta conclusiva: rede, tempo esgotado, HTTP de erro sem a mensagem do
 * Omie (a ajuda diz que pode ser instabilidade), ou o `PROTO_BYEBYE`, que o
 * Omie diz poder deixar registro pela metade. O pedido pode ter chegado — não
 * se repete nem se dá por recusado; o acompanhamento pergunta depois.
 *
 * Erro com mensagem do Omie (`faultstring`) é resposta: o pedido foi recusado.
 * A pausa da fila também: nesse caso a chamada nem saiu.
 */
export function ehSemResposta(err: unknown): boolean {
  if (!(err instanceof ErroDoOmie)) return true;
  return /PROTO_BYEBYE/i.test(err.message) || err.message.startsWith("O Omie respondeu HTTP");
}

// ─── Estados ────────────────────────────────────────────────────────────────

export type EstadoDaEmissao = "ENVIANDO" | "PROCESSANDO" | "AUTORIZADA" | "REJEITADA" | "CANCELADA";

export const ROTULO_DO_ESTADO: Record<EstadoDaEmissao, string> = {
  ENVIANDO: "Enviando",
  PROCESSANDO: "Processando",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  CANCELADA: "Cancelada",
};

/**
 * O que dá para cancelar daqui: a nota autorizada (cancela na prefeitura) e a
 * OS que ficou no Omie sem nota (recusada no faturamento). O resto ou não
 * existe lá ou ainda está em voo — cancelar no meio do envio é corrida.
 */
export function comoCancelar(e: { estado: EstadoDaEmissao; omieCodigoOS: string | null; nfseNumero: string | null }):
  | { pode: true; naPrefeitura: boolean }
  | { pode: false } {
  if (!e.omieCodigoOS) return { pode: false };
  if (e.estado === "AUTORIZADA") return { pode: true, naPrefeitura: true };
  if (e.estado === "REJEITADA") return { pode: true, naPrefeitura: Boolean(e.nfseNumero) };
  return { pode: false };
}

// ─── Acervo fiscal ──────────────────────────────────────────────────────────

/**
 * A nota autorizada como linha do acervo, pela mesma `dedupKey` dos outros
 * caminhos (`NFSE:{prestador}:{série}:{número}:{competência}`).
 *
 * Série vazia: o `StatusOS` não devolve série. Competência: o mês do
 * faturamento, como o Omie escreve (Brasília) — é a data da nota, já que a OS
 * não leva competência. Se a sincronização do SPED trouxer a mesma nota com
 * série, a chave muda; por isso quem grava procura antes por prestador +
 * número (ver `gravarNoAcervo`), e não só pela chave.
 */
export function notaParaOAcervo(p: {
  numero: string;
  cnpjPrestador: string;
  dataDoFaturamento: string | null;
  faturadaEm: Date | null;
  agora: Date;
}): { dedupKey: string; competencia: string; emitidaEm: Date } | null {
  const emitidaEm = p.faturadaEm ?? p.agora;
  const [, mes, ano] = (p.dataDoFaturamento ?? dataDoOmie(emitidaEm)).split("/");
  const competencia = `${ano}-${mes}`;
  const dedupKey = chaveDeDeduplicacao({ tipo: "NFSE", emitenteDocumento: p.cnpjPrestador, serie: null, numero: p.numero, competencia });
  return dedupKey ? { dedupKey, competencia, emitidaEm } : null;
}
