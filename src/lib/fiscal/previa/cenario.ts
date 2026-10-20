import { z } from "zod";
import { geracao, MODOS_EXECUCAO, parametrosExecucaoSchema, type ParametrosExecucao } from "./execucao";
import { ultimasVersoesDoContexto } from "./vigencia";

// O cenário tem seu próprio contrato: nunca recebe entidades do acervo real.
const contextoSchema = z.object({ empresaId: z.string(), estabelecimentoId: z.string(), competencia: z.string() });
const documentoSchema = contextoSchema.extend({
  id: z.string(), numero: z.string(), tipo: z.enum(["NF-e", "NFC-e", "CT-e", "NFS-e", "Contrato", "Recibo", "RPA", "Fatura"]),
  participante: z.string(), descricao: z.string(), sentido: z.enum(["Entrada", "Saída"]), valor: z.number().nonnegative(),
  cfop: z.string(), ncm: z.string(), cst: z.string(), destino: z.string(), credito: z.boolean(),
  estado: z.enum(["Pendente", "Classificado", "Rejeitado"]), motivo: z.string(), xml: z.boolean(),
});
const periodoSchema = contextoSchema.extend({ revisao: z.number().int(), apurado: z.boolean(), fechado: z.boolean() });
const empresaSchema = z.object({
  id: z.string(), nome: z.string(), regime: z.string(),
  estabelecimentos: z.array(z.object({ id: z.string(), nome: z.string(), uf: z.string(), cnpj: z.string() })).min(1),
});
const arquivoSchema = z.object({
  id: z.string(), contexto: contextoSchema, tipo: z.enum(["ICMS/IPI", "Contribuições"]), versao: z.number(), nome: z.string(),
  revisao: z.string(), criadoEm: z.string(), validacao: z.enum(["Não validado", "Aprovado", "Com pendências"]),
  erros: z.array(z.string()), entregue: z.boolean(), protocolo: z.string(), dominio: z.boolean(),
  tipoSped: z.enum(["0", "1"]).optional(), execucaoId: z.string().optional(), saidaSolicitada: z.string().optional(),
  resumo: z.object({ entradas: z.number(), saidas: z.number(), creditavel: z.number(), icms: z.number(), ipi: z.number(), pis: z.number(), cofins: z.number(), pendentes: z.number(), rejeitados: z.number() }).optional(),
});
const execucaoSchema = z.object({
  id: z.string(), contexto: contextoSchema, acao: z.string(), estado: z.enum(["Na fila", "Executando", "Concluída", "Erro", "Cancelada"]),
  criadoEm: z.string(), log: z.array(z.string()),
  parametros: parametrosExecucaoSchema.optional(), iniciadoEm: z.string().optional(), concluidoEm: z.string().optional(),
  tentativaDe: z.string().optional(), arquivoIds: z.array(z.string()).optional(), documentos: z.number().int().optional(),
});
const regraSchema = z.object({ id: z.string(), cfop: z.string(), destino: z.string(), fonte: z.string(), debito: z.string(), credito: z.string(), historico: z.string() });
const ajusteSchema = z.object({ id: z.string(), contexto: contextoSchema, imposto: z.enum(["ICMS/IPI", "Contribuições"]), codigo: z.string(), descricao: z.string(), valor: z.number(), efeito: z.enum(["Débito", "Crédito"]), obrigacao: z.string() });
const parametrosSchema = z.object({ icms: z.number().min(0).max(100), ipi: z.number().min(0).max(100), pis: z.number().min(0).max(100), cofins: z.number().min(0).max(100) });
export const cenarioSchema = z.object({
  versao: z.literal(1), empresas: z.array(empresaSchema).min(1), contexto: contextoSchema,
  documentos: z.array(documentoSchema), periodos: z.array(periodoSchema), arquivos: z.array(arquivoSchema),
  execucoes: z.array(execucaoSchema), regras: z.array(regraSchema), ajustes: z.array(ajusteSchema),
  parametros: z.record(z.string(), parametrosSchema),
  importacoes: z.array(z.object({ id: z.string(), contexto: contextoSchema, criadoEm: z.string(), aceitos: z.number(), rejeitados: z.number(), origem: z.string() })),
  confrontos: z.array(z.object({ id: z.string(), contexto: contextoSchema, documentoId: z.string(), estado: z.enum(["Sem nota", "Conciliado"]), valor: z.number() })),
  atividades: z.array(z.object({ id: z.string(), contexto: contextoSchema, criadoEm: z.string(), mensagem: z.string() })),
});
export type Cenario = z.infer<typeof cenarioSchema>;
export type ContextoFiscal = z.infer<typeof contextoSchema>;
export type DocumentoTeste = z.infer<typeof documentoSchema>;
export type ArquivoTeste = z.infer<typeof arquivoSchema>;
export type ExecucaoTeste = z.infer<typeof execucaoSchema>;
export type Imposto = ArquivoTeste["tipo"];
export const COMPETENCIAS = ["2026-09", "2026-10"];
// NFS-e, Contratos e recibos e Quarentena (documentos) e Fila e Erros
// (execuções) deixaram de ser abas em 15/10/2026: recortavam a mesma lista e
// viraram filtro dela (`grupo`, `estado`). Os endereços antigos redirecionam.
export const PAGINAS_FISCAIS = [
  { pagina: "painel", modulo: "fiscal_painel", caminho: "/fiscal", titulo: "Painel fiscal", descricao: "Do documento à entrega: acompanhe o trabalho da competência.", abas: [] },
  { pagina: "documentos", modulo: "fiscal_acervo", caminho: "/fiscal/documentos", titulo: "Documentos e importações", descricao: "Reúna as fontes e confira o que falta antes de apurar.", abas: [["acervo", "Acervo"], ["envio", "Enviar documentos"], ["importacoes", "Importações"], ["cobertura", "Cobertura"]] },
  { pagina: "classificacao", modulo: "fiscal_classificacao", caminho: "/fiscal/classificacao", titulo: "Classificação", descricao: "Revise destinação e crédito, por item ou em lote.", abas: [["produtos", "Produtos"], ["apoio", "Contratos e recibos"], ["decisoes", "Decisões registradas"]] },
  { pagina: "operacao", modulo: "fiscal_operacao", caminho: "/fiscal/operacao", titulo: "Executar", descricao: "Prepare extrações e gerações e acompanhe cada execução de teste.", abas: [["executar", "Executar"], ["historico", "Histórico"]] },
  { pagina: "icms-ipi", modulo: "fiscal_icms_ipi", caminho: "/fiscal/icms-ipi", titulo: "ICMS e IPI", descricao: "Confira a apuração e os ajustes do estabelecimento.", abas: [["apuracao", "Apuração"], ["demonstrativo", "Demonstrativo"], ["ajustes", "Ajustes"], ["dcip-dime", "DCIP e DIME"]] },
  { pagina: "contribuicoes", modulo: "fiscal_contribuicoes", caminho: "/fiscal/contribuicoes", titulo: "PIS e COFINS", descricao: "Confira a apuração, os ajustes e o fechamento do EFD Contribuições.", abas: [["fechamento", "Fechamento"], ["ajustes", "Ajustes"], ["decisoes", "Decisões por registro"], ["demonstrativo", "Demonstrativo"], ["sped", "SPED Contribuições"]] },
  { pagina: "entregas", modulo: "fiscal_entregas", caminho: "/fiscal/entregas", titulo: "SPED gerados", descricao: "Consulte as versões, a validação e as entregas dos arquivos de teste.", abas: [["arquivos", "SPED gerados"], ["validacao", "Validação"], ["entregas", "Entregas"]] },
  { pagina: "conferencia", modulo: "fiscal_conferencia", caminho: "/fiscal/conferencia", titulo: "Conferência fiscal", descricao: "Compare documentos e pagamentos antes de concluir.", abas: [["previa", "Prévia financeira"], ["confronto", "Confronto de documentos"]] },
  { pagina: "configuracoes", modulo: "fiscal_configuracoes", caminho: "/fiscal/configuracoes", titulo: "Configurações fiscais", descricao: "Confira os parâmetros e consulte as regras fiscais de teste.", abas: [["parametros", "Parâmetros"], ["depara", "De-Para CFOP"], ["regras", "Regras fiscais"]] },
] as const;
export type PaginaFiscal = typeof PAGINAS_FISCAIS[number]["pagina"];

export function mesmoEscopo(item: ContextoFiscal, contexto: ContextoFiscal): boolean {
  return item.empresaId === contexto.empresaId && item.competencia === contexto.competencia && (!contexto.estabelecimentoId || item.estabelecimentoId === contexto.estabelecimentoId);
}
export function documentosDoContexto(cenario: Cenario, contexto = cenario.contexto) {
  return cenario.documentos.filter((d) => mesmoEscopo(d, contexto));
}
export function assinaturaDaRevisao(cenario: Cenario, contexto: ContextoFiscal) {
  return cenario.periodos.filter((p) => mesmoEscopo(p, contexto)).map((p) => `${p.estabelecimentoId}:${p.revisao}`).sort().join("|");
}
export function precisaRevisar(cenario: Cenario, arquivo: ArquivoTeste) {
  return assinaturaDaRevisao(cenario, arquivo.contexto) !== arquivo.revisao;
}
export function chaveDoCenario(tenantId: string, userId: string) {
  return `connect41:fiscal:previa:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;
}
export function lerCenario(bruto: string | null): Cenario | null {
  try {
    const resultado = cenarioSchema.safeParse(JSON.parse(bruto ?? "null"));
    if (!resultado.success) return null;
    const s = resultado.data;
    const empresa = s.empresas.find((e) => e.id === s.contexto.empresaId);
    if (!empresa || !COMPETENCIAS.includes(s.contexto.competencia) || (s.contexto.estabelecimentoId && !empresa.estabelecimentos.some((e) => e.id === s.contexto.estabelecimentoId))) return null;
    const valido = (c: ContextoFiscal, todos = false) => {
      const e = s.empresas.find((e) => e.id === c.empresaId);
      return !!e && COMPETENCIAS.includes(c.competencia) && ((todos && c.estabelecimentoId === "") || e.estabelecimentos.some((f) => f.id === c.estabelecimentoId));
    };
    if (s.empresas.some((e) => !s.parametros[e.id])) return null;
    if (s.documentos.some((d) => !valido(d)) || s.periodos.some((p) => !valido(p))) return null;
    if ([...s.arquivos, ...s.execucoes, ...s.ajustes, ...s.importacoes, ...s.confrontos, ...s.atividades].some((i) => !valido(i.contexto, true))) return null;
    if (s.empresas.some((e) => e.estabelecimentos.some((f) => COMPETENCIAS.some((competencia) => !s.periodos.some((p) => p.empresaId === e.id && p.estabelecimentoId === f.id && p.competencia === competencia))))) return null;
    return s;
  } catch { return null; }
}

export function criarCenario(): Cenario {
  const empresas: Cenario["empresas"] = [
    { id: "aurora", nome: "Aurora Comércio · fictícia", regime: "Lucro real", estabelecimentos: [{ id: "aurora-pr", nome: "Matriz · Curitiba", uf: "PR", cnpj: "00.000.000/0001-00" }, { id: "aurora-sc", nome: "Filial · Joinville", uf: "SC", cnpj: "00.000.000/0002-00" }] },
    { id: "horizonte", nome: "Horizonte Serviços · fictícia", regime: "Lucro presumido", estabelecimentos: [{ id: "horizonte-sp", nome: "Matriz · São Paulo", uf: "SP", cnpj: "00.000.001/0001-00" }] },
    { id: "rota", nome: "Rota Transportes · fictícia", regime: "Lucro real", estabelecimentos: [{ id: "rota-rs", nome: "Matriz · Porto Alegre", uf: "RS", cnpj: "00.000.002/0001-00" }, { id: "rota-sc", nome: "Filial · Itajaí", uf: "SC", cnpj: "00.000.002/0002-00" }] },
  ];
  const documentos: DocumentoTeste[] = [];
  const periodos: Cenario["periodos"] = [];
  empresas.forEach((empresa) => empresa.estabelecimentos.forEach((estabelecimento) => COMPETENCIAS.forEach((competencia) => {
    const contexto = { empresaId: empresa.id, estabelecimentoId: estabelecimento.id, competencia };
    periodos.push({ ...contexto, revisao: 1, apurado: competencia === "2026-09", fechado: competencia === "2026-09" });
    (["NF-e", "NF-e", "NFC-e", "CT-e", "NFS-e", "Contrato", "Recibo", "RPA", "Fatura", "NF-e"] as const).forEach((tipo, i) => {
      documentos.push({ ...contexto, id: `${estabelecimento.id}-${competencia}-${i}`, numero: String(1200 + i), tipo,
        participante: ["Fornecedor Modelo", "Comercial Exemplo", "Cliente Demonstração", "Transportadora Exemplo", "Serviços Modelo"][i % 5],
        descricao: ["Mercadorias para revenda", "Material de escritório", "Venda de produtos", "Frete de mercadorias", "Serviço de manutenção", "Aluguel de imóvel", "Recibo de locação", "Serviço autônomo", "Fatura de serviços", "XML incompleto"][i],
        sentido: i === 2 ? "Saída" : "Entrada", valor: [12480, 890, 28500, 1750, 2300, 3200, 980, 1200, 460, 650][i],
        cfop: i === 2 ? "5102" : i === 3 ? "1353" : i < 3 ? "1102" : "", ncm: i < 3 ? "84713012" : "", cst: "00",
        destino: i === 0 ? "Revenda" : i === 3 ? "Insumo" : "Uso e consumo", credito: i === 0 || i === 3,
        estado: competencia === "2026-09" ? "Classificado" : i === 9 ? "Rejeitado" : i === 1 || i === 5 || i === 7 ? "Pendente" : "Classificado",
        motivo: i === 9 && competencia !== "2026-09" ? "Chave ausente no XML de exemplo" : "", xml: (i < 5 && i !== 4) || (i === 9 && competencia === "2026-09"),
      });
    });
  })));
  const estado: Cenario = { versao: 1, empresas, contexto: { empresaId: "aurora", estabelecimentoId: "aurora-pr", competencia: "2026-10" }, documentos, periodos,
    arquivos: [], execucoes: [], ajustes: [], importacoes: [], confrontos: [], atividades: [],
    parametros: Object.fromEntries(empresas.map((e) => [e.id, { icms: 18, ipi: 5, pis: 1.65, cofins: 7.6 }])),
    regras: [
      { id: "r1", cfop: "1102", destino: "Revenda", fonte: "Exemplo didático · revisão da equipe fiscal", debito: "1.1.3.01", credito: "2.1.1.01", historico: "Compra de mercadorias" },
      { id: "r2", cfop: "1353", destino: "Insumo", fonte: "Exemplo didático · prestação de transporte", debito: "3.2.1.02", credito: "2.1.1.01", historico: "Frete sobre compras" },
      { id: "r3", cfop: "5102", destino: "Revenda", fonte: "Exemplo didático · saída de mercadorias", debito: "1.1.2.01", credito: "4.1.1.01", historico: "Receita de vendas" },
    ],
  };
  const contextos = [estado.contexto, { empresaId: "aurora", estabelecimentoId: "aurora-pr", competencia: "2026-09" }, { empresaId: "aurora", estabelecimentoId: "aurora-sc", competencia: "2026-09" }];
  contextos.forEach((contexto, i) => {
    const arquivo: ArquivoTeste = { id: `arquivo-inicial-${i}`, contexto, tipo: i === 2 ? "Contribuições" : "ICMS/IPI", versao: 1,
      nome: `EXEMPLO_${i === 2 ? "contribuicoes" : "sped"}_${contexto.competencia}_${contexto.estabelecimentoId}_v1.txt`,
      revisao: assinaturaDaRevisao(estado, contexto), criadoEm: "2026-10-01T12:00:00.000Z", validacao: i === 0 ? "Não validado" : "Aprovado", erros: [], entregue: i === 1, protocolo: i === 1 ? "TESTE-202609-001" : "", dominio: false };
    estado.arquivos.push(arquivo);
  });
  estado.execucoes.push({ id: "erro-inicial", contexto: estado.contexto, acao: "Extração de exemplo", estado: "Erro", criadoEm: "2026-10-01T12:00:00.000Z", log: ["Lote de exemplo recebido.", "Falha simulada: XML incompleto. Use Reprocessar para testar a recuperação."] });
  return estado;
}

export type AcaoFiscal =
  | { tipo: "contexto"; contexto: ContextoFiscal }
  | { tipo: "importar"; origem: string }
  | { tipo: "classificar"; ids: string[]; destino: string; credito: boolean; cst: string }
  | { tipo: "recuperar"; id: string }
  | { tipo: "apurar" | "fechar" }
  | { tipo: "ajuste"; imposto: Imposto; codigo: string; descricao: string; valor: number; efeito: "Débito" | "Crédito"; obrigacao: string }
  | { tipo: "remover-ajuste"; id: string }
  | { tipo: "parametros"; parametros: Cenario["parametros"][string] }
  | { tipo: "empresa"; nome: string; regime: string }
  | { tipo: "regra"; regra: Cenario["regras"][number] }
  | { tipo: "gerar"; imposto: Imposto }
  | { tipo: "validar" | "entregar"; id: string }
  | { tipo: "enfileirar"; imposto: Imposto; falhar: boolean }
  | { tipo: "solicitar-execucao"; parametros: ParametrosExecucao }
  | { tipo: "processar" | "cancelar" | "reprocessar" | "iniciar-execucao" | "concluir-execucao" | "falhar-execucao"; id: string }
  | { tipo: "confrontar" }
  | { tipo: "conciliar"; id: string };

function alterarPeriodos(s: Cenario, contexto: ContextoFiscal) {
  s.periodos.filter((p) => mesmoEscopo(p, contexto)).forEach((p) => { p.revisao += 1; p.apurado = false; p.fechado = false; });
}
function adicionarArquivo(s: Cenario, contexto: ContextoFiscal, imposto: Imposto, id: string, agora: string, execucao?: ExecucaoTeste) {
  const versao = 1 + Math.max(0, ...s.arquivos.filter((a) => a.tipo === imposto && a.contexto.empresaId === contexto.empresaId && a.contexto.estabelecimentoId === contexto.estabelecimentoId && a.contexto.competencia === contexto.competencia && !a.dominio).map((a) => a.versao));
  s.arquivos.unshift({ id, contexto: { ...contexto }, tipo: imposto, versao, nome: `EXEMPLO_${imposto === "ICMS/IPI" ? "sped" : "contribuicoes"}_${contexto.competencia}_${contexto.estabelecimentoId || contexto.empresaId}_v${versao}.txt`, revisao: assinaturaDaRevisao(s, contexto), criadoEm: agora, validacao: "Não validado", erros: [], entregue: false, protocolo: "", dominio: false,
    resumo: totaisDoContexto(s, contexto), ...(execucao && { execucaoId: execucao.id, tipoSped: execucao.parametros?.tipoSped, saidaSolicitada: execucao.parametros?.saida }) });
}

export function execucaoNoContexto(e: ExecucaoTeste, contexto: ContextoFiscal) {
  return e.contexto.empresaId === contexto.empresaId
    && (!contexto.estabelecimentoId || !e.contexto.estabelecimentoId || contexto.estabelecimentoId === e.contexto.estabelecimentoId)
    && (e.parametros ? e.parametros.dataIni.slice(0, 7) <= contexto.competencia && e.parametros.dataFim.slice(0, 7) >= contexto.competencia : e.contexto.competencia === contexto.competencia);
}

export function textoDoArquivoTeste(a: ArquivoTeste) {
  return `AMOSTRA DE TESTE - SEM VALIDADE FISCAL\nDados fictícios. Não importar no PVA.\n\nArquivo: ${a.nome}\nObrigação: ${a.tipo}\nCompetência: ${a.contexto.competencia}\nVersão: ${a.versao}\nTipo: ${a.tipoSped === "0" ? "Original" : a.tipoSped === "1" ? "Substituto" : "Não registrado"}\n\n${a.resumo ? JSON.stringify(a.resumo, null, 2) : "Resumo histórico indisponível."}\n`;
}

/** Transições puras permitem verificar o fluxo sem servidor, arquivo ou cálculo fiscal real. */
export function executarAcao(cenario: Cenario, acao: AcaoFiscal, contexto = cenario.contexto, agora = new Date().toISOString(), id = globalThis.crypto.randomUUID()): { cenario: Cenario; mensagem: string; erro?: boolean } {
  const s = structuredClone(cenario);
  const docs = documentosDoContexto(s, contexto);
  const recusar = (mensagem: string) => ({ cenario, mensagem, erro: true });
  let mensagem = "";
  if (acao.tipo === "contexto") {
    const empresa = s.empresas.find((e) => e.id === acao.contexto.empresaId);
    if (!empresa || !COMPETENCIAS.includes(acao.contexto.competencia) || (acao.contexto.estabelecimentoId && !empresa.estabelecimentos.some((e) => e.id === acao.contexto.estabelecimentoId))) return recusar("Selecione uma empresa e um estabelecimento do cenário.");
    s.contexto = acao.contexto;
    return { cenario: s, mensagem: "Filtro atualizado." };
  }
  if (acao.tipo === "importar") {
    const estabelecimentoId = contexto.estabelecimentoId || s.empresas.find((e) => e.id === contexto.empresaId)!.estabelecimentos[0].id;
    const base = { ...contexto, estabelecimentoId };
    const suporte = acao.origem.toLowerCase().includes("contratos");
    const modelos = s.documentos.filter((d) => mesmoEscopo(d, base) && (suporte ? ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo) : !["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo))).slice(0, suporte ? 4 : 5);
    if (suporte) modelos.push(modelos[0]);
    modelos.forEach((d, i) => s.documentos.unshift({ ...d, id: `${id}-${i}`, numero: `T${s.documentos.length + 1}`, estado: i === 4 ? "Rejeitado" : "Pendente", motivo: i === 4 ? "Formato incompleto no lote de teste" : "" }));
    s.importacoes.unshift({ id, contexto: base, criadoEm: agora, aceitos: 4, rejeitados: 1, origem: acao.origem });
    alterarPeriodos(s, base);
    mensagem = "Lote de exemplo importado: 4 documentos recebidos e 1 em quarentena.";
  } else if (acao.tipo === "classificar") {
    const selecionados = docs.filter((d) => acao.ids.includes(d.id) && d.estado !== "Rejeitado");
    if (!selecionados.length) return recusar("Selecione documentos disponíveis para classificação.");
    selecionados.forEach((d) => { d.estado = "Classificado"; d.destino = acao.destino; d.credito = acao.credito; d.cst = acao.cst; });
    const filiais = new Set(selecionados.map((d) => d.estabelecimentoId));
    filiais.forEach((estabelecimentoId) => alterarPeriodos(s, { ...contexto, estabelecimentoId }));
    mensagem = `${selecionados.length} documento(s) classificados. Apuração e arquivos sinalizados para revisão.`;
  } else if (acao.tipo === "recuperar") {
    const doc = docs.find((d) => d.id === acao.id && d.estado === "Rejeitado");
    if (!doc) return recusar("Documento indisponível neste filtro.");
    doc.estado = "Pendente"; doc.motivo = ""; doc.xml = true;
    alterarPeriodos(s, doc);
    mensagem = "Documento recuperado no cenário de teste e enviado para classificação.";
  } else if (acao.tipo === "apurar" || acao.tipo === "fechar") {
    if (docs.some((d) => d.estado !== "Classificado")) return recusar("Resolva a quarentena e classifique os documentos desta competência primeiro.");
    const periodos = s.periodos.filter((p) => mesmoEscopo(p, contexto));
    if (acao.tipo === "fechar" && periodos.some((p) => !p.apurado)) return recusar("Simule a apuração antes de fechar a competência.");
    periodos.forEach((p) => { p.apurado = true; if (acao.tipo === "fechar") p.fechado = true; });
    mensagem = acao.tipo === "fechar" ? "Competência fechada no cenário de teste." : "Apuração de teste atualizada. Confira os demonstrativos.";
  } else if (acao.tipo === "ajuste") {
    if (!Number.isFinite(acao.valor) || acao.valor <= 0 || !acao.codigo.trim() || !acao.descricao.trim()) return recusar("Informe código, descrição e um valor maior que zero.");
    if (!contexto.estabelecimentoId) return recusar("Escolha um estabelecimento para lançar o ajuste.");
    s.ajustes.unshift({ ...acao, id, contexto: { ...contexto } });
    alterarPeriodos(s, contexto);
    mensagem = "Ajuste de teste registrado; apuração precisa ser atualizada.";
  } else if (acao.tipo === "remover-ajuste") {
    const ajuste = s.ajustes.find((a) => a.id === acao.id && mesmoEscopo(a.contexto, contexto));
    if (!ajuste) return recusar("Ajuste indisponível neste filtro.");
    s.ajustes = s.ajustes.filter((a) => a.id !== acao.id); alterarPeriodos(s, ajuste.contexto);
    mensagem = "Ajuste removido do cenário de teste.";
  } else if (acao.tipo === "parametros") {
    if (!parametrosSchema.safeParse(acao.parametros).success) return recusar("As alíquotas de teste devem estar entre 0 e 100.");
    s.parametros[contexto.empresaId] = acao.parametros;
    COMPETENCIAS.forEach((competencia) => alterarPeriodos(s, { ...contexto, competencia, estabelecimentoId: "" }));
    mensagem = "Parâmetros da empresa atualizados para todas as competências de teste.";
  } else if (acao.tipo === "empresa") {
    if (!acao.nome.trim()) return recusar("Informe um nome para a empresa de teste.");
    const empresa = s.empresas.find((e) => e.id === contexto.empresaId)!;
    empresa.nome = acao.nome.trim(); empresa.regime = acao.regime;
    mensagem = "Cadastro fictício atualizado no banco local.";
  } else if (acao.tipo === "regra") {
    if (!regraSchema.safeParse(acao.regra).success || !acao.regra.fonte.trim()) return recusar("Informe a fonte da regra de teste.");
    const index = s.regras.findIndex((r) => r.id === acao.regra.id);
    if (index < 0) return recusar("Regra não encontrada.");
    s.regras[index] = acao.regra;
    s.periodos.forEach((p) => { p.revisao += 1; p.apurado = false; p.fechado = false; });
    mensagem = "Regra compartilhada atualizada; cenários sinalizados para revisão.";
  } else if (acao.tipo === "solicitar-execucao") {
    const validado = parametrosExecucaoSchema.safeParse(acao.parametros);
    if (!validado.success) return recusar(validado.error.issues[0].message);
    const p = validado.data;
    if (!COMPETENCIAS.includes(p.dataIni.slice(0, 7)) || !COMPETENCIAS.includes(p.dataFim.slice(0, 7))) return recusar("Use as competências disponíveis no cenário de teste: setembro e outubro de 2026.");
    const base = { ...contexto, competencia: p.dataIni.slice(0, 7), ...(p.modo === "sped_contribuicoes" && { estabelecimentoId: "" }) };
    if (s.execucoes.some((e) => ["Na fila", "Executando"].includes(e.estado) && e.contexto.empresaId === base.empresaId && e.contexto.estabelecimentoId === base.estabelecimentoId && e.parametros && JSON.stringify(e.parametros) === JSON.stringify(p))) return recusar("Já existe um pedido igual na fila ou em execução. Consulte a fila antes de repetir.");
    s.execucoes.unshift({ id, contexto: base, acao: MODOS_EXECUCAO[p.modo], parametros: p, estado: "Na fila", criadoEm: agora, log: [`${agora} · Pedido de teste recebido.`, "Use os controles de simulação para iniciar e concluir. Nenhum agente real será acionado."] });
    mensagem = "Pedido adicionado à fila de simulação.";
  } else if (["iniciar-execucao", "concluir-execucao", "falhar-execucao"].includes(acao.tipo) && "id" in acao) {
    const e = s.execucoes.find((item) => item.id === acao.id && execucaoNoContexto(item, contexto));
    if (!e) return recusar("Execução indisponível neste contexto.");
    if (acao.tipo === "iniciar-execucao") {
      if (e.estado !== "Na fila") return recusar("Somente um pedido na fila pode ser iniciado.");
      e.estado = "Executando"; e.iniciadoEm = agora; e.log.push(`${agora} · Simulação iniciada.`);
      mensagem = "Execução de teste iniciada.";
    } else {
      if (e.estado !== "Executando") return recusar("Inicie a simulação antes de concluir ou provocar uma falha.");
      if (acao.tipo === "falhar-execucao") {
        e.estado = "Erro"; e.concluidoEm = agora; e.log.push(`${agora} · Falha provocada pelo controle de simulação. Nenhum resultado publicado.`);
        mensagem = "Falha de teste registrada. Uma nova tentativa pode ser solicitada no Histórico.";
      } else if (!e.parametros || geracao(e.parametros.modo)) {
        const imposto = e.parametros?.modo === "sped_contribuicoes" || (!e.parametros && e.acao.includes("Contribuições")) ? "Contribuições" : "ICMS/IPI";
        const base = { ...e.contexto, ...(imposto === "Contribuições" && { estabelecimentoId: "" }) };
        const docsDaGeracao = documentosDoContexto(s, base);
        const erro = docsDaGeracao.some((d) => d.estado === "Rejeitado") && !e.parametros?.forcarErros
          ? "Existem documentos em quarentena no período. Revise-os antes de gerar."
          : !docsDaGeracao.length && !e.parametros?.forcarCobertura ? "Não há documentos no período selecionado." : "";
        if (erro) {
          e.estado = "Erro"; e.concluidoEm = agora; e.log.push(`${agora} · Geração de teste bloqueada: ${erro}`);
          mensagem = erro;
        } else {
          const estabelecimentos = base.estabelecimentoId || imposto === "Contribuições" ? [base.estabelecimentoId] : s.empresas.find((empresa) => empresa.id === base.empresaId)!.estabelecimentos.map((f) => f.id);
          e.arquivoIds = estabelecimentos.map((estabelecimentoId, i) => {
            const arquivoId = `${id}-arquivo-${i}`;
            adicionarArquivo(s, { ...base, estabelecimentoId }, imposto, arquivoId, agora, e);
            return arquivoId;
          });
          e.estado = "Concluída"; e.concluidoEm = agora; e.documentos = docsDaGeracao.length;
          e.log.push(`${agora} · ${e.arquivoIds.length} prévia(s) criada(s) em SPED gerados. Sem validade fiscal.`);
          mensagem = "Simulação concluída. Consulte as versões em SPED gerados.";
        }
      } else {
        let quantidade = 0;
        const meses = COMPETENCIAS.filter((mes) => mes >= e.parametros!.dataIni.slice(0, 7) && mes <= e.parametros!.dataFim.slice(0, 7));
        const filiais = s.empresas.find((empresa) => empresa.id === e.contexto.empresaId)!.estabelecimentos.filter((f) => !e.contexto.estabelecimentoId || f.id === e.contexto.estabelecimentoId);
        for (const competencia of meses) for (const filial of filiais) {
          const base = { ...e.contexto, competencia, estabelecimentoId: filial.id };
          if (e.parametros.modo === "erros") {
            const rejeitados = documentosDoContexto(s, base).filter((d) => d.estado === "Rejeitado");
            rejeitados.forEach((d) => { d.estado = "Pendente"; d.motivo = ""; d.xml = true; });
            quantidade += rejeitados.length;
            if (rejeitados.length) alterarPeriodos(s, base);
          } else {
            const modelos = criarCenario().documentos.filter((d) => mesmoEscopo(d, base) && ["NF-e", "CT-e"].includes(d.tipo) && (!e.parametros!.semEntradas || d.sentido !== "Entrada")).slice(0, 4);
            modelos.forEach((d, i) => s.documentos.unshift({ ...d, id: `${id}-${filial.id}-${competencia}-${i}`, numero: `T${s.documentos.length + 1}`, estado: "Pendente", motivo: "", xml: true }));
            quantidade += modelos.length;
            s.importacoes.unshift({ id: `${id}-${filial.id}-${competencia}`, contexto: base, criadoEm: agora, aceitos: modelos.length, rejeitados: 0, origem: `${e.acao} · simulação` });
            if (modelos.length) alterarPeriodos(s, base);
          }
        }
        e.estado = "Concluída"; e.concluidoEm = agora; e.documentos = quantidade;
        e.log.push(`${agora} · ${quantidade} documento(s) fictício(s) ${e.parametros.modo === "erros" ? "recuperado(s)" : "recebido(s)"}. Continue em Classificação.`);
        mensagem = `Simulação concluída: ${quantidade} documento(s) disponíveis para classificação.`;
      }
    }
  } else if (acao.tipo === "gerar") {
    adicionarArquivo(s, contexto, acao.imposto, id, agora);
    s.execucoes.unshift({ id: `${id}-execucao`, contexto: { ...contexto }, acao: `Gerar ${acao.imposto}`, criadoEm: agora, estado: "Concluída", log: ["Simulação executada no servidor local.", "Dados fictícios preparados.", "Prévia adicionada a Arquivos e entregas. Nenhum arquivo fiscal foi gerado."] });
    mensagem = "Nova versão de teste criada. Continue em Validação.";
  } else if (acao.tipo === "validar" || acao.tipo === "entregar") {
    const arquivo = s.arquivos.find((a) => a.id === acao.id && a.contexto.empresaId === contexto.empresaId && a.contexto.competencia === contexto.competencia && (!contexto.estabelecimentoId || !a.contexto.estabelecimentoId || a.contexto.estabelecimentoId === contexto.estabelecimentoId));
    if (!arquivo) return recusar("Arquivo indisponível neste filtro.");
    if (precisaRevisar(s, arquivo)) return recusar("Os dados mudaram após a geração. Gere uma nova versão de teste.");
    if (arquivo.entregue) return recusar("Esta versão já possui uma entrega registrada.");
    if (!ultimasVersoesDoContexto(s).some((a) => a.id === arquivo.id)) return recusar("Esta versão foi superada. Use a versão mais recente.");
    if (acao.tipo === "validar") {
      const pendentes = documentosDoContexto(s, arquivo.contexto).filter((d) => d.estado !== "Classificado");
      arquivo.erros = pendentes.map((d) => `${d.tipo} ${d.numero}: ${d.estado === "Rejeitado" ? d.motivo : "classificação pendente"}`);
      const periodos = s.periodos.filter((p) => mesmoEscopo(p, arquivo.contexto));
      if (periodos.some((p) => !p.apurado)) arquivo.erros.push("Apuração de teste ainda não atualizada.");
      if (arquivo.tipo === "Contribuições" && periodos.some((p) => !p.fechado)) arquivo.erros.push("Fechamento de teste ainda não concluído.");
      arquivo.validacao = arquivo.erros.length ? "Com pendências" : "Aprovado";
      mensagem = arquivo.erros.length ? `Validação de teste: ${arquivo.erros.length} pendência(s). Abra o relatório.` : "Validação de teste aprovada. A versão está pronta para entrega simulada.";
    } else {
      if (arquivo.validacao !== "Aprovado") return recusar("Aprove a validação de teste antes de registrar a entrega.");
      arquivo.entregue = true; arquivo.protocolo = `TESTE-${id.slice(0, 8).toUpperCase()}`;
      mensagem = `Entrega simulada registrada: ${arquivo.protocolo}.`;
    }
  } else if (acao.tipo === "enfileirar") {
    s.execucoes.unshift({ id, contexto: { ...contexto }, acao: `Gerar ${acao.imposto}`, estado: "Na fila", criadoEm: agora, log: ["Solicitação de teste na fila local.", acao.falhar ? "Cenário: falha de extração." : "Cenário: execução normal."] });
    mensagem = "Execução adicionada à fila local. Abra o Histórico para processar ou cancelar.";
  } else if (acao.tipo === "processar" || acao.tipo === "cancelar" || acao.tipo === "reprocessar") {
    const execucao = s.execucoes.find((e) => e.id === acao.id && execucaoNoContexto(e, contexto));
    if (!execucao || (acao.tipo === "reprocessar" ? execucao.estado !== "Erro" : execucao.estado !== "Na fila")) return recusar("Esta execução não está disponível para a ação escolhida.");
    if (acao.tipo === "reprocessar") {
      if (!execucao.parametros && !execucao.acao.startsWith("Gerar ")) return recusar("Parâmetros históricos indisponíveis. Prepare um novo pedido em Executar.");
      if (s.execucoes.some((e) => e.tentativaDe === execucao.id && ["Na fila", "Executando"].includes(e.estado))) return recusar("Esta execução já possui uma nova tentativa pendente.");
      s.execucoes.unshift({ id, contexto: { ...execucao.contexto }, acao: execucao.acao, ...(execucao.parametros && { parametros: execucao.parametros }), tentativaDe: execucao.id, estado: "Na fila", criadoEm: agora, log: [`${agora} · Nova tentativa de ${execucao.id}. O erro original foi preservado.`] });
      mensagem = "Nova tentativa adicionada à fila. A execução anterior foi preservada.";
    }
    else if (acao.tipo === "cancelar") { execucao.estado = "Cancelada"; execucao.concluidoEm = agora; execucao.log.push("Cancelada no servidor local."); mensagem = "Execução de teste cancelada."; }
    else if (acao.tipo === "processar" && execucao.parametros) return recusar("Use os controles de início e conclusão para este pedido.");
    else if (acao.tipo === "processar" && execucao.log.includes("Cenário: falha de extração.")) { execucao.estado = "Erro"; execucao.log.push("Falha simulada de extração. Solicite uma nova tentativa no Histórico."); mensagem = "Falha de teste registrada. Abra o Histórico para solicitar uma nova tentativa."; }
    else { execucao.estado = "Concluída"; execucao.log.push("Recuperação e processamento concluídos no servidor local."); adicionarArquivo(s, execucao.contexto, execucao.acao.includes("Contribuições") ? "Contribuições" : "ICMS/IPI", `${id}-arquivo`, agora); mensagem = "Execução concluída; prévia disponível em Arquivos e entregas."; }
  } else if (acao.tipo === "confrontar") {
    s.confrontos = s.confrontos.filter((c) => !mesmoEscopo(c.contexto, contexto));
    docs.filter((d) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo)).forEach((d, i) => s.confrontos.push({ id: `${id}-${i}`, contexto: { empresaId: d.empresaId, estabelecimentoId: d.estabelecimentoId, competencia: d.competencia }, documentoId: d.id, estado: "Sem nota", valor: d.valor }));
    mensagem = "Confronto de exemplo preparado. Revise e concilie os pagamentos.";
  } else if (acao.tipo === "conciliar") {
    const confronto = s.confrontos.find((c) => c.id === acao.id && mesmoEscopo(c.contexto, contexto));
    if (!confronto) return recusar("Pagamento indisponível neste filtro.");
    confronto.estado = "Conciliado"; mensagem = "Pagamento conciliado no cenário de teste.";
  }
  s.atividades.unshift({ id, contexto: { ...contexto }, criadoEm: agora, mensagem });
  s.atividades = s.atividades.slice(0, 100);
  return { cenario: s, mensagem };
}

export function totaisDoContexto(s: Cenario, contexto = s.contexto) {
  const docs = documentosDoContexto(s, contexto).filter((d) => d.estado !== "Rejeitado");
  const entradas = docs.filter((d) => d.sentido === "Entrada").reduce((v, d) => v + d.valor, 0);
  const saidas = docs.filter((d) => d.sentido === "Saída").reduce((v, d) => v + d.valor, 0);
  const creditavel = docs.filter((d) => d.sentido === "Entrada" && d.credito && d.estado === "Classificado").reduce((v, d) => v + d.valor, 0);
  const p = s.parametros[contexto.empresaId];
  const ajustes = s.ajustes.filter((a) => mesmoEscopo(a.contexto, contexto));
  const ajuste = (imposto: Imposto) => ajustes.filter((a) => a.imposto === imposto).reduce((v, a) => v + (a.efeito === "Débito" ? a.valor : -a.valor), 0);
  return { entradas, saidas, creditavel, icms: (saidas - creditavel) * p.icms / 100 + ajuste("ICMS/IPI"), ipi: saidas * p.ipi / 100,
    pis: (saidas - creditavel) * p.pis / 100, cofins: (saidas - creditavel) * p.cofins / 100 + ajuste("Contribuições"),
    pendentes: docs.filter((d) => d.estado === "Pendente").length, rejeitados: documentosDoContexto(s, contexto).filter((d) => d.estado === "Rejeitado").length };
}
