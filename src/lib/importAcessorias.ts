// Regras da importação do relatório de empresas do Acessórias.
//
// A leitura do arquivo fica em `lerPlanilhaAcessorias`; tudo que decide o que
// vira o quê está em `planejarImportacao`, que é função pura e testada. O
// script (`scripts/importar-acessorias.ts`) só executa o plano.

import { planejarGrupos, type EmpresaParaAgrupar } from "@/lib/clientGroups";

/** Uma linha do relatório, já limpa. O arquivo repete a empresa por contato. */
export type LinhaAcessorias = {
  externalId: string;
  cnpj: string;
  name: string;
  tradeName: string | null;
  taxRegime: string | null;
  foundationDate: Date | null;
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  nire: string | null;
  phone: string | null;
  website: string | null;
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
};

export type EmpresaDaPlanilha = Omit<
  LinhaAcessorias,
  "contatoNome" | "contatoEmail" | "contatoTelefone"
> & {
  /** "BLD LOGISTICA LTDA - Filial 02" já vem pronto do Acessórias. */
  displayName: string | null;
};

export type ContatoPlanejado = {
  cnpjEmpresa: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/**
 * Domínios da casa. Contato com e-mail nestes domínios é gente da 41 lançada
 * como contato da empresa cliente — importar criaria a mesma pessoa centenas
 * de vezes, uma por empresa que ela atende.
 */
const DOMINIOS_INTERNOS = ["41contabil.com.br", "41bpo.com.br", "41tech.cloud"];

/**
 * Nomes que não identificam ninguém. "Cliente" aparece 245 vezes no arquivo e
 * "BPO" 42 — são rótulos de papel, não pessoas.
 */
const NOMES_GENERICOS = new Set([
  "cliente",
  "clientes",
  "geral",
  "principal",
  "bpo",
  "contato",
  "financeiro",
  "comercial",
  "adm",
  "administrativo",
  "rh",
  "fiscal",
  "contabil",
  "contábil",
]);

/**
 * Decide se um contato do arquivo vira `Person` no Connect.
 *
 * Três recusas, todas medidas no arquivo real de 02/09: sem nome não dá para
 * cadastrar; nome genérico viraria uma pessoa chamada "Cliente"; e e-mail de
 * domínio da casa é colega, não contato do cliente. Um nome só (sem sobrenome)
 * também sai — "Tatiane" aparece 374 vezes espalhada por empresas diferentes,
 * e não há como saber se é a mesma pessoa.
 */
export function contatoAproveitavel(nome: string | null, email: string | null): boolean {
  const n = (nome ?? "").trim();
  if (!n) return false;
  if (NOMES_GENERICOS.has(n.toLowerCase())) return false;
  if (n.split(/\s+/).length < 2) return false;

  const dominio = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (dominio && DOMINIOS_INTERNOS.includes(dominio)) return false;

  return true;
}

/**
 * O que mostrar na listagem. O Acessórias já nomeia a filial com sufixo
 * ("... - Filial 02"), que é exatamente o nome curto que o time usa; para a
 * matriz não há sufixo e a razão social basta, então fica nulo.
 */
export function displayNameDaLinha(name: string, cnpj: string): string | null {
  const ehFilial = cnpj.length === 14 && cnpj.slice(8, 12) !== "0001";
  return ehFilial ? name : null;
}

export type PlanoDeImportacao = {
  totalLinhas: number;
  totalContatos: number;
  empresas: EmpresaDaPlanilha[];
  novas: EmpresaDaPlanilha[];
  jaExistem: { cnpj: string; id: string }[];
  divergenciasDeNome: { cnpj: string; nomeAtual: string; nomeNovo: string }[];
  /**
   * Empresas cadastradas com nome divergente, que serão APAGADAS e recriadas a
   * partir do arquivo — o Acessórias é a fonte real.
   *
   * O Kauan confirmou em 2026-09-02 que os vínculos que existiam nelas (3
   * serviços contratados e 2 documentos de cliente na ex-Karoline) eram de
   * teste. Sem essa confirmação a decisão teria sido outra: documento de
   * cliente guarda prova de recebimento com IP e data-hora, que não se recria.
   *
   * Elas também entram em `novas`, porque depois de apagadas é isso que são.
   */
  substituicoes: { id: string; cnpj: string; nomeAtual: string }[];
  clientesNovos: { name: string; cnpjRoot: string; empresas: string[] }[];
  clientesExistentes: { id: string; cnpjRoot: string }[];
  filiais: { cnpjFilial: string; cnpjMatriz: string }[];
  filiaisSemMatriz: { cnpj: string; name: string }[];
  /**
   * Raízes de CNPJ que já têm MAIS DE UM cliente no tenant.
   *
   * Aconteceu de verdade em 02/09 e passou em silêncio: a raiz 17122471 tinha
   * "Gabriel BLD" (com a matriz dentro) e um "BLD LOGISTICA LTDA" vazio. O
   * `Map` por raiz ficava com o último, então as 20 filiais entraram num
   * cliente e a matriz continuou no outro — e a listagem, que agrupa por
   * cliente antes de montar a árvore, mostrou os dois em blocos separados.
   *
   * Agora é reportado: escolher em silêncio entre dois clientes plausíveis não
   * é decisão de script.
   */
  raizesAmbiguas: { cnpjRoot: string; clientes: string[] }[];
  contatos: ContatoPlanejado[];
};

/**
 * Monta o plano completo sem tocar no banco.
 *
 * A empresa é identificada pelo CNPJ, não pelo ID do Acessórias: o ID é do
 * outro sistema e pode ser reatribuído; o CNPJ é o que o índice único do banco
 * protege, e é por ele que o módulo fiscal vai casar documento com empresa.
 */
export function planejarImportacao(
  linhas: LinhaAcessorias[],
  existentes: { id: string; cnpj: string | null; name: string }[],
  gruposExistentes: { id: string; name: string; cnpjRoot: string | null }[]
): PlanoDeImportacao {
  // 1. Uma empresa por CNPJ — o arquivo repete a empresa a cada contato.
  const porCnpj = new Map<string, EmpresaDaPlanilha>();
  const contatosBrutos: { cnpj: string; nome: string | null; email: string | null; phone: string | null }[] = [];

  for (const l of linhas) {
    if (l.cnpj && !porCnpj.has(l.cnpj)) {
      const { contatoNome, contatoEmail, contatoTelefone, ...resto } = l;
      void contatoNome;
      void contatoEmail;
      void contatoTelefone;
      porCnpj.set(l.cnpj, { ...resto, displayName: displayNameDaLinha(l.name, l.cnpj) });
    }
    if (l.cnpj) {
      contatosBrutos.push({
        cnpj: l.cnpj,
        nome: l.contatoNome,
        email: l.contatoEmail,
        phone: l.contatoTelefone,
      });
    }
  }
  const empresas = [...porCnpj.values()];

  // 2. Quem já está no Connect.
  const existentePorCnpj = new Map(
    existentes.filter((e) => e.cnpj).map((e) => [e.cnpj!.replace(/\D/g, ""), e])
  );
  const novas: EmpresaDaPlanilha[] = [];
  const jaExistem: { cnpj: string; id: string }[] = [];
  const divergenciasDeNome: { cnpj: string; nomeAtual: string; nomeNovo: string }[] = [];
  const substituicoes: { id: string; cnpj: string; nomeAtual: string }[] = [];

  for (const e of empresas) {
    const atual = existentePorCnpj.get(e.cnpj);
    if (!atual) {
      novas.push(e);
      continue;
    }
    if (atual.name.trim().toLowerCase() !== e.name.trim().toLowerCase()) {
      divergenciasDeNome.push({ cnpj: e.cnpj, nomeAtual: atual.name, nomeNovo: e.name });
      substituicoes.push({ id: atual.id, cnpj: e.cnpj, nomeAtual: atual.name });
      // Vai ser apagada, então entra como nova — inclusive no agrupamento por
      // raiz, que precisa enxergá-la para dar cliente à empresa recriada.
      novas.push(e);
      continue;
    }
    jaExistem.push({ cnpj: e.cnpj, id: atual.id });
  }

  // 3. Clientes, pela raiz do CNPJ. Reusa a regra que o backfill já usou.
  const paraAgrupar: EmpresaParaAgrupar[] = novas.map((e) => ({ id: e.cnpj, name: e.name, cnpj: e.cnpj }));
  // Agrupa por raiz em vez de `new Map(...)` direto: o Map descarta o anterior
  // quando a chave repete, que foi exatamente como a BLD se partiu em dois.
  const gruposPorRaiz = new Map<string, { id: string; name: string }[]>();
  for (const g of gruposExistentes) {
    if (!g.cnpjRoot) continue;
    const lista = gruposPorRaiz.get(g.cnpjRoot) ?? [];
    lista.push({ id: g.id, name: g.name });
    gruposPorRaiz.set(g.cnpjRoot, lista);
  }
  const raizesAmbiguas = [...gruposPorRaiz.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([cnpjRoot, l]) => ({ cnpjRoot, clientes: l.map((g) => g.name) }));
  const clientesNovos: { name: string; cnpjRoot: string; empresas: string[] }[] = [];
  const clientesExistentes: { id: string; cnpjRoot: string }[] = [];

  for (const g of planejarGrupos(paraAgrupar)) {
    if (!g.cnpjRoot) continue;
    const candidatos = gruposPorRaiz.get(g.cnpjRoot);
    if (candidatos && candidatos.length > 0) {
      // Com mais de um candidato a escolha é arbitrária; `raizesAmbiguas` avisa
      // para alguém unificar antes de rodar, em vez de descobrir na tela depois.
      clientesExistentes.push({ id: candidatos[0].id, cnpjRoot: g.cnpjRoot });
      continue;
    }
    clientesNovos.push({
      name: g.name,
      cnpjRoot: g.cnpjRoot,
      empresas: g.empresas.map((e) => e.name),
    });
  }

  // 4. Filiais: estabelecimento 0001 é a matriz da sua raiz. Vale para todas as
  // empresas do arquivo, não só as novas — uma filial nova pode pendurar numa
  // matriz que já estava no Connect.
  const matrizPorRaiz = new Map<string, string>();
  const todosOsCnpjs = new Set([...empresas.map((e) => e.cnpj), ...existentePorCnpj.keys()]);
  for (const c of todosOsCnpjs) {
    if (c.length === 14 && c.slice(8, 12) === "0001") matrizPorRaiz.set(c.slice(0, 8), c);
  }

  const filiais: { cnpjFilial: string; cnpjMatriz: string }[] = [];
  const filiaisSemMatriz: { cnpj: string; name: string }[] = [];
  for (const e of empresas) {
    if (e.cnpj.length !== 14 || e.cnpj.slice(8, 12) === "0001") continue;
    const matriz = matrizPorRaiz.get(e.cnpj.slice(0, 8));
    if (matriz) filiais.push({ cnpjFilial: e.cnpj, cnpjMatriz: matriz });
    else filiaisSemMatriz.push({ cnpj: e.cnpj, name: e.name });
  }

  // 5. Contatos, com a peneira e sem repetir a mesma pessoa na mesma empresa.
  const vistos = new Set<string>();
  const contatos: ContatoPlanejado[] = [];
  for (const c of contatosBrutos) {
    if (!contatoAproveitavel(c.nome, c.email)) continue;
    const chave = `${c.cnpj}|${c.nome!.trim().toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    contatos.push({
      cnpjEmpresa: c.cnpj,
      name: c.nome!.trim().slice(0, 180),
      email: c.email?.trim().slice(0, 120) || null,
      phone: c.phone?.trim().slice(0, 30) || null,
    });
  }

  return {
    totalLinhas: linhas.length,
    totalContatos: contatosBrutos.length,
    empresas,
    novas,
    jaExistem,
    divergenciasDeNome,
    substituicoes,
    clientesNovos,
    clientesExistentes,
    filiais,
    filiaisSemMatriz,
    raizesAmbiguas,
    contatos,
  };
}

/**
 * Lê o .xlsx do Acessórias. Só a leitura vive aqui — nenhuma regra.
 *
 * Usa `exceljs`, que já é dependência do projeto. É assíncrono, daí o Promise:
 * trazer uma segunda biblioteca de planilha só para ter API síncrona não paga.
 *
 * O arquivo tem uma linha por CONTATO, então a mesma empresa aparece várias
 * vezes — quem desduplica é `planejarImportacao`, não esta função.
 */
export async function lerPlanilhaAcessorias(caminho: string): Promise<LinhaAcessorias[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const cabecalho = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const nome = String(cell.value ?? "").trim();
    if (nome && !cabecalho.has(nome)) cabecalho.set(nome, col);
  });

  const bruto = (row: import("exceljs").Row, coluna: string): unknown => {
    const col = cabecalho.get(coluna);
    if (!col) return null;
    const v = row.getCell(col).value;
    // Célula de e-mail vira hyperlink no exceljs; o texto é o que interessa.
    if (v && typeof v === "object" && "text" in v) return (v as { text: unknown }).text;
    if (v && typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
    return v;
  };

  const txt = (v: unknown, max: number): string | null => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  const dig = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

  const saida: LinhaAcessorias[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const cnpj = dig(bruto(row, "CNPJ"));
    const name = txt(bruto(row, "Razão social"), 180);
    if (!cnpj || !name) continue;

    const abertura = bruto(row, "Data de abertura");
    const foundationDate =
      abertura instanceof Date
        ? abertura
        : (() => {
            const s = String(abertura ?? "").trim();
            if (!s) return null;
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? null : d;
          })();

    saida.push({
      externalId: txt(bruto(row, "ID"), 60) ?? "",
      cnpj,
      name,
      tradeName: txt(bruto(row, "Nome fantasia"), 180),
      taxRegime: txt(bruto(row, "Regime"), 100),
      foundationDate,
      zipCode: txt(bruto(row, "CEP"), 10),
      addressStreet: txt(bruto(row, "Endereço"), 180),
      addressNumber: txt(bruto(row, "Número"), 20),
      addressComplement: txt(bruto(row, "Complemento"), 80),
      neighborhood: txt(bruto(row, "Bairro"), 80),
      city: txt(bruto(row, "Cidade"), 80),
      stateCode: txt(bruto(row, "UF"), 2),
      // Vem como "UF: PR - IE: 907.75988-10" — guarda só o número.
      stateRegistration: txt(String(bruto(row, "Inscrições Estaduais") ?? "").split("IE:").pop(), 40),
      municipalRegistration: txt(bruto(row, "Insc. Municipal"), 40),
      nire: txt(bruto(row, "NIRE"), 20),
      phone: txt(bruto(row, "Fone"), 30),
      website: txt(bruto(row, "Website da empresa"), 255),
      contatoNome: txt(bruto(row, "Nome do Contato"), 180),
      contatoEmail: txt(bruto(row, "Email do Contato"), 120),
      contatoTelefone: txt(bruto(row, "Telefone do Contato"), 30),
    });
  }
  return saida;
}
