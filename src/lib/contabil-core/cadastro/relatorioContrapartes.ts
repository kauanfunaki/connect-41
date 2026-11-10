// Leitura das relações fiscais de clientes e fornecedores (Fase 3b, 10/11/2026): porte de
// `ler_relatorio_contrapartes` (`src/domain/contrapartes/relatorio.py` do Contábil Core).
//
// Os relatórios do sistema fiscal existem em duas apresentações (compacta e completa), mas ambas
// carregam o mesmo núcleo: documento, nomes e número da conta contábil. Aqui só se traduz a
// planilha para uma estrutura canônica; resolver a conta, comparar cadastros e decidir conflitos é
// do serviço (`servidor/importacaoContrapartes.ts`). A leitura limitada do Excel (e a correção do
// defeito BLANK → BOF dos .xls) é a de `planilha/excel.ts`.

import { ErroDeRelatorio, lerPlanilhasExcel, type PlanilhaExcel } from "../planilha/excel";
import { ehVazia, strPy, type Celula } from "../planilha/celula";
import { inteiro, len, re, strip } from "../extrato/py";
import { casefoldPy } from "./casefold";

export { ErroDeRelatorio };

export type TipoContraparteRelatorio = "cliente" | "fornecedor";

/** Uma linha e somente os campos conhecidos do relatório. */
export type LinhaRelatorioContraparte = {
  /** Linha da planilha, contando de 1. */
  numeroLinha: number;
  /** Só dígitos, e só quando tem 11 ou 14. */
  documento: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  contaNumero: number | null;
  /** Os demais campos reconhecidos, não vazios, na ordem das colunas. */
  dadosCadastrais: Record<string, string>;
  documentoValido: boolean;
  erroDocumento: "documento_ausente" | "documento_invalido" | null;
};

/** Resultado puro da leitura, anterior a qualquer consulta ao banco. */
export type RelatorioContrapartes = {
  tipo: TipoContraparteRelatorio;
  planilha: string;
  titulo: string | null;
  empresa: string | null;
  /** O C.N.P.J. do cabeçalho do relatório, só com dígitos. */
  empresaDocumento: string | null;
  camposReconhecidos: string[];
  camposIgnorados: string[];
  linhas: LinhaRelatorioContraparte[];
};

const MAX_CARACTERES_CELULA = 10_000;
const MAX_LINHAS_CABECALHO = 30;

const ROTULOS_METADADOS = new Set(["empresa", "pagina", "c n p j", "emissao", "hora"]);

// A lista é fechada de propósito: uma coluna nova no arquivo não vira campo persistível por
// acidente. Primeiro ela precisa ganhar nome canônico e teste.
const CABECALHOS: ReadonlyMap<string, string> = new Map([
  ["codigo", "codigo"],
  ["conta", "conta"],
  ["conta fornecedor", "conta_fornecedor"],
  ["conta cliente", "conta_cliente"],
  ["nome", "nome"],
  ["razao social", "razao_social"],
  ["uf", "uf"],
  ["endereco", "endereco"],
  ["complemento", "complemento"],
  ["numero", "numero"],
  ["cep", "cep"],
  ["insc estadual", "inscricao_estadual"],
  ["inscricao estadual", "inscricao_estadual"],
  ["fax", "fax"],
  ["fone", "telefone"],
  ["telefone", "telefone"],
  ["ddd", "ddd"],
  ["agropecuario", "agropecuario"],
  ["contribuinte icms", "contribuinte_icms"],
  ["tipo insc", "tipo_inscricao"],
  ["tipo inscricao", "tipo_inscricao"],
  ["bairro", "bairro"],
  ["insc municipal", "inscricao_municipal"],
  ["inscricao municipal", "inscricao_municipal"],
  ["pais", "pais"],
  ["varejista ou cons final", "varejista_consumidor_final"],
  ["varejista ou consumidor final", "varejista_consumidor_final"],
  ["data cadastro", "data_cadastro"],
  ["municipio", "municipio"],
  ["c n p j c p f c e i outros c a e p f", "documento"],
  ["c n p j c p f c e i c a e p f outros", "documento"],
  ["cnpj cpf cei outros caepf", "documento"],
  ["cnpj cpf cei caepf outros", "documento"],
  ["cnpj cpf", "documento"],
  ["cpf cnpj", "documento"],
]);

// Referências cruzadas do sistema fiscal (Conta Cliente/Fornecedor) não são a conta contábil desta
// contraparte: guardá-las como dado cadastral induziria a tratá-las como vínculo válido.
const CAMPOS_CENTRAIS = new Set(["documento", "razao_social", "nome", "conta", "conta_fornecedor", "conta_cliente"]);

type Cabecalho = {
  planilha: PlanilhaExcel;
  indiceLinha: number;
  porCampo: Map<string, number>;
  colunas: string[];
  ignoradas: string[];
};

/** Lê uma relação XLSX/XLS sem consultar banco nem alterar estado. Lança `ErroDeRelatorio`. */
export function lerRelatorioContrapartes(bytes: Uint8Array, nomeArquivo: string): RelatorioContrapartes {
  const planilhas = lerPlanilhasExcel(bytes, nomeArquivo);
  const cabecalho = localizarCabecalho(planilhas);
  const { tipo, titulo } = detectarTipo(cabecalho);
  const empresa = valorDeMetadado(cabecalho.planilha, "empresa");
  let empresaDocumento = valorDeMetadado(cabecalho.planilha, "c n p j");
  if (empresaDocumento !== null) empresaDocumento = somenteDigitos(empresaDocumento) || null;
  const linhas = extrairLinhas(cabecalho);
  return {
    tipo,
    planilha: cabecalho.planilha.nome,
    titulo,
    empresa,
    empresaDocumento,
    camposReconhecidos: cabecalho.colunas,
    camposIgnorados: cabecalho.ignoradas,
    linhas,
  };
}

// ─── Texto ────────────────────────────────────────────────────────────────

const NAO_DIGITO = re("\\D");
const INTEIRO_DA_PLANILHA = re("\\d+(?:\\.0+)?");

/** `re.sub(r"\D", "", valor)`: o `\d` do Python aceita dígito de qualquer escrita. */
export function somenteDigitos(valor: string): string {
  return NAO_DIGITO.sub("", valor);
}

/** `_chave`: sem acento (NFKD sem as marcas Mn), `casefold` e só [a-z0-9] separados por espaço. */
export function chave(valor: Celula): string {
  if (valor === null) return "";
  const semAcento = strPy(valor).normalize("NFKD").replace(/\p{Mn}/gu, "");
  return strip(casefoldPy(semAcento).replace(/[^a-z0-9]+/g, " "));
}

/** `_inteiro_planilha`: "501" e "501.0" viram 501; qualquer outra coisa, nada. */
function inteiroPlanilha(valor: string): number | null {
  if (!valor) return null;
  const candidato = strip(valor);
  if (!INTEIRO_DA_PLANILHA.fullmatch(candidato)) return null;
  return inteiro(candidato.split(".", 1)[0]);
}

/** `_texto_celula`: o texto de uma célula como o relatório o usa. */
export function textoCelula(valor: Celula): string {
  if (valor === null) return "";
  if (typeof valor !== "string") {
    if (valor.tipo === "bool") return valor.valor ? "S" : "N";
    if (valor.tipo === "datahora") return valor.valor;
    // `str(int(valor))`: o BigInt escreve o inteiro exato mesmo acima de 2^53.
    if (valor.tipo === "float" && Number.isInteger(valor.valor)) return BigInt(valor.valor).toString();
  }
  const texto = strip(strPy(valor));
  if (len(texto) > MAX_CARACTERES_CELULA) {
    throw new ErroDeRelatorio("celula_excede_limite", "A planilha possui uma célula de texto maior que o limite permitido.");
  }
  return texto;
}

// ─── Layout ───────────────────────────────────────────────────────────────

function localizarCabecalho(planilhas: PlanilhaExcel[]): Cabecalho {
  const candidatos: Cabecalho[] = [];
  for (const planilha of planilhas) {
    planilha.linhas.slice(0, MAX_LINHAS_CABECALHO).forEach((linha, indice) => {
      const mapeado = new Map<string, number>();
      const reconhecidas: string[] = [];
      const ignoradas: string[] = [];
      let duplicado = false;
      linha.forEach((valor, coluna) => {
        const texto = textoCelula(valor);
        if (!texto) return;
        const campo = CABECALHOS.get(chave(texto));
        if (campo === undefined) {
          ignoradas.push(texto);
          return;
        }
        if (mapeado.has(campo)) {
          duplicado = true;
          return;
        }
        mapeado.set(campo, coluna);
        reconhecidas.push(campo);
      });
      if (!mapeado.has("razao_social") || !mapeado.has("documento")) return;
      if (duplicado) throw new ErroDeRelatorio("cabecalho_ambiguo", "O cabeçalho possui duas colunas para o mesmo campo.");
      candidatos.push({ planilha, indiceLinha: indice, porCampo: mapeado, colunas: reconhecidas, ignoradas });
    });
  }
  if (!candidatos.length) {
    throw new ErroDeRelatorio(
      "cabecalho_nao_encontrado",
      `Não foi encontrado um cabeçalho com Razão Social e CPF/CNPJ nas primeiras ${MAX_LINHAS_CABECALHO} linhas.`,
    );
  }
  if (candidatos.length > 1) throw new ErroDeRelatorio("cabecalho_ambiguo", "O arquivo possui mais de um cabeçalho de relação reconhecível.");
  return candidatos[0];
}

/** O tipo vem do título/nome da folha e das colunas cruzadas; evidência dos dois lados recusa. */
function detectarTipo(cabecalho: Cabecalho): { tipo: TipoContraparteRelatorio; titulo: string | null } {
  const evidencias = new Set<TipoContraparteRelatorio>();
  let titulo: string | null = null;
  const textos = [cabecalho.planilha.nome];
  for (const linha of cabecalho.planilha.linhas.slice(0, MAX_LINHAS_CABECALHO)) {
    for (const valor of linha) if (!ehVazia(valor)) textos.push(textoCelula(valor));
  }
  const chaveDaFolha = chave(cabecalho.planilha.nome);
  for (const texto of textos) {
    const k = chave(texto);
    if (k.includes("relacao de clientes")) {
      evidencias.add("cliente");
      if (titulo === null && k !== chaveDaFolha) titulo = texto;
    }
    if (k.includes("relacao de fornecedores")) {
      evidencias.add("fornecedor");
      if (titulo === null && k !== chaveDaFolha) titulo = texto;
    }
  }
  // "Conta Fornecedor" só aparece na relação de clientes, e vice-versa.
  if (cabecalho.porCampo.has("conta_fornecedor")) evidencias.add("cliente");
  if (cabecalho.porCampo.has("conta_cliente")) evidencias.add("fornecedor");

  if (!evidencias.size) {
    throw new ErroDeRelatorio("tipo_nao_identificado", "Não foi possível identificar se a relação é de clientes ou fornecedores.");
  }
  if (evidencias.size > 1) {
    throw new ErroDeRelatorio("tipo_ambiguo", "O arquivo mistura indicadores de relação de clientes e fornecedores.");
  }
  return { tipo: [...evidencias][0], titulo };
}

function valorDeMetadado(planilha: PlanilhaExcel, rotulo: string): string | null {
  for (const linha of planilha.linhas.slice(0, MAX_LINHAS_CABECALHO)) {
    for (let coluna = 0; coluna < linha.length; coluna++) {
      if (chave(linha[coluna]) !== rotulo) continue;
      for (const seguinte of linha.slice(coluna + 1)) {
        // O relatório imprime Página/Emissão na mesma linha. Se o valor do primeiro rótulo estiver
        // vazio, o próximo rótulo (ou a data dele) não pode virar CNPJ/empresa.
        if (ROTULOS_METADADOS.has(chave(seguinte))) break;
        const texto = textoCelula(seguinte);
        if (texto) return texto;
      }
    }
  }
  return null;
}

function extrairLinhas(cabecalho: Cabecalho): LinhaRelatorioContraparte[] {
  const resultado: LinhaRelatorioContraparte[] = [];
  const linhas = cabecalho.planilha.linhas;
  for (let indice = cabecalho.indiceLinha + 1; indice < linhas.length; indice++) {
    const linha = linhas[indice];
    const campos = new Map<string, string>();
    for (const campo of cabecalho.colunas) {
      const coluna = cabecalho.porCampo.get(campo)!;
      campos.set(campo, textoCelula(coluna < linha.length ? linha[coluna] : null));
    }
    if (![...campos.values()].some(Boolean)) continue;
    // Cabeçalhos repetidos entre páginas não são contrapartes.
    if (chave(campos.get("razao_social") ?? "") === "razao social") continue;

    const documento = somenteDigitos(campos.get("documento") ?? "");
    campos.set("documento", documento);
    const valido = len(documento) === 11 || len(documento) === 14;
    const dadosCadastrais: Record<string, string> = {};
    for (const [campo, valor] of campos) if (!CAMPOS_CENTRAIS.has(campo) && valor) dadosCadastrais[campo] = valor;
    // O tipo vem do relatório, nunca de uma coluna da linha: fica no resultado pai.
    resultado.push({
      numeroLinha: indice + 1,
      documento: valido ? documento : null,
      razaoSocial: campos.get("razao_social") || null,
      nomeFantasia: campos.get("nome") || null,
      contaNumero: inteiroPlanilha(campos.get("conta") ?? ""),
      dadosCadastrais,
      documentoValido: valido,
      erroDocumento: !documento ? "documento_ausente" : valido ? null : "documento_invalido",
    });
  }
  return resultado;
}
