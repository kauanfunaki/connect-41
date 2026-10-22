// Os tipos de decisão do motor SPED (API-CONNECT §5), como o Connect os mostra
// e edita (22/10/2026).
//
// Puro, sem servidor: a tela desenha os formulários a partir daqui e a Server
// Action monta a validação com a mesma definição. A regra fiscal de cada campo
// continua no motor (o mesmo `_limpar`/`salvar_*` do painel); aqui só a forma —
// tamanho, formato e lista fechada —, para recusar cedo o que o motor
// recusaria com 422 e não mandar campo que ele não conhece.

export const TIPOS_DE_DECISAO = [
  "classificacao_item",
  "credito_icms_item",
  "ajuste_apuracao",
  "ajuste_contribuicoes",
  "decisao_registro_contribuicoes",
  "parametro_contribuicoes",
  "documento_excluido",
  "entrega_competencia",
  "documento_apoio_categoria",
  "credito_documento_apoio",
] as const;
export type TipoDeDecisao = (typeof TIPOS_DE_DECISAO)[number];

export type TipoDoCampo = "texto" | "cnpj" | "competencia" | "competencias" | "decimal" | "data" | "escolha" | "id";

export type CampoDeDecisao = {
  nome: string;
  rotulo: string;
  tipo: TipoDoCampo;
  /** Tamanho máximo (texto). */
  max?: number;
  /** Tamanho mínimo (texto), quando o motor exige. */
  min?: number;
  /** Lista fechada; `""` pode ser uma opção (por exemplo, "seguir a destinação"). */
  opcoes?: { valor: string; rotulo: string }[];
  /** `null` é valor aceito (receita bruta "sem valor"). */
  anulavel?: boolean;
  /** Formato extra do texto (CFOP, código de 2 dígitos). */
  formato?: RegExp;
  /** CNPJ de estabelecimento da raiz: a Server Action confere o alcance. */
  estabelecimento?: boolean;
  /** Só na criação (POST) ou só na edição (PUT). */
  so?: "criar" | "editar";
};

export type DefinicaoDeDecisao = {
  tipo: TipoDeDecisao;
  rotulo: string;
  /** A tabela do motor — é o nome que aparece no registro de decisões. */
  tabela: string;
  /** O módulo do Connect que lê e grava (API-CONNECT §8.2). */
  modulo: string;
  chave: CampoDeDecisao[];
  valor: CampoDeDecisao[];
  /** Os filtros que o GET aceita; nos outros, o motor responde 422. */
  filtros: readonly ("competencia" | "cnpj")[];
  /** DELETE existe (os outros respondem 405). */
  apagar: boolean;
  /** Criação por POST (chave `id`, os ajustes); nos outros, criar é PUT com chave nova. */
  criarPorPost: boolean;
  /** A tela oferece "Nova decisão" (sem isso, só edita o que existe). */
  criar: boolean;
  /** As colunas da lista, das chaves e dos valores; o resto fica no formulário. */
  colunas: string[];
  /** Fica fora do Connect até D4 (API-CONNECT §5.1, item 7). */
  oculto?: boolean;
};

const competencia: CampoDeDecisao = { nome: "competencia", rotulo: "Competência", tipo: "competencia" };
const cnpjEmit: CampoDeDecisao = { nome: "cnpj_emit", rotulo: "CNPJ do fornecedor", tipo: "cnpj" };
const codProd: CampoDeDecisao = { nome: "cod_prod", rotulo: "Código do produto", tipo: "texto", min: 1, max: 60 };
const id: CampoDeDecisao = { nome: "id", rotulo: "Id", tipo: "id" };
const SIM_NAO = [{ valor: "S", rotulo: "Sim" }, { valor: "N", rotulo: "Não" }];

/** Tipo do item no SPED (0200, campo 7). */
export const TIPOS_DE_ITEM = [
  ["00", "Mercadoria para revenda"], ["01", "Matéria-prima"], ["02", "Embalagem"], ["03", "Produto em processo"],
  ["04", "Produto acabado"], ["05", "Subproduto"], ["06", "Produto intermediário"], ["07", "Material de uso e consumo"],
  ["08", "Ativo imobilizado"], ["09", "Serviços"], ["10", "Outros insumos"], ["99", "Outras"],
].map(([valor, rotulo]) => ({ valor, rotulo: `${valor} · ${rotulo}` }));

export const DECISOES: Readonly<Record<TipoDeDecisao, DefinicaoDeDecisao>> = {
  classificacao_item: {
    tipo: "classificacao_item", rotulo: "Classificação do produto", tabela: "classificacao_itens", modulo: "fiscal_classificacao",
    chave: [cnpjEmit, codProd],
    valor: [
      { nome: "tipo_item", rotulo: "Tipo do item", tipo: "escolha", opcoes: TIPOS_DE_ITEM },
      { nome: "definicao", rotulo: "Destinação (CFOP)", tipo: "texto", max: 4, formato: /^[12]?\d{3}$/ },
      { nome: "credito_pis_cofins", rotulo: "Crédito de PIS/COFINS", tipo: "escolha", opcoes: [{ valor: "", rotulo: "Seguir a destinação" }, ...SIM_NAO] },
      { nome: "descricao", rotulo: "Descrição", tipo: "texto", max: 255 },
      { nome: "ncm", rotulo: "NCM", tipo: "texto", max: 8 },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 255 },
    ],
    filtros: [], apagar: false, criarPorPost: false, criar: true,
    colunas: ["cnpj_emit", "cod_prod", "descricao", "tipo_item", "definicao", "credito_pis_cofins"],
  },
  credito_icms_item: {
    tipo: "credito_icms_item", rotulo: "Crédito de ICMS por item", tabela: "credito_icms_item", modulo: "fiscal_classificacao",
    chave: [cnpjEmit, codProd, competencia, { nome: "cnpj_empresa", rotulo: "Estabelecimento", tipo: "cnpj", estabelecimento: true }],
    valor: [
      { nome: "valor", rotulo: "Crédito de ICMS", tipo: "decimal" },
      { nome: "valor_original", rotulo: "Valor original", tipo: "decimal" },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 255 },
    ],
    filtros: ["competencia", "cnpj"], apagar: true, criarPorPost: false, criar: true,
    colunas: ["cnpj_emit", "cod_prod", "competencia", "cnpj_empresa", "valor", "valor_original"],
  },
  ajuste_apuracao: {
    tipo: "ajuste_apuracao", rotulo: "Ajuste da apuração do ICMS", tabela: "ajustes_apuracao", modulo: "fiscal_icms_ipi",
    chave: [id],
    valor: [
      { nome: "cnpj_empresa", rotulo: "Estabelecimento", tipo: "cnpj", estabelecimento: true },
      competencia,
      { nome: "codigo", rotulo: "Código (COD_AJ_APUR)", tipo: "texto", min: 1, max: 10 },
      { nome: "descricao", rotulo: "Descrição", tipo: "texto", min: 5, max: 255 },
      { nome: "valor", rotulo: "Valor", tipo: "decimal" },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 500 },
      { nome: "dime_item_credito", rotulo: "DIME · item de crédito", tipo: "texto", max: 3 },
      { nome: "dime_item_debito", rotulo: "DIME · item de débito", tipo: "texto", max: 3 },
      { nome: "dcip_numero", rotulo: "DCIP · número", tipo: "texto", max: 15 },
      { nome: "dcip_origem", rotulo: "DCIP · origem", tipo: "texto", max: 2 },
      { nome: "cod_receita", rotulo: "Código de receita", tipo: "texto", max: 4 },
      { nome: "classe_vencimento", rotulo: "Classe de vencimento", tipo: "texto", max: 5 },
      { nome: "dt_vencimento", rotulo: "Vencimento", tipo: "data" },
      { nome: "dt_pagamento", rotulo: "Pagamento", tipo: "data" },
      { nome: "numero_acordo", rotulo: "Número do acordo", tipo: "texto", max: 15 },
      { nome: "base_calculo", rotulo: "Base de cálculo", tipo: "decimal" },
    ],
    filtros: ["competencia", "cnpj"], apagar: true, criarPorPost: true, criar: true,
    colunas: ["competencia", "cnpj_empresa", "codigo", "descricao", "natureza", "valor"],
  },
  ajuste_contribuicoes: {
    tipo: "ajuste_contribuicoes", rotulo: "Ajuste do bloco M", tabela: "ajustes_contribuicoes", modulo: "fiscal_contribuicoes",
    chave: [id],
    valor: [
      { nome: "competencias", rotulo: "Competências", tipo: "competencias", so: "criar" },
      { ...competencia, so: "editar" },
      { nome: "imposto", rotulo: "Imposto", tipo: "escolha", opcoes: [{ valor: "pis", rotulo: "PIS" }, { valor: "cofins", rotulo: "COFINS" }, { valor: "ambos", rotulo: "PIS e COFINS" }] },
      { nome: "operacao", rotulo: "Operação", tipo: "escolha", opcoes: [{ valor: "credito", rotulo: "Crédito" }, { valor: "contribuicao", rotulo: "Contribuição" }] },
      { nome: "ind_aj", rotulo: "Sentido", tipo: "escolha", opcoes: [{ valor: "1", rotulo: "Acréscimo" }, { valor: "0", rotulo: "Redução" }] },
      { nome: "cod_cred", rotulo: "Código do crédito", tipo: "texto", max: 3 },
      { nome: "cod_aj", rotulo: "Código do ajuste", tipo: "texto", max: 2 },
      { nome: "descricao", rotulo: "Descrição", tipo: "texto", min: 5, max: 255 },
      { nome: "num_doc", rotulo: "Número do documento", tipo: "texto", max: 60 },
      { nome: "dt_ref", rotulo: "Data de referência", tipo: "data" },
      { nome: "base_calculo", rotulo: "Base de cálculo", tipo: "decimal" },
      { nome: "aliquota", rotulo: "Alíquota", tipo: "decimal" },
      { nome: "valor", rotulo: "Valor", tipo: "decimal" },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 500 },
    ],
    filtros: ["competencia"], apagar: true, criarPorPost: true, criar: true,
    colunas: ["competencia", "imposto", "operacao", "ind_aj", "cod_aj", "descricao", "valor"],
  },
  decisao_registro_contribuicoes: {
    tipo: "decisao_registro_contribuicoes", rotulo: "Decisão por registro", tabela: "decisoes_registro_contribuicoes", modulo: "fiscal_contribuicoes",
    chave: [competencia, { nome: "chave_registro", rotulo: "Registro", tipo: "texto", min: 1, max: 180 }],
    valor: [
      { nome: "tipo", rotulo: "Tipo", tipo: "escolha", opcoes: [{ valor: "mercadoria", rotulo: "Mercadoria" }, { valor: "servico_tomado", rotulo: "Serviço tomado" }] },
      { nome: "cnpj_fornecedor", rotulo: "CNPJ do fornecedor", tipo: "texto", max: 14 },
      { nome: "cod_item", rotulo: "Código do item", tipo: "texto", max: 60 },
      { nome: "cfop", rotulo: "CFOP", tipo: "texto", max: 4 },
      { nome: "num_doc", rotulo: "Número do documento", tipo: "texto", max: 60 },
      { nome: "cst", rotulo: "CST", tipo: "texto", max: 2 },
      { nome: "vinculo_cred", rotulo: "Vínculo do crédito", tipo: "texto", max: 3 },
      { nome: "nat_bc_cred", rotulo: "Natureza da base do crédito", tipo: "texto", max: 2 },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 500 },
    ],
    // Fase 3: a API não lista os registros de entrada; só edita o que já existe.
    filtros: ["competencia"], apagar: true, criarPorPost: false, criar: false,
    colunas: ["competencia", "chave_registro", "tipo", "cst", "vinculo_cred", "nat_bc_cred"],
  },
  parametro_contribuicoes: {
    tipo: "parametro_contribuicoes", rotulo: "Parâmetros da competência", tabela: "parametros_contribuicoes", modulo: "fiscal_contribuicoes",
    chave: [competencia],
    valor: [
      { nome: "receita_bruta", rotulo: "Receita bruta", tipo: "decimal", anulavel: true },
      { nome: "tipo_escrit", rotulo: "Tipo da escrituração", tipo: "escolha", opcoes: [{ valor: "0", rotulo: "Original" }, { valor: "1", rotulo: "Retificadora" }] },
      { nome: "num_rec_anterior", rotulo: "Recibo anterior", tipo: "texto", max: 60 },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 500 },
    ],
    filtros: ["competencia"], apagar: false, criarPorPost: false, criar: true,
    colunas: ["competencia", "receita_bruta", "tipo_escrit", "num_rec_anterior"],
  },
  documento_excluido: {
    tipo: "documento_excluido", rotulo: "Documento excluído", tabela: "documentos_excluidos", modulo: "fiscal_classificacao",
    chave: [{ nome: "chave", rotulo: "Chave de acesso", tipo: "texto", min: 44, max: 44, formato: /^\d{44}$/ }],
    valor: [
      { nome: "motivo", rotulo: "Motivo", tipo: "texto", min: 5, max: 255 },
      competencia,
      { nome: "tipo", rotulo: "Tipo", tipo: "escolha", opcoes: [{ valor: "", rotulo: "Pela chave" }, { valor: "nfe", rotulo: "NF-e" }, { valor: "cte", rotulo: "CT-e" }] },
      { nome: "origem", rotulo: "Origem", tipo: "texto", max: 120 },
    ],
    filtros: ["competencia"], apagar: true, criarPorPost: false, criar: false, oculto: true,
    colunas: ["chave", "competencia", "motivo"],
  },
  entrega_competencia: {
    tipo: "entrega_competencia", rotulo: "Arquivo que vale na entrega", tabela: "entrega_competencia", modulo: "fiscal_entregas",
    chave: [
      { nome: "obrigacao", rotulo: "Obrigação", tipo: "escolha", opcoes: [{ valor: "icms_ipi", rotulo: "EFD ICMS/IPI" }, { valor: "contribuicoes", rotulo: "EFD Contribuições" }] },
      { nome: "cnpj", rotulo: "Estabelecimento", tipo: "cnpj", estabelecimento: true },
      competencia,
    ],
    valor: [
      { nome: "origem", rotulo: "Origem", tipo: "escolha", opcoes: [{ valor: "nosso", rotulo: "Arquivo do motor" }, { valor: "dominio", rotulo: "Arquivo da Domínio" }] },
      { nome: "motivo", rotulo: "Motivo", tipo: "texto", max: 200 },
    ],
    filtros: ["competencia", "cnpj"], apagar: true, criarPorPost: false, criar: true,
    colunas: ["obrigacao", "cnpj", "competencia", "origem", "motivo"],
  },
  documento_apoio_categoria: {
    tipo: "documento_apoio_categoria", rotulo: "Categoria do documento de apoio", tabela: "documentos_apoio", modulo: "fiscal_classificacao",
    chave: [{ nome: "caminho", rotulo: "Documento", tipo: "texto", min: 1, max: 700 }],
    valor: [{ nome: "categoria", rotulo: "Categoria", tipo: "texto", min: 1, max: 120 }],
    filtros: ["competencia"], apagar: false, criarPorPost: false, criar: false,
    colunas: ["caminho", "categoria"],
  },
  credito_documento_apoio: {
    tipo: "credito_documento_apoio", rotulo: "Crédito do documento de apoio", tabela: "credito_documento_apoio", modulo: "fiscal_classificacao",
    chave: [
      { nome: "categoria", rotulo: "Categoria", tipo: "texto", min: 1, max: 40 },
      { nome: "fornecedor", rotulo: "Fornecedor (vazio = categoria inteira)", tipo: "texto", max: 200 },
    ],
    valor: [
      { nome: "credito", rotulo: "Crédito", tipo: "escolha", opcoes: SIM_NAO },
      { nome: "nat_bc_cred", rotulo: "Natureza da base do crédito", tipo: "texto", max: 2 },
      { nome: "nome", rotulo: "Nome", tipo: "texto", max: 200 },
      { nome: "cnpj", rotulo: "CNPJ", tipo: "texto", max: 14, formato: /^(\d{11}|\d{14})?$/ },
      { nome: "observacao", rotulo: "Observação", tipo: "texto", max: 300 },
    ],
    filtros: [], apagar: true, criarPorPost: false, criar: true,
    colunas: ["categoria", "fornecedor", "credito", "nat_bc_cred", "nome"],
  },
};

/** Tipos que a tela oferece (o `documento_excluido` só depois de D4). */
export const TIPOS_VISIVEIS = TIPOS_DE_DECISAO.filter((t) => !DECISOES[t].oculto);

export function ehTipoDeDecisao(v: unknown): v is TipoDeDecisao {
  return typeof v === "string" && (TIPOS_DE_DECISAO as readonly string[]).includes(v);
}

export const DECIMAL = /^-?\d{1,16}(\.\d{1,4})?$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** O rótulo de um campo, procurando nas chaves e nos valores; "natureza" vem derivada no GET dos ajustes. */
export function rotuloDoCampo(def: DefinicaoDeDecisao, nome: string): string {
  if (nome === "natureza") return "Natureza";
  return [...def.chave, ...def.valor].find((c) => c.nome === nome)?.rotulo ?? nome;
}

/** O texto de um valor para a tabela: o rótulo da opção, quando há. */
export function textoDoValor(def: DefinicaoDeDecisao, nome: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  const campo = [...def.chave, ...def.valor].find((c) => c.nome === nome);
  const texto = typeof valor === "string" ? valor : typeof valor === "number" || typeof valor === "boolean" ? String(valor) : JSON.stringify(valor);
  const opcao = campo?.opcoes?.find((o) => o.valor === texto);
  if (opcao) return opcao.rotulo;
  if (nome === "natureza") return texto === "debito" ? "Débito" : texto === "credito" ? "Crédito" : texto === "estorno" ? "Estorno" : texto;
  return texto === "" ? "—" : texto;
}

/**
 * Confere um campo. Devolve o motivo, ou `null` quando vale.
 * Ausência não passa por aqui: no motor, ausente é "não mexer" (§5.0).
 */
export function motivoDoCampo(campo: CampoDeDecisao, valor: unknown): string | null {
  if (valor === null) return campo.anulavel ? null : "não pode ficar sem valor";
  if (campo.tipo === "id") return Number.isSafeInteger(valor) && (valor as number) > 0 ? null : "id inválido";
  if (campo.tipo === "competencias") {
    if (!Array.isArray(valor) || valor.length < 1 || valor.length > 12) return "informe de 1 a 12 competências";
    return valor.every((v) => typeof v === "string" && COMPETENCIA.test(v)) ? null : "competência no formato AAAA-MM";
  }
  if (typeof valor !== "string") return "valor inválido";
  switch (campo.tipo) {
    case "cnpj": return /^\d{14}$/.test(valor) ? null : "CNPJ com 14 dígitos";
    case "competencia": return COMPETENCIA.test(valor) ? null : "competência no formato AAAA-MM";
    case "decimal": return DECIMAL.test(valor) ? null : "número com ponto decimal, até 4 casas";
    case "data": return valor === "" || DATA.test(valor) ? null : "data no formato AAAA-MM-DD";
    case "escolha": return campo.opcoes?.some((o) => o.valor === valor) ? null : "opção inválida";
    default: {
      if (campo.max !== undefined && valor.length > campo.max) return `até ${campo.max} caracteres`;
      if (campo.min !== undefined && valor.length < campo.min) return `ao menos ${campo.min} caracteres`;
      if (campo.formato && valor !== "" && !campo.formato.test(valor)) return "formato inválido";
      return null;
    }
  }
}

export type CorpoDeDecisao =
  | { chave: Record<string, unknown>; chaves?: undefined; valor?: Record<string, unknown> }
  | { chaves: Record<string, unknown>[]; chave?: undefined; valor?: Record<string, unknown> };

/**
 * Confere o corpo de uma gravação (`PUT`/`DELETE`/`POST`) contra a definição:
 * só campos conhecidos, cada um no formato. Devolve os erros por campo, como o
 * `campos` do 422 do motor.
 */
export function conferirCorpo(
  def: DefinicaoDeDecisao,
  operacao: "gravar" | "apagar" | "criar",
  corpo: { chave?: unknown; chaves?: unknown; valor?: unknown },
): Record<string, string> {
  const erros: Record<string, string> = {};
  const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (operacao !== "criar") {
    const chaves = corpo.chaves !== undefined ? corpo.chaves : [corpo.chave];
    if (!Array.isArray(chaves) || chaves.length < 1 || chaves.length > 1000) return { chave: "informe de 1 a 1000 chaves" };
    for (const k of chaves) {
      if (!objeto(k)) return { chave: "chave inválida" };
      for (const nome of Object.keys(k)) if (!def.chave.some((c) => c.nome === nome)) erros[nome] = "campo desconhecido";
      for (const c of def.chave) {
        if (!(c.nome in k)) { erros[c.nome] = "obrigatório na chave"; continue; }
        const m = motivoDoCampo(c, k[c.nome]);
        if (m) erros[c.nome] = m;
      }
    }
  }
  if (operacao === "apagar") return erros;
  if (!objeto(corpo.valor)) return { ...erros, valor: "informe os valores" };
  const fase = operacao === "criar" ? "criar" : "editar";
  for (const [nome, v] of Object.entries(corpo.valor)) {
    const campo = def.valor.find((c) => c.nome === nome && (!c.so || c.so === fase));
    if (!campo) { erros[nome] = "campo desconhecido"; continue; }
    const m = motivoDoCampo(campo, v);
    if (m) erros[nome] = m;
  }
  if (Object.keys(corpo.valor).length === 0) erros.valor = "nenhum valor para gravar";
  return erros;
}

/** Os CNPJs de estabelecimento citados no corpo — a Server Action confere cada um contra o alcance. */
export function cnpjsDeEstabelecimento(def: DefinicaoDeDecisao, corpo: { chave?: unknown; chaves?: unknown; valor?: unknown }): string[] {
  const saida = new Set<string>();
  const ler = (obj: unknown, campos: CampoDeDecisao[]) => {
    if (!obj || typeof obj !== "object") return;
    for (const c of campos) {
      const v = (obj as Record<string, unknown>)[c.nome];
      if (c.estabelecimento && typeof v === "string") saida.add(v);
    }
  };
  const chaves = Array.isArray(corpo.chaves) ? corpo.chaves : [corpo.chave];
  chaves.forEach((k) => ler(k, def.chave));
  ler(corpo.valor, def.valor);
  return [...saida];
}
