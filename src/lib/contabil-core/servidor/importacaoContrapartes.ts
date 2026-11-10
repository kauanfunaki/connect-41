import "server-only";

// Importação conferida das relações fiscais de clientes e fornecedores (Fase 3b, 10/11/2026): porte
// de `ImportacaoContrapartesService` (`src/domain/contrapartes/importacao.py` do Contábil Core).
//
// O leitor (`cadastro/relatorioContrapartes.ts`) só traduz o arquivo. Aqui cada linha é cruzada com
// o plano de contas (pelo código reduzido, `contaNumero`) e com as contrapartes já cadastradas:
// - Análise: nada é gravado. Cada linha sai pronta, duplicada, em conflito ou inválida, com o motivo,
//   e a prévia leva um comprovante (`previa.ts`) que amarra pessoa, empresa, arquivo e o hash da
//   própria análise.
// - Confirmação: reenvia o arquivo, trava a empresa, refaz a análise e só grava se o comprovante
//   ainda bater. Nada do que o navegador devolve é confiado, e uma prévia velha (conta ou cadastro
//   que mudou no meio) é recusada.
// A auditoria fica com a ação da tela: o serviço devolve os números que ela registra.

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { contraparteChaveAtiva } from "../motor/chaves";
import { hashDoArquivo } from "../motor/dedup";
import { len, strip } from "../extrato/py";
import { casefoldPy } from "../cadastro/casefold";
import { dadosSemNulos, validarDadosCadastrais, type DadosCadastrais } from "../cadastro/dadosCadastrais";
import {
  ErroDeRelatorio,
  lerRelatorioContrapartes,
  somenteDigitos,
  type LinhaRelatorioContraparte,
  type RelatorioContrapartes,
  type TipoContraparteRelatorio,
} from "../cadastro/relatorioContrapartes";
import { ehDuplicado, empresaDoTenant, falha, NAO_ENCONTRADA, ok, type EmpresaDoCore, type Resultado } from "./base";
import { conferirComprovante, emitirComprovante, FRASE_DA_PREVIA, hashDaAnalise, type DadosDaPrevia } from "./previa";

export type StatusDaContraparte = "pronta" | "duplicada" | "conflito" | "invalida";

export type ItemDaPreviaDeContrapartes = {
  linha: number;
  status: StatusDaContraparte;
  tipo: TipoContraparteRelatorio;
  documento: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  contaNumero: number | null;
  contaCodigo: string | null;
  contaDescricao: string | null;
  motivo: string | null;
  /** Os campos cadastrais validados (todos, com `null` nos ausentes); nulo se a linha é inválida antes. */
  dadosCadastrais: DadosCadastrais | null;
};

export type ResumoDeContrapartes = { totalLinhas: number; prontas: number; duplicadas: number; conflitos: number; invalidas: number };

export type PreviaDeContrapartes = ResumoDeContrapartes & {
  arquivoHash: string;
  /** Devolvido na confirmação. Vale 15 minutos. */
  comprovante: string;
  tipoDetectado: TipoContraparteRelatorio;
  camposReconhecidos: string[];
  camposIgnorados: string[];
  avisos: string[];
  itens: ItemDaPreviaDeContrapartes[];
};

/** O que a ação da tela registra na auditoria (`contraparte.relatorio_importado` no original). */
export type ImportacaoDeContrapartes = {
  arquivoHash: string;
  tipo: TipoContraparteRelatorio;
  totalLinhas: number;
  importadas: number;
  duplicadas: number;
  conflitos: number;
  invalidas: number;
};

type Tx = Prisma.TransactionClient | ReturnType<typeof getPrisma>;
type Escopo = { tenantId: string; empresaId: string };
type ContaDoPlano = { id: string; codigo: string; descricao: string };
type Existente = { tipo: string; ativa: boolean; contaContabilId: string };

type LinhaAnalisada = {
  origem: LinhaRelatorioContraparte;
  tipo: TipoContraparteRelatorio;
  status: StatusDaContraparte;
  motivo: string | null;
  conta: ContaDoPlano | null;
  dados: DadosCadastrais | null;
};

type Analise = { relatorio: RelatorioContrapartes; arquivoHash: string; avisos: string[]; linhas: LinhaAnalisada[] };

const TIPO_DA_PREVIA = "contrapartes";
/** `contaNumero` é INT no banco: um número maior nunca casa com conta do plano. */
const MAIOR_INT = 2_147_483_647;

// ─── Serviço ──────────────────────────────────────────────────────────────

/** A prévia: nada é gravado. */
export async function analisarContrapartes(
  tenantId: string,
  userId: string,
  empresaId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
): Promise<Resultado<PreviaDeContrapartes>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const relatorio = lerArquivo(bytes, nomeArquivo);
  if (!relatorio.ok) return relatorio;
  const arquivoHash = hashDoArquivo(bytes);
  const analise = await montarAnalise(getPrisma(), empresa, relatorio.valor, arquivoHash);
  if (!analise.ok) return analise;
  const comprovante = emitirComprovante(dadosDaPrevia(tenantId, userId, empresaId, arquivoHash, hashDaAnaliseDeContrapartes(analise.valor)));
  const a = analise.valor;
  return ok({
    ...resumo(a.linhas),
    arquivoHash,
    comprovante,
    tipoDetectado: a.relatorio.tipo,
    camposReconhecidos: [...a.relatorio.camposReconhecidos],
    camposIgnorados: [...a.relatorio.camposIgnorados],
    avisos: a.avisos,
    itens: a.linhas.map(item),
  });
}

/** A confirmação: refaz a análise dentro da trava da empresa e grava as prontas se a prévia ainda vale. */
export async function confirmarContrapartes(
  tenantId: string,
  userId: string,
  empresaId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
  comprovante: string,
): Promise<Resultado<ImportacaoDeContrapartes>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const relatorio = lerArquivo(bytes, nomeArquivo);
  if (!relatorio.ok) return relatorio;
  const arquivoHash = hashDoArquivo(bytes);

  // Como no original, comprovante inválido, de outra pessoa/empresa ou de outro arquivo é recusado
  // antes da trava e da reanálise; só o hash da análise espera a análise refeita lá dentro.
  const previo = conferirComprovante(comprovante, dadosDaPrevia(tenantId, userId, empresaId, arquivoHash, ""));
  if (!previo.ok && previo.motivo !== "desatualizada") return falha(FRASE_DA_PREVIA[previo.motivo]);

  const r = relatorio.valor;
  try {
    return await getPrisma().$transaction(
      async (tx) => {
        // Serializa as confirmações da mesma empresa. A análise é refeita dentro da trava, então conta
        // ou cadastro alterado depois da prévia não passa em silêncio para a gravação.
        const travada = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM core_empresas WHERE id = ${empresaId} AND tenantId = ${tenantId} AND deletedAt IS NULL FOR UPDATE`;
        if (!travada.length) return falha<ImportacaoDeContrapartes>(NAO_ENCONTRADA);
        // Como o original (`bloquear=True`): as contas e os cadastros citados ficam travados até a
        // gravação, e a análise abaixo lê o estado mais novo.
        const numeros = numerosDeConta(r);
        if (numeros.length) {
          await tx.$queryRaw`SELECT id FROM core_plano_contas WHERE tenantId = ${tenantId} AND empresaId = ${empresaId} AND contaNumero IN (${Prisma.join(numeros)}) AND deletedAt IS NULL FOR UPDATE`;
        }
        const documentos = documentosDoRelatorio(r);
        if (documentos.length) {
          await tx.$queryRaw`SELECT id FROM core_contrapartes WHERE tenantId = ${tenantId} AND empresaId = ${empresaId} AND documento IN (${Prisma.join(documentos)}) AND deletedAt IS NULL FOR UPDATE`;
        }

        const analise = await montarAnalise(tx, empresa, r, arquivoHash);
        if (!analise.ok) return falha<ImportacaoDeContrapartes>(analise.erro);
        const veredicto = conferirComprovante(comprovante, dadosDaPrevia(tenantId, userId, empresaId, arquivoHash, hashDaAnaliseDeContrapartes(analise.valor)));
        if (!veredicto.ok) return falha<ImportacaoDeContrapartes>(FRASE_DA_PREVIA[veredicto.motivo]);

        const prontas = analise.valor.linhas.filter((l) => l.status === "pronta");
        if (prontas.length) {
          const agora = new Date();
          await tx.coreContraparte.createMany({
            data: prontas.map((l) => {
              const documento = l.origem.documento!;
              const dados = l.dados ? dadosSemNulos(l.dados) : null;
              return {
                tenantId, empresaId, tipo: r.tipo, documento, razaoSocial: l.origem.razaoSocial!, nomeFantasia: l.origem.nomeFantasia,
                contaContabilId: l.conta!.id, origem: "relatorio_fiscal", ...(dados ? { dadosCadastrais: dados } : {}),
                confirmadoEm: agora, confirmadoPorId: userId, ativa: true,
                chaveAtiva: contraparteChaveAtiva({ ativa: true, deletedAt: null, documento, tipo: r.tipo }),
              };
            }),
          });
        }
        const resumoFinal = resumo(analise.valor.linhas);
        return ok<ImportacaoDeContrapartes>({
          arquivoHash,
          tipo: r.tipo,
          totalLinhas: resumoFinal.totalLinhas,
          importadas: prontas.length,
          duplicadas: resumoFinal.duplicadas,
          conflitos: resumoFinal.conflitos,
          invalidas: resumoFinal.invalidas,
        });
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    if (ehDuplicado(e)) return falha("Uma das contrapartes já foi cadastrada por outra pessoa enquanto a prévia estava aberta. Analise o arquivo novamente.");
    throw e;
  }
}

// ─── Análise ──────────────────────────────────────────────────────────────

function lerArquivo(bytes: Uint8Array, nomeArquivo: string): Resultado<RelatorioContrapartes> {
  try {
    return ok(lerRelatorioContrapartes(bytes, nomeArquivo));
  } catch (e) {
    if (e instanceof ErroDeRelatorio) return falha(e.message);
    throw e;
  }
}

const dadosDaPrevia = (tenantId: string, userId: string, empresaId: string, arquivoHash: string, analiseHash: string): DadosDaPrevia => ({
  tipo: TIPO_DA_PREVIA, tenantId, userId, empresaId, arquivoHash, analiseHash,
});

function resumo(linhas: LinhaAnalisada[]): ResumoDeContrapartes {
  const conta = (s: StatusDaContraparte) => linhas.filter((l) => l.status === s).length;
  return { totalLinhas: linhas.length, prontas: conta("pronta"), duplicadas: conta("duplicada"), conflitos: conta("conflito"), invalidas: conta("invalida") };
}

function item(l: LinhaAnalisada): ItemDaPreviaDeContrapartes {
  return {
    linha: l.origem.numeroLinha,
    status: l.status,
    tipo: l.tipo,
    documento: l.origem.documento,
    razaoSocial: l.origem.razaoSocial,
    nomeFantasia: l.origem.nomeFantasia,
    contaNumero: l.origem.contaNumero,
    contaCodigo: l.conta?.codigo ?? null,
    contaDescricao: l.conta?.descricao ?? null,
    motivo: l.motivo,
    dadosCadastrais: l.dados,
  };
}

/**
 * `_hash_analise`: o mesmo conteúdo do original, com os mesmos nomes. O id interno da conta não
 * aparece na prévia, mas entra no comprovante para que uma conta removida e recriada com os mesmos
 * textos não seja aceita sem nova análise.
 */
function hashDaAnaliseDeContrapartes(a: Analise): string {
  return hashDaAnalise({
    arquivo_hash: a.arquivoHash,
    tipo: a.relatorio.tipo,
    empresa_documento: somenteDigitos(a.relatorio.empresaDocumento ?? ""),
    campos_reconhecidos: a.relatorio.camposReconhecidos,
    campos_ignorados: a.relatorio.camposIgnorados,
    avisos: a.avisos,
    linhas: a.linhas.map((l) => ({
      linha: l.origem.numeroLinha,
      status: l.status,
      tipo: l.tipo,
      documento: l.origem.documento,
      razao_social: l.origem.razaoSocial,
      nome_fantasia: l.origem.nomeFantasia,
      conta_numero: l.origem.contaNumero,
      conta_codigo: l.conta?.codigo ?? null,
      conta_descricao: l.conta?.descricao ?? null,
      motivo: l.motivo,
      dados_cadastrais: l.dados,
      conta_id_interno: l.conta?.id ?? null,
    })),
  });
}

/** Os códigos reduzidos citados que podem existir no plano (positivos e dentro do INT do banco). */
function numerosDeConta(r: RelatorioContrapartes): number[] {
  const numeros = r.linhas.map((l) => l.contaNumero).filter((n): n is number => n !== null && n > 0 && n <= MAIOR_INT);
  return [...new Set(numeros)];
}

function documentosDoRelatorio(r: RelatorioContrapartes): string[] {
  return [...new Set(r.linhas.map((l) => l.documento).filter((d): d is string => !!d))];
}

async function montarAnalise(db: Tx, empresa: EmpresaDoCore, relatorio: RelatorioContrapartes, arquivoHash: string): Promise<Resultado<Analise>> {
  const escopo: Escopo = { tenantId: empresa.tenantId, empresaId: empresa.id };
  const conferida = conferirEmpresaDoRelatorio(empresa, relatorio);
  if (!conferida.ok) return conferida;
  const avisos = conferida.valor;
  if (relatorio.camposReconhecidos.includes("conta_cliente")) {
    avisos.push("A coluna Conta Cliente é apenas uma referência fiscal e não foi usada como conta contábil.");
  }
  if (relatorio.camposReconhecidos.includes("conta_fornecedor")) {
    avisos.push("A coluna Conta Fornecedor é apenas uma referência fiscal e não foi usada como conta contábil.");
  }
  if (relatorio.camposIgnorados.length) avisos.push(`${relatorio.camposIgnorados.length} coluna(s) não reconhecida(s) foram ignoradas.`);
  if (!relatorio.linhas.length) avisos.push("O relatório não possui linhas de contraparte após o cabeçalho.");

  const contas = await carregarContas(db, escopo, relatorio);
  const existentes = await carregarExistentes(db, escopo, relatorio);
  const linhas = relatorio.linhas.map((l) => validarLinhaBasica(l, relatorio.tipo, contas));
  classificarDocumentosRepetidos(linhas, existentes);
  return ok({ relatorio, arquivoHash, avisos, linhas });
}

/** O CNPJ do cabeçalho do relatório tem de ser o da empresa escolhida; sem ele, só um aviso. */
function conferirEmpresaDoRelatorio(empresa: EmpresaDoCore, relatorio: RelatorioContrapartes): Resultado<string[]> {
  const informado = somenteDigitos(relatorio.empresaDocumento ?? "");
  const esperado = somenteDigitos(empresa.cnpj);
  if (!informado) return ok(["O relatório não informa o CNPJ da empresa. Confira a empresa selecionada antes de confirmar."]);
  if (len(informado) !== 14) return falha("O CNPJ da empresa informado no relatório é inválido.");
  if (informado !== esperado) return falha("O CNPJ do relatório não corresponde à empresa selecionada. Selecione a empresa correta antes de importar.");
  return ok([]);
}

async function carregarContas(db: Tx, { tenantId, empresaId }: Escopo, relatorio: RelatorioContrapartes): Promise<Map<number, ContaDoPlano[]>> {
  const numeros = numerosDeConta(relatorio);
  const porNumero = new Map<number, ContaDoPlano[]>();
  if (!numeros.length) return porNumero;
  const encontradas = await db.corePlanoConta.findMany({
    where: { tenantId, empresaId, contaNumero: { in: numeros }, deletedAt: null },
    select: { id: true, codigo: true, descricao: true, contaNumero: true },
  });
  for (const { contaNumero, ...conta } of encontradas) {
    if (contaNumero === null) continue;
    const lista = porNumero.get(contaNumero) ?? [];
    lista.push(conta);
    porNumero.set(contaNumero, lista);
  }
  return porNumero;
}

/** Os cadastros vivos com os documentos do relatório, de qualquer tipo, ativos ou não. */
async function carregarExistentes(db: Tx, { tenantId, empresaId }: Escopo, relatorio: RelatorioContrapartes): Promise<Map<string, Existente[]>> {
  const documentos = documentosDoRelatorio(relatorio);
  const porDocumento = new Map<string, Existente[]>();
  if (!documentos.length) return porDocumento;
  const encontrados = await db.coreContraparte.findMany({
    where: { tenantId, empresaId, documento: { in: documentos }, deletedAt: null },
    select: { documento: true, tipo: true, ativa: true, contaContabilId: true },
  });
  for (const { documento, ...existente } of encontrados) {
    const lista = porDocumento.get(documento) ?? [];
    lista.push(existente);
    porDocumento.set(documento, lista);
  }
  return porDocumento;
}

function validarLinhaBasica(linha: LinhaRelatorioContraparte, tipo: TipoContraparteRelatorio, contas: Map<number, ContaDoPlano[]>): LinhaAnalisada {
  let erro = erroBasico(linha);
  let dados: DadosCadastrais | null = null;
  if (erro === null) {
    const v = validarDadosCadastrais(linha.dadosCadastrais);
    if (v.ok) dados = v.dados;
    else erro = v.erro;
  }
  let conta: ContaDoPlano | null = null;
  if (erro === null) {
    const candidatas = contas.get(linha.contaNumero ?? -1) ?? [];
    if (!candidatas.length) erro = "A conta informada no relatório não existe no plano desta empresa.";
    else if (candidatas.length > 1) erro = "A conta informada corresponde a mais de uma conta ativa no plano.";
    else conta = candidatas[0];
  }
  return { origem: linha, tipo, status: erro ? "invalida" : "pronta", motivo: erro, conta, dados };
}

function erroBasico(linha: LinhaRelatorioContraparte): string | null {
  if (!linha.documentoValido || !linha.documento) {
    return linha.erroDocumento === "documento_ausente" ? "CPF/CNPJ não informado." : "CPF/CNPJ deve possuir 11 ou 14 dígitos.";
  }
  if (!linha.razaoSocial || len(strip(linha.razaoSocial)) < 2) return "Razão social não informada.";
  if (len(linha.razaoSocial) > 300) return "Razão social excede 300 caracteres.";
  if (linha.nomeFantasia && len(linha.nomeFantasia) > 300) return "Nome fantasia excede 300 caracteres.";
  if (linha.contaNumero === null || linha.contaNumero <= 0) return "Conta contábil não informada ou inválida.";
  return null;
}

/**
 * O mesmo documento repetido no relatório com dados ou contas diferentes põe o grupo inteiro em
 * conflito (inclusive a linha que sozinha seria inválida). Repetido igual, a primeira vale e as
 * outras são duplicadas. Depois, o grupo é comparado com o cadastro existente do mesmo tipo.
 */
function classificarDocumentosRepetidos(linhas: LinhaAnalisada[], existentes: Map<string, Existente[]>): void {
  const porDocumento = new Map<string, LinhaAnalisada[]>();
  for (const l of linhas) {
    if (!l.origem.documentoValido || !l.origem.documento) continue;
    const grupo = porDocumento.get(l.origem.documento) ?? [];
    grupo.push(l);
    porDocumento.set(l.origem.documento, grupo);
  }
  for (const [documento, grupo] of porDocumento) {
    if (new Set(grupo.map(assinatura)).size > 1) {
      for (const l of grupo) {
        l.status = "conflito";
        l.motivo = "O mesmo documento aparece mais de uma vez no relatório com dados ou contas diferentes.";
      }
      continue;
    }
    const prontas = grupo.filter((l) => l.status === "pronta");
    if (!prontas.length) continue;
    const doExistente = classificarExistente(prontas[0], existentes.get(documento) ?? []);
    if (doExistente) {
      for (const l of prontas) {
        l.status = doExistente.status;
        l.motivo = doExistente.motivo;
      }
      continue;
    }
    for (const repetida of prontas.slice(1)) {
      repetida.status = "duplicada";
      repetida.motivo = "Linha repetida no próprio relatório; não será importada novamente.";
    }
  }
}

/** `_assinatura_relatorio`: conta, nomes sem caixa e os dados cadastrais brutos, ordenados. */
function assinatura(l: LinhaAnalisada): string {
  const dados = Object.entries(l.origem.dadosCadastrais).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([l.origem.contaNumero, casefoldPy(strip(l.origem.razaoSocial ?? "")), casefoldPy(strip(l.origem.nomeFantasia ?? "")), dados]);
}

function classificarExistente(l: LinhaAnalisada, existentes: Existente[]): { status: StatusDaContraparte; motivo: string } | null {
  // O tipo oposto é outro vínculo legítimo: o mesmo documento pode ter uma conta para pagamentos e
  // outra para recebimentos.
  const sobrepostos = existentes.filter((e) => e.tipo === l.tipo || e.tipo === "ambos");
  if (!sobrepostos.length) return null;
  if (sobrepostos.length > 1) return { status: "conflito", motivo: "Há mais de um cadastro existente que cobre este tipo; revise-os manualmente." };
  const existente = sobrepostos[0];
  if (!existente.ativa) return { status: "conflito", motivo: "Já existe um cadastro inativo para este documento e tipo; revise-o manualmente." };
  if (l.conta && existente.contaContabilId === l.conta.id) return { status: "duplicada", motivo: "Este documento e tipo já estão cadastrados com a mesma conta." };
  return { status: "conflito", motivo: "Este documento e tipo já estão cadastrados com outra conta contábil." };
}

