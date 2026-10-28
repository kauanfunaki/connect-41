// Emissão de NFS-e pelo Omie — o lado que fala com o banco e com o Omie (Fase 2,
// 13/10/2026). As regras puras estão em ./emissao.ts, a fila e a pausa em
// ./fila.ts, quem pode em ./acessoEmissao.ts.
//
// O caminho de uma nota:
//
//   1. a linha nasce em ENVIANDO, com o que foi pedido e por quem — antes de
//      qualquer chamada, para o pedido existir mesmo se o processo cair;
//   2. `IncluirOS` (o `cCodIntOS` é o id da linha) e `FaturarOS`, na fila de
//      escrita da conta → PROCESSANDO; recusa do Omie → REJEITADA, com a
//      mensagem como veio; sem resposta → fica onde está, e o cron pergunta;
//   3. o cron (`/api/cron/omie-emissoes`) consulta `StatusOS` até a prefeitura
//      responder → AUTORIZADA (e a nota entra no acervo fiscal) ou REJEITADA;
//   4. cancelar (`CancelarOS`) → CANCELADA.
//
// **Duas empresas do Connect com a mesma conta do Omie** (ELIO RUBENS e ER DIAS,
// 13/10/2026): a fila e a pausa são por conta (App Key), as listas também, e a
// emissão só sai pela empresa cujo documento está na conta — a OS não tem campo
// de emitente, e a nota sai pela empresa da conta (ver `conferirEmissor`).

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { lerConfig } from "@/lib/integracoes/data";
import { nomeExibicao } from "@/lib/companyName";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { formatCnpj, formatCpf, formatInstantTime } from "@/lib/format";
import { empresasDaResposta, ErroDoOmie, type CredencialOmie, type EmpresaDaConta } from "./cliente";
import { instanciaDaEmpresa, PREFIXO_DA_EMPRESA } from "./contas";
import { chamarOmieNaFila, idDaConta, pausaAte, pausaPedidaPeloOmie } from "./fila";
import { empresasDoGrupo } from "./sincronizacao";
import {
  clienteDaConsulta,
  clientesDaPagina,
  comoCancelar,
  filtrosDeBuscaDeCliente,
  MIN_LETRAS_DA_BUSCA,
  conferirEmissor,
  dataDoOmie,
  desfechoDoStatus,
  ehNaoEncontrada,
  ehOsJaCadastrada,
  ehSemResposta,
  lerRespostaDaOS,
  lerStatusDaOS,
  notaParaOAcervo,
  osDaPagina,
  parametrosDoIncluirOS,
  servicosDaPagina,
  sugestoesDasOS,
  type ClienteDoOmie,
  type ConferenciaDoEmissor,
  type EstadoDaEmissao,
  type NfseAutorizada,
  type PedidoDeNfse,
  type ServicoDoOmie,
  type StatusDaOS,
  type SugestoesDasOS,
} from "./emissao";

const MINUTO = 60_000;

function mensagemDe(err: unknown): string {
  if (err instanceof ErroDoOmie) return err.message;
  if (err instanceof Error) return `Sem resposta do Omie (${err.message}).`;
  return "Sem resposta do Omie.";
}

function documentoFormatado(doc: string): string {
  return doc.length === 11 ? formatCpf(doc) : formatCnpj(doc);
}

// ─── A conta da empresa ─────────────────────────────────────────────────────

type ContaDaEmpresa = {
  cred: CredencialOmie;
  empresa: { id: string; nome: string; razaoSocial: string; cnpj: string | null; documento: string | null };
};

async function contaDaEmpresa(tenantId: string, companyId: string): Promise<{ ok: true; conta: ContaDaEmpresa } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const [conexao, empresa] = await Promise.all([
    prisma.tenantIntegration.findUnique({
      where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
      select: { enabled: true, configEnc: true },
    }),
    prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true, name: true, displayName: true, cnpj: true, cpf: true } }),
  ]);
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  if (!conexao) return { ok: false, erro: "Esta empresa não tem conta do Omie cadastrada (Configurações › Integrações)." };
  if (!conexao.enabled) return { ok: false, erro: "A conta do Omie desta empresa está desligada." };
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) return { ok: false, erro: "Falta App Key ou App Secret na conta do Omie desta empresa." };
  const cnpj = (empresa.cnpj ?? "").replace(/\D/g, "") || null;
  const cpf = (empresa.cpf ?? "").replace(/\D/g, "") || null;
  return {
    ok: true,
    conta: {
      cred: { appKey: config.appKey, appSecret: config.appSecret },
      empresa: { id: empresa.id, nome: nomeExibicao(empresa), razaoSocial: empresa.name, cnpj, documento: cnpj ?? cpf },
    },
  };
}

/**
 * As outras empresas do Connect cadastradas com a mesma conta do Omie (a mesma
 * App Key). A tela avisa: as duas dividem a fila do Omie, e a nota só sai pela
 * que é dona da conta.
 */
export async function outrasEmpresasDaMesmaConta(tenantId: string, companyId: string): Promise<string[]> {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { tenantId, integrationCode: "omie", instanceKey: { startsWith: PREFIXO_DA_EMPRESA } },
    select: { instanceKey: true, configEnc: true },
  });
  const contaDe = (configEnc: string) => {
    const appKey = lerConfig(configEnc).appKey;
    return appKey ? idDaConta({ appKey }) : null;
  };
  const minha = conexoes.find((c) => c.instanceKey === instanciaDaEmpresa(companyId));
  const id = minha ? contaDe(minha.configEnc) : null;
  if (!id) return [];
  const ids = conexoes.filter((c) => c !== minha && contaDe(c.configEnc) === id).map((c) => c.instanceKey.slice(PREFIXO_DA_EMPRESA.length));
  if (ids.length === 0) return [];
  const empresas = await prisma.company.findMany({ where: { tenantId, id: { in: ids } }, select: { name: true, displayName: true } });
  return empresas.map((e) => nomeExibicao(e)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ─── Listas do Omie (tomadores, serviços, empresas da conta) ────────────────

export type ListasDoOmie = {
  clientes: ClienteDoOmie[];
  /** Códigos dos clientes com faturamento bloqueado no Omie — fora da lista, e recusados ao emitir. */
  clientesBloqueados: string[];
  servicos: ServicoDoOmie[];
  /** A categoria da OS mais recente não cancelada — para o serviço sem categoria no cadastro. */
  categoriaSugerida: SugestoesDasOS["categoria"];
  empresasDaConta: EmpresaDaConta[];
  /** A lista parou no teto de páginas — a busca não acha quem ficou de fora. */
  clientesCortados: boolean;
  servicosCortados: boolean;
  lidasEm: Date;
};

/** As listas valem 10 min; "Atualizar" relê, mas não antes de 60 s (o Omie não repete consulta igual). */
const VALIDADE_DAS_LISTAS_MS = 10 * MINUTO;
const INTERVALO_MINIMO_MS = MINUTO;
/** 10 páginas: 1.000 clientes e 500 serviços. */
const MAX_PAGINAS = 10;

// Por conta, não por empresa: duas empresas com a mesma App Key veem o mesmo Omie.
const cacheDasListas = new Map<string, ListasDoOmie>();

/** Só para teste: esquece as listas guardadas. */
export function esquecerListas(): void {
  cacheDasListas.clear();
}

async function lerListas(cred: CredencialOmie): Promise<ListasDoOmie> {
  // Em sequência: cada método tem a sua fila, mas pressa nenhuma aqui justifica
  // somar chamadas simultâneas na mesma conta.
  const empresasDaConta = empresasDaResposta(
    await chamarOmieNaFila(cred, "geral/empresas", "ListarEmpresas", { pagina: 1, registros_por_pagina: 50 })
  );

  const clientes: ClienteDoOmie[] = [];
  const clientesBloqueados: string[] = [];
  let pagina = 1;
  let total = 1;
  do {
    const r = clientesDaPagina(
      await chamarOmieNaFila(cred, "geral/clientes", "ListarClientes", { pagina, registros_por_pagina: 100, apenas_importado_api: "N" })
    );
    clientes.push(...r.clientes);
    clientesBloqueados.push(...r.bloqueados);
    total = r.totalDePaginas;
    pagina++;
  } while (pagina <= total && pagina <= MAX_PAGINAS);
  const clientesCortados = total > MAX_PAGINAS;

  const servicos: ServicoDoOmie[] = [];
  pagina = 1;
  total = 1;
  do {
    // 50 é o máximo por página deste método, pela documentação.
    const r = servicosDaPagina(await chamarOmieNaFila(cred, "servicos/servico", "ListarCadastroServico", { nPagina: pagina, nRegPorPagina: 50 }));
    servicos.push(...r.servicos);
    total = r.totalDePaginas;
    pagina++;
  } while (pagina <= total && pagina <= MAX_PAGINAS);
  const servicosCortados = total > MAX_PAGINAS;

  // As OS mais recentes: a categoria e os códigos fiscais que a empresa já usa,
  // para o serviço que não os tem no cadastro (o caso da MULTI na prévia real).
  // É sugestão: se a leitura falhar, o formulário abre do mesmo jeito e pede a
  // categoria — o que não pode é a falta da sugestão impedir a emissão.
  let sugestoes: SugestoesDasOS = { categoria: null, porServico: {} };
  try {
    sugestoes = sugestoesDasOS(
      osDaPagina(
        await chamarOmieNaFila(cred, "servicos/os", "ListarOS", { pagina: 1, registros_por_pagina: 50, apenas_importado_api: "N", ordem_decrescente: "S" })
      )
    );
  } catch {
    // Sem sugestão.
  }

  const porNome = (a: { nome?: string; descricao?: string }, b: { nome?: string; descricao?: string }) =>
    (a.nome ?? a.descricao ?? "").localeCompare(b.nome ?? b.descricao ?? "", "pt-BR");
  return {
    clientes: clientes.sort(porNome),
    clientesBloqueados,
    servicos: servicos.map((s) => ({ ...s, naUltimaOS: sugestoes.porServico[s.codigo] ?? null })).sort(porNome),
    categoriaSugerida: sugestoes.categoria,
    empresasDaConta,
    clientesCortados,
    servicosCortados,
    lidasEm: new Date(),
  };
}

type Preparo = { ok: true; conta: ContaDaEmpresa; listas: ListasDoOmie; conferencia: ConferenciaDoEmissor } | { ok: false; erro: string };

async function preparar(tenantId: string, companyId: string, atualizar: boolean): Promise<Preparo> {
  const c = await contaDaEmpresa(tenantId, companyId);
  if (!c.ok) return c;
  const chave = idDaConta(c.conta.cred);
  const guardada = cacheDasListas.get(chave);
  const idade = guardada ? Date.now() - guardada.lidasEm.getTime() : Number.POSITIVE_INFINITY;
  let listas = guardada;
  if (!listas || idade > VALIDADE_DAS_LISTAS_MS || (atualizar && idade > INTERVALO_MINIMO_MS)) {
    try {
      listas = await lerListas(c.conta.cred);
      cacheDasListas.set(chave, listas);
    } catch (err) {
      return { ok: false, erro: `Não deu para ler as listas do Omie: ${mensagemDe(err)}` };
    }
  }
  return { ok: true, conta: c.conta, listas, conferencia: conferirEmissor(listas.empresasDaConta, c.conta.empresa.documento) };
}

export type ListasParaATela = {
  clientes: ClienteDoOmie[];
  /** Quantos clientes ficaram fora da lista por faturamento bloqueado no Omie. */
  clientesBloqueados: number;
  servicos: ServicoDoOmie[];
  categoriaSugerida: SugestoesDasOS["categoria"];
  clientesCortados: boolean;
  servicosCortados: boolean;
  lidasEm: Date;
  conferencia: ConferenciaDoEmissor;
};

/** As listas para o formulário, e se esta empresa pode emitir por esta conta. Só leitura no Omie. */
export async function listasParaEmitir(
  tenantId: string,
  companyId: string,
  atualizar = false
): Promise<{ ok: true; listas: ListasParaATela } | { ok: false; erro: string }> {
  const p = await preparar(tenantId, companyId, atualizar);
  if (!p.ok) return p;
  const { clientes, clientesBloqueados, servicos, categoriaSugerida, clientesCortados, servicosCortados, lidasEm } = p.listas;
  return {
    ok: true,
    listas: {
      clientes,
      clientesBloqueados: clientesBloqueados.length,
      servicos,
      categoriaSugerida,
      clientesCortados,
      servicosCortados,
      lidasEm,
      conferencia: p.conferencia,
    },
  };
}

// ─── Buscar tomador fora da lista ───────────────────────────────────────────

/** Até 50 achados por busca: o bastante para escolher, sem gastar páginas. */
const ACHADOS_POR_BUSCA = 50;

export type ResultadoDaBusca =
  | { ok: true; clientes: ClienteDoOmie[]; bloqueados: number }
  | { ok: false; erro: string };

/**
 * Busca no Omie o tomador que ficou fora da lista (28/10/2026): a lista para em
 * 1.000 clientes, e a busca vai direto ao cadastro da conta, por CNPJ/CPF ou
 * pelo nome (razão social, depois nome fantasia). Só leitura no Omie. Os
 * achados entram nas listas guardadas, para o formulário e a emissão os
 * reconhecerem enquanto elas valerem; depois, `emitirNfse` confere o cadastro.
 */
export async function buscarTomadores(tenantId: string, companyId: string, termo: string): Promise<ResultadoDaBusca> {
  const filtros = filtrosDeBuscaDeCliente(termo);
  if (filtros.length === 0) {
    return { ok: false, erro: `Digite o CNPJ ou CPF completo, ou pelo menos ${MIN_LETRAS_DA_BUSCA} letras do nome.` };
  }
  const p = await preparar(tenantId, companyId, false);
  if (!p.ok) return p;
  if (!p.conferencia.pode) return { ok: false, erro: p.conferencia.motivo };

  const clientes: ClienteDoOmie[] = [];
  const bloqueados: string[] = [];
  try {
    for (const clientesFiltro of filtros) {
      let r: ReturnType<typeof clientesDaPagina>;
      try {
        r = clientesDaPagina(
          await chamarOmieNaFila(p.conta.cred, "geral/clientes", "ListarClientes", {
            pagina: 1,
            registros_por_pagina: ACHADOS_POR_BUSCA,
            apenas_importado_api: "N",
            clientesFiltro,
          })
        );
      } catch (err) {
        // "Não existem registros para a página [1]!" é busca sem achado, não erro.
        if (ehNaoEncontrada(err)) continue;
        throw err;
      }
      clientes.push(...r.clientes.filter((c) => !clientes.some((x) => x.codigo === c.codigo)));
      bloqueados.push(...r.bloqueados.filter((b) => !bloqueados.includes(b)));
      if (clientes.length > 0) break;
    }
  } catch (err) {
    return { ok: false, erro: `Não deu para buscar no Omie: ${mensagemDe(err)}` };
  }

  // Os achados passam a valer para o formulário e para a emissão.
  const chave = idDaConta(p.conta.cred);
  const guardada = cacheDasListas.get(chave);
  if (guardada) {
    const novos = clientes.filter((c) => !guardada.clientes.some((x) => x.codigo === c.codigo));
    const novosBloqueados = bloqueados.filter((b) => !guardada.clientesBloqueados.includes(b));
    if (novos.length > 0 || novosBloqueados.length > 0) {
      cacheDasListas.set(chave, {
        ...guardada,
        clientes: [...guardada.clientes, ...novos],
        clientesBloqueados: [...guardada.clientesBloqueados, ...novosBloqueados],
      });
    }
  }

  return {
    ok: true,
    clientes: clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    bloqueados: bloqueados.length,
  };
}

/** O cadastro de um tomador pelo código, para emitir quem veio da busca. */
async function consultarTomador(
  cred: CredencialOmie,
  codigoDoCliente: string
): Promise<{ ok: true; cliente: ClienteDoOmie | null; bloqueado: boolean } | { ok: false; erro: string }> {
  try {
    const r = clienteDaConsulta(
      await chamarOmieNaFila(cred, "geral/clientes", "ConsultarCliente", { codigo_cliente_omie: Number(codigoDoCliente) })
    );
    return { ok: true, ...r };
  } catch (err) {
    if (ehNaoEncontrada(err)) return { ok: true, cliente: null, bloqueado: false };
    return { ok: false, erro: `Não deu para conferir o tomador no Omie: ${mensagemDe(err)}` };
  }
}

// ─── Emitir ─────────────────────────────────────────────────────────────────

export type ResultadoDaEmissao =
  | { ok: true; emissaoId: string; estado: EstadoDaEmissao; mensagem: string | null }
  | { ok: false; erro: string };

/** Um pedido igual em andamento nos últimos 2 min é clique duplo, não nota nova. */
const JANELA_DO_CLIQUE_DUPLO_MS = 2 * MINUTO;

export async function emitirNfse(p: {
  tenantId: string;
  companyId: string;
  userId: string;
  pedido: PedidoDeNfse;
  agora?: Date;
}): Promise<ResultadoDaEmissao> {
  const prisma = getPrisma();
  const agora = p.agora ?? new Date();

  // A OS nunca sai sem categoria. `validarPedido` já barra; aqui é a última porta.
  if (!p.pedido.categoria.trim()) return { ok: false, erro: "Informe a categoria no Omie: a ordem de serviço não sai sem ela." };

  const preparo = await preparar(p.tenantId, p.companyId, false);
  if (!preparo.ok) return preparo;
  if (!preparo.conferencia.pode) return { ok: false, erro: preparo.conferencia.motivo };
  const { conta, listas } = preparo;
  if (listas.clientesBloqueados.includes(p.pedido.tomadorCodigo)) {
    return { ok: false, erro: "Este tomador está com o faturamento bloqueado no cadastro do Omie. Libere por lá e atualize as listas antes de emitir." };
  }
  let tomador: ClienteDoOmie | undefined = listas.clientes.find((c) => c.codigo === p.pedido.tomadorCodigo);
  if (!tomador && listas.clientesCortados) {
    // Achado pela busca (a lista parou nos primeiros 1.000): confere o cadastro
    // dele direto no Omie, com a mesma regra da lista.
    const consulta = await consultarTomador(conta.cred, p.pedido.tomadorCodigo);
    if (!consulta.ok) return consulta;
    if (consulta.bloqueado) {
      return { ok: false, erro: "Este tomador está com o faturamento bloqueado no cadastro do Omie. Libere por lá e busque de novo antes de emitir." };
    }
    tomador = consulta.cliente ?? undefined;
  }
  if (!tomador) return { ok: false, erro: "O tomador escolhido não está na lista do Omie desta conta. Atualize as listas e escolha de novo." };
  const servico = listas.servicos.find((s) => s.codigo === p.pedido.servicoCodigo);
  if (!servico) return { ok: false, erro: "O serviço escolhido não está no cadastro do Omie desta conta. Atualize as listas e escolha de novo." };

  // Conta em pausa por bloqueio do Omie: avisa antes de criar a linha — o
  // pedido nem sairia, e uma "rejeitada" aqui seria só ruído na lista.
  const pausa = Math.max(pausaAte(conta.cred, "IncluirOS") ?? 0, pausaAte(conta.cred, "FaturarOS") ?? 0);
  if (pausa > 0) {
    return { ok: false, erro: `O Omie pediu uma pausa nas emissões desta conta. Tente de novo depois das ${formatInstantTime(new Date(pausa), { hour: "2-digit", minute: "2-digit" })}.` };
  }

  const valor = decimalDeCentavos(p.pedido.valorCentavos);
  const igual = await prisma.omieEmissao.findFirst({
    where: {
      tenantId: p.tenantId,
      companyId: p.companyId,
      estado: { in: ["ENVIANDO", "PROCESSANDO"] },
      tomadorCodigoOmie: tomador.codigo,
      servicoCodigoOmie: servico.codigo,
      valor,
      createdAt: { gte: new Date(agora.getTime() - JANELA_DO_CLIQUE_DUPLO_MS) },
    },
    select: { id: true },
  });
  if (igual) {
    return { ok: false, erro: "Uma nota igual (mesmo tomador, serviço e valor) foi pedida há menos de 2 minutos e ainda está em andamento. Confira a lista antes de pedir de novo." };
  }

  const emissao = await prisma.omieEmissao.create({
    data: {
      tenantId: p.tenantId,
      companyId: p.companyId,
      tipo: "NFSE",
      estado: "ENVIANDO",
      tomadorCodigoOmie: tomador.codigo,
      tomadorNome: tomador.nome.slice(0, 180),
      tomadorDocumento: tomador.documento,
      servicoCodigoOmie: servico.codigo,
      servicoDescricao: servico.descricao.slice(0, 180),
      valor,
      competencia: p.pedido.competencia,
      descricao: p.pedido.descricao,
      pedidoPorId: p.userId,
    },
    select: { id: true },
  });
  const id = emissao.id;
  const gravar = (data: Prisma.OmieEmissaoUpdateInput) => prisma.omieEmissao.update({ where: { id }, data });

  // 1. A OS.
  let os;
  try {
    os = lerRespostaDaOS(
      await chamarOmieNaFila(
        conta.cred,
        "servicos/os",
        "IncluirOS",
        parametrosDoIncluirOS({ emissaoId: id, pedido: p.pedido, hoje: dataDoOmie(agora) }),
        { escrita: true }
      )
    );
  } catch (err) {
    if (ehSemResposta(err) || ehOsJaCadastrada(err)) {
      // O pedido pode ter chegado: não repete, não dá por recusado. O cron
      // pergunta ao Omie pelo código de integração (o id desta linha).
      const mensagem = `${mensagemDe(err)} O Connect confere com o Omie nos próximos minutos se a OS foi criada.`;
      await gravar({ mensagem });
      return { ok: true, emissaoId: id, estado: "ENVIANDO", mensagem };
    }
    const mensagem = mensagemDe(err);
    await gravar({ estado: "REJEITADA", mensagem });
    return { ok: true, emissaoId: id, estado: "REJEITADA", mensagem };
  }
  if (!os.codigoOS) {
    const mensagem = `${os.descricaoStatus ?? "O Omie respondeu sem o código da OS."} O Connect confere com o Omie nos próximos minutos.`;
    await gravar({ mensagem });
    return { ok: true, emissaoId: id, estado: "ENVIANDO", mensagem };
  }
  await gravar({ omieCodigoOS: os.codigoOS, omieNumeroOS: os.numeroOS, mensagem: os.descricaoStatus });

  // 2. O faturamento — é ele que manda o RPS à prefeitura.
  const numeroDaOS = os.numeroOS ?? os.codigoOS;
  try {
    const fat = lerRespostaDaOS(await chamarOmieNaFila(conta.cred, "servicos/osp", "FaturarOS", { nCodOS: Number(os.codigoOS) }, { escrita: true }));
    const mensagem = fat.descricaoStatus;
    await gravar({ estado: "PROCESSANDO", mensagem });
    return { ok: true, emissaoId: id, estado: "PROCESSANDO", mensagem };
  } catch (err) {
    if (ehSemResposta(err)) {
      const mensagem = `${mensagemDe(err)} A OS ${numeroDaOS} foi criada; o Connect confere com o Omie se o faturamento saiu.`;
      await gravar({ estado: "PROCESSANDO", mensagem });
      return { ok: true, emissaoId: id, estado: "PROCESSANDO", mensagem };
    }
    const mensagem = `O Omie não faturou a OS ${numeroDaOS}: ${mensagemDe(err)}\nA OS ficou criada no Omie, sem nota: corrija e fature pela tela do Omie, ou cancele a OS aqui.`;
    await gravar({ estado: "REJEITADA", mensagem });
    return { ok: true, emissaoId: id, estado: "REJEITADA", mensagem };
  }
}

// ─── Cancelar ───────────────────────────────────────────────────────────────

export async function cancelarEmissao(p: {
  tenantId: string;
  emissaoId: string;
  userId: string;
  agora?: Date;
}): Promise<{ ok: true; naPrefeitura: boolean; mensagem: string | null } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const e = await prisma.omieEmissao.findFirst({
    where: { id: p.emissaoId, tenantId: p.tenantId },
    select: { id: true, companyId: true, estado: true, omieCodigoOS: true, nfseNumero: true, fiscalDocumentId: true },
  });
  if (!e) return { ok: false, erro: "Emissão não encontrada." };
  const como = comoCancelar(e);
  if (!como.pode) return { ok: false, erro: "Esta emissão não pode ser cancelada daqui — só nota autorizada, ou OS que ficou no Omie sem nota." };
  const c = await contaDaEmpresa(p.tenantId, e.companyId);
  if (!c.ok) return c;

  let resposta;
  try {
    resposta = lerRespostaDaOS(
      await chamarOmieNaFila(
        c.conta.cred,
        "servicos/osp",
        "CancelarOS",
        { nCodOS: Number(e.omieCodigoOS), cCancelarNfse: como.naPrefeitura ? "S" : "N" },
        { escrita: true }
      )
    );
  } catch (err) {
    if (ehSemResposta(err)) {
      return { ok: false, erro: `${mensagemDe(err)} Confira na tela do Omie se o cancelamento saiu antes de tentar de novo.` };
    }
    return { ok: false, erro: mensagemDe(err) };
  }

  const mensagem = resposta.descricaoStatus ?? (como.naPrefeitura ? "Cancelamento pedido à prefeitura pelo Omie." : "OS cancelada no Omie.");
  // Condicionado ao estado lido: outra aba que cancelou junto não sobrescreve.
  await prisma.omieEmissao.updateMany({
    where: { id: e.id, estado: e.estado },
    data: { estado: "CANCELADA", canceladaEm: p.agora ?? new Date(), canceladaPorId: p.userId, mensagem },
  });
  // A nota no acervo passa a cancelada, como a Fase 1 faz quando o Omie diz
  // que foi — vale para a linha que veio do SPED e foi reconhecida também.
  if (como.naPrefeitura && e.fiscalDocumentId) {
    await prisma.fiscalDocument.updateMany({ where: { id: e.fiscalDocumentId, tenantId: p.tenantId }, data: { situation: "CANCELADA" } });
  }
  return { ok: true, naPrefeitura: como.naPrefeitura, mensagem };
}

// ─── Acervo fiscal ──────────────────────────────────────────────────────────

/**
 * A nota autorizada no acervo, com origem `OMIE` e a mesma `dedupKey` de NFS-e
 * do SPED e do upload. Nota que já estava (o SPED trouxe antes, alguém subiu o
 * XML) é **reconhecida**, não duplicada — procurada por prestador + número em
 * qualquer série, porque o `StatusOS` não devolve série e o SPED pode ter uma.
 *
 * Vai para a empresa do CNPJ prestador que a prefeitura devolveu: a que pediu,
 * ou uma filial dela. Documento de fora do grupo não entra — é sinal de chave
 * de outra empresa, e a mensagem da emissão avisa.
 */
async function gravarNoAcervo(
  e: { id: string; tenantId: string; companyId: string; competencia: string; tomadorNome: string; tomadorDocumento: string | null; valor: Prisma.Decimal },
  nfse: NfseAutorizada,
  status: StatusDaOS,
  agora: Date
): Promise<{ fiscalDocumentId: string | null; aviso: string | null }> {
  if (status.ambiente === "H") return { fiscalDocumentId: null, aviso: "Nota de homologação (ambiente de teste do Omie): não existe na prefeitura e não entra no acervo fiscal." };
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: e.companyId, tenantId: e.tenantId }, select: { name: true, cnpj: true, cpf: true } });
  if (!empresa) return { fiscalDocumentId: null, aviso: "A empresa não existe mais no Connect." };
  const docDaEmpresa = (empresa.cnpj ?? empresa.cpf ?? "").replace(/\D/g, "");
  const prestador = nfse.cnpjPrestador ?? docDaEmpresa;
  if (!prestador) return { fiscalDocumentId: null, aviso: "Sem o documento do prestador, a nota não entrou no acervo fiscal." };

  let destino: { id: string; name: string } | null = null;
  if (prestador === docDaEmpresa) destino = { id: e.companyId, name: empresa.name };
  else if (docDaEmpresa.length === 14) {
    const grupo = await empresasDoGrupo(e.tenantId, e.companyId, { name: empresa.name, cnpj: docDaEmpresa });
    destino = grupo.porCnpj.get(prestador) ?? null;
  }
  if (!destino) {
    return {
      fiscalDocumentId: null,
      aviso: `A NFS-e saiu pelo documento ${documentoFormatado(prestador)}, que não é o desta empresa nem de uma filial dela no Connect — não entrou no acervo. Confira no Omie.`,
    };
  }

  const chave = notaParaOAcervo({ numero: nfse.numero, cnpjPrestador: prestador, dataDoFaturamento: status.dataDoFaturamento, faturadaEm: status.faturadaEm, agora });
  if (!chave) return { fiscalDocumentId: null, aviso: null };

  const existente = await prisma.fiscalDocument.findFirst({
    where: {
      tenantId: e.tenantId,
      type: "NFSE",
      issuerDocument: prestador,
      number: nfse.numero,
      competence: { in: [...new Set([chave.competencia, e.competencia])] },
    },
    select: { id: true },
  });
  if (existente) return { fiscalDocumentId: existente.id, aviso: null };

  try {
    const criado = await prisma.fiscalDocument.create({
      data: {
        tenantId: e.tenantId,
        companyId: destino.id,
        dedupKey: chave.dedupKey,
        origin: "OMIE",
        type: "NFSE",
        number: nfse.numero,
        series: null,
        issuerName: destino.name.slice(0, 180),
        issuerDocument: prestador,
        recipientName: e.tomadorNome.slice(0, 180),
        recipientDocument: e.tomadorDocumento,
        amount: e.valor,
        issuedAt: chave.emitidaEm,
        competence: chave.competencia,
        situation: "AUTORIZADA",
        // Sem XML no SPED: ninguém pede PDF de lá. O link é o da prefeitura.
        renderizavel: false,
      },
      select: { id: true },
    });
    return { fiscalDocumentId: criado.id, aviso: null };
  } catch (err) {
    // Corrida com o SPED gravando a mesma chave: quem chegou primeiro fica.
    if ((err as { code?: string }).code !== "P2002") throw err;
    const ja = await prisma.fiscalDocument.findUnique({
      where: { tenantId_dedupKey: { tenantId: e.tenantId, dedupKey: chave.dedupKey } },
      select: { id: true },
    });
    return { fiscalDocumentId: ja?.id ?? null, aviso: null };
  }
}

// ─── Acompanhamento (cron) ──────────────────────────────────────────────────

export type ResumoDoAcompanhamento = {
  consultadas: number;
  autorizadas: number;
  rejeitadas: number;
  canceladas: number;
  seguem: number;
  falhas: { emissaoId: string; erro: string }[];
};

/** ENVIANDO só é perguntado depois disso: antes, quem pediu ainda pode estar no meio. */
const ESPERA_PARA_RECONCILIAR_MS = 5 * MINUTO;
/** A mesma OS não é consultada duas vezes em 2 min (o Omie não repete consulta em 60 s). */
const ESPERA_ENTRE_CONSULTAS_MS = 2 * MINUTO;
const JANELA_DE_ACOMPANHAMENTO_MS = 7 * 24 * 60 * MINUTO;
/**
 * Faturada "N" sem RPS depois disso: o faturamento não saiu. Folgado de
 * propósito — dar por recusada uma nota que a prefeitura ainda vai autorizar
 * tira a emissão do acompanhamento e oferece cancelar a OS.
 */
const PRAZO_DO_FATURAMENTO_MS = 6 * 60 * MINUTO;
/** ENVIANDO sem resposta conclusiva depois disso: desiste e manda conferir no Omie. */
const PRAZO_DA_CONFIRMACAO_MS = 24 * 60 * MINUTO;
const POR_RODADA = 50;

let acompanhando = false;

type LinhaAcompanhada = {
  id: string;
  tenantId: string;
  companyId: string;
  estado: EstadoDaEmissao;
  competencia: string;
  tomadorNome: string;
  tomadorDocumento: string | null;
  valor: Prisma.Decimal;
  omieCodigoOS: string | null;
  omieNumeroOS: string | null;
  ambiente: string | null;
  faturadaEm: Date | null;
  mensagem: string | null;
  createdAt: Date;
};

async function acompanharUma(e: LinhaAcompanhada, cred: CredencialOmie, agora: Date): Promise<"autorizadas" | "rejeitadas" | "canceladas" | "seguem"> {
  const prisma = getPrisma();
  const idade = agora.getTime() - e.createdAt.getTime();
  const consulta = { ultimaConsultaEm: agora, consultas: { increment: 1 } };
  const gravar = (data: Prisma.OmieEmissaoUpdateInput) => prisma.omieEmissao.update({ where: { id: e.id }, data: { ...consulta, ...data } });

  let status: StatusDaOS;
  try {
    // Sem o código da OS (a resposta do IncluirOS se perdeu), pergunta pelo
    // código de integração, que é o id desta linha.
    const param = e.omieCodigoOS ? { nCodOS: Number(e.omieCodigoOS) } : { cCodIntOS: e.id };
    status = lerStatusDaOS(await chamarOmieNaFila(cred, "servicos/os", "StatusOS", param));
  } catch (err) {
    if (e.estado === "ENVIANDO" && ehNaoEncontrada(err)) {
      await gravar({ estado: "REJEITADA", mensagem: `O Omie não registrou a OS — nada foi emitido. Resposta do Omie: ${mensagemDe(err)}` });
      return "rejeitadas";
    }
    if (e.estado === "ENVIANDO" && idade > PRAZO_DA_CONFIRMACAO_MS) {
      await gravar({
        estado: "REJEITADA",
        mensagem: `Sem confirmação do Omie em 24 horas (${mensagemDe(err)}). Confira na tela do Omie se existe OS com o código de integração ${e.id}; se existir, cancele por lá.`,
      });
      return "rejeitadas";
    }
    throw err;
  }

  const doOmie = {
    omieCodigoOS: e.omieCodigoOS ?? status.codigoOS,
    omieNumeroOS: e.omieNumeroOS ?? status.numeroOS,
    ambiente: status.ambiente ?? e.ambiente,
    faturadaEm: status.faturadaEm ?? e.faturadaEm,
  };
  const numeroDaOS = doOmie.omieNumeroOS ?? doOmie.omieCodigoOS ?? "?";

  // Resposta sem OS nenhuma: o Omie não a tem, e nada foi emitido.
  if (e.estado === "ENVIANDO" && !doOmie.omieCodigoOS) {
    await gravar({ estado: "REJEITADA", mensagem: "O Omie não devolveu OS para o código de integração desta emissão — nada foi emitido." });
    return "rejeitadas";
  }

  // A OS existe, mas a resposta do IncluirOS se perdeu antes do pedido de
  // faturamento: nada foi emitido. Faturar sozinho, sem ninguém olhando, não.
  if (e.estado === "ENVIANDO" && status.faturada !== true && status.rps.length === 0 && status.cancelada !== true) {
    await gravar({
      ...doOmie,
      estado: "REJEITADA",
      mensagem: `A OS ${numeroDaOS} foi criada no Omie, mas o pedido de faturamento não chegou (a resposta do Omie se perdeu no meio). Nada foi emitido: fature pela tela do Omie, ou cancele a OS aqui.`,
    });
    return "rejeitadas";
  }

  const d = desfechoDoStatus(status);
  if (d.estado === "AUTORIZADA") {
    const acervo = await gravarNoAcervo(e, d.nfse, status, agora);
    const mensagem = [d.mensagem, acervo.aviso].filter(Boolean).join("\n") || null;
    await gravar({
      ...doOmie,
      estado: "AUTORIZADA",
      nfseNumero: d.nfse.numero,
      nfseCodigoVerificacao: d.nfse.codigoVerificacao,
      nfseCnpjPrestador: d.nfse.cnpjPrestador,
      nfseUrl: d.nfse.url,
      mensagem,
    });
    if (acervo.fiscalDocumentId) {
      try {
        await prisma.omieEmissao.update({ where: { id: e.id }, data: { fiscalDocument: { connect: { id: acervo.fiscalDocumentId } } } });
      } catch (err) {
        // A linha do acervo já é de outra emissão (unique): fica sem o vínculo.
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    return "autorizadas";
  }
  if (d.estado === "REJEITADA") {
    await gravar({ ...doOmie, estado: "REJEITADA", mensagem: d.mensagem });
    return "rejeitadas";
  }
  if (d.estado === "CANCELADA") {
    await gravar({ ...doOmie, estado: "CANCELADA", mensagem: d.mensagem, canceladaEm: agora });
    return "canceladas";
  }
  // Só "N" explícito conta como não faturada: campo ausente na resposta real
  // não pode virar recusa.
  if (status.faturada === false && status.rps.length === 0 && idade > PRAZO_DO_FATURAMENTO_MS) {
    await gravar({
      ...doOmie,
      estado: "REJEITADA",
      mensagem: `O Omie não faturou a OS ${numeroDaOS} em 6 horas. A OS ficou criada no Omie, sem nota: fature pela tela do Omie, ou cancele a OS aqui.`,
    });
    return "rejeitadas";
  }
  await gravar({ ...doOmie, estado: "PROCESSANDO", mensagem: d.mensagem ?? e.mensagem });
  return "seguem";
}

/**
 * Uma rodada do cron: as emissões em ENVIANDO (paradas há mais de 5 min) e em
 * PROCESSANDO dos últimos 7 dias, uma de cada vez. Conta com bloqueio do Omie
 * para nesta rodada; as outras seguem.
 */
export async function acompanharEmissoes(agora = new Date()): Promise<ResumoDoAcompanhamento> {
  const resumo: ResumoDoAcompanhamento = { consultadas: 0, autorizadas: 0, rejeitadas: 0, canceladas: 0, seguem: 0, falhas: [] };
  if (acompanhando) {
    resumo.falhas.push({ emissaoId: "-", erro: "Já há um acompanhamento em andamento." });
    return resumo;
  }
  acompanhando = true;
  try {
    const prisma = getPrisma();
    const linhas = await prisma.omieEmissao.findMany({
      where: {
        createdAt: { gte: new Date(agora.getTime() - JANELA_DE_ACOMPANHAMENTO_MS) },
        OR: [{ estado: "PROCESSANDO" }, { estado: "ENVIANDO", createdAt: { lte: new Date(agora.getTime() - ESPERA_PARA_RECONCILIAR_MS) } }],
        AND: [{ OR: [{ ultimaConsultaEm: null }, { ultimaConsultaEm: { lte: new Date(agora.getTime() - ESPERA_ENTRE_CONSULTAS_MS) } }] }],
      },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        estado: true,
        competencia: true,
        tomadorNome: true,
        tomadorDocumento: true,
        valor: true,
        omieCodigoOS: true,
        omieNumeroOS: true,
        ambiente: true,
        faturadaEm: true,
        mensagem: true,
        createdAt: true,
      },
      // A consultada há mais tempo primeiro (nulo vem antes no MySQL).
      orderBy: [{ ultimaConsultaEm: "asc" }, { createdAt: "asc" }],
      take: POR_RODADA,
    });

    const contas = new Map<string, { ok: true; conta: ContaDaEmpresa } | { ok: false; erro: string }>();
    const emPausa = new Set<string>();
    for (const e of linhas) {
      const chave = `${e.tenantId}:${e.companyId}`;
      if (!contas.has(chave)) contas.set(chave, await contaDaEmpresa(e.tenantId, e.companyId));
      const c = contas.get(chave)!;
      if (!c.ok) {
        resumo.falhas.push({ emissaoId: e.id, erro: c.erro });
        continue;
      }
      const conta = idDaConta(c.conta.cred);
      if (emPausa.has(conta)) continue;
      resumo.consultadas++;
      try {
        resumo[await acompanharUma(e, c.conta.cred, agora)]++;
      } catch (err) {
        if (pausaPedidaPeloOmie(err) || (err instanceof ErroDoOmie && err.codigo === "PAUSA")) emPausa.add(conta);
        resumo.falhas.push({ emissaoId: e.id, erro: mensagemDe(err) });
        await prisma.omieEmissao.update({ where: { id: e.id }, data: { ultimaConsultaEm: agora, consultas: { increment: 1 } } });
      }
    }
    return resumo;
  } finally {
    acompanhando = false;
  }
}

// ─── A lista da tela ────────────────────────────────────────────────────────

export type EmissaoNaTela = {
  id: string;
  estado: EstadoDaEmissao;
  tomadorNome: string;
  tomadorDocumento: string | null;
  servicoDescricao: string;
  valor: string;
  competencia: string;
  descricao: string | null;
  pedidoPor: string;
  pedidoEm: Date;
  omieNumeroOS: string | null;
  nfseNumero: string | null;
  nfseUrl: string | null;
  ambiente: string | null;
  mensagem: string | null;
  canceladaEm: Date | null;
  canceladaPor: string | null;
  podeCancelar: boolean;
  cancelaNaPrefeitura: boolean;
};

export async function listarEmissoes(tenantId: string, companyId: string, limite = 100): Promise<EmissaoNaTela[]> {
  const prisma = getPrisma();
  const linhas = await prisma.omieEmissao.findMany({
    where: { tenantId, companyId },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  const ids = [...new Set(linhas.flatMap((l) => [l.pedidoPorId, l.canceladaPorId]).filter((v): v is string => Boolean(v)))];
  const pessoas = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nome = new Map(pessoas.map((u) => [u.id, u.name]));
  return linhas.map((l) => {
    const como = comoCancelar(l);
    return {
      id: l.id,
      estado: l.estado,
      tomadorNome: l.tomadorNome,
      tomadorDocumento: l.tomadorDocumento,
      servicoDescricao: l.servicoDescricao,
      valor: l.valor.toString(),
      competencia: l.competencia,
      descricao: l.descricao,
      pedidoPor: nome.get(l.pedidoPorId) ?? "—",
      pedidoEm: l.createdAt,
      omieNumeroOS: l.omieNumeroOS ?? l.omieCodigoOS,
      nfseNumero: l.nfseNumero,
      nfseUrl: l.nfseUrl,
      ambiente: l.ambiente,
      mensagem: l.mensagem,
      canceladaEm: l.canceladaEm,
      canceladaPor: l.canceladaPorId ? (nome.get(l.canceladaPorId) ?? "—") : null,
      podeCancelar: como.pode,
      cancelaNaPrefeitura: como.pode && como.naPrefeitura,
    };
  });
}
