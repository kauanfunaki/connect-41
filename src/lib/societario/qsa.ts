// O quadro de sócios da Receita (QSA) → sócios da empresa no Connect. Funções puras.
//
// ─── De onde vem ─────────────────────────────────────────────────────────────
//
// BrasilAPI (`/api/cnpj/v1/{cnpj}`), a mesma que o cadastro de empresa já usa
// para preencher razão social e endereço. Formato visto numa resposta real em
// 25/09 (41 TEC):
//
//   qsa: [{ nome_socio, cnpj_cpf_do_socio: "***504269**", qualificacao_socio:
//           "Sócio-Administrador", codigo_qualificacao_socio: 49,
//           data_entrada_sociedade: "2026-01-21", identificador_de_socio: 2 }]
//
// `identificador_de_socio`: 1 pessoa jurídica (CNPJ inteiro), 2 pessoa física
// (CPF mascarado — só os seis do meio são públicos), 3 estrangeiro.
//
// ─── O que a Receita não diz ─────────────────────────────────────────────────
//
// Participação, quotas, capital de cada sócio e endereço: estão no contrato
// social, não no QSA. A importação traz quem é sócio, desde quando e com que
// papel; o resto continua sendo preenchido à mão.
//
// ─── Casar com quem já está cadastrado ───────────────────────────────────────
//
// Pelo documento quando a Receita dá o inteiro (sócio PJ); pelo nome **e** os
// seis dígitos visíveis quando é CPF mascarado. Só o nome não basta — pai e
// filho com o mesmo nome no mesmo quadro existem —, e só os dígitos também não.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v: unknown): string => texto(v).replace(/\D/g, "");

/** Nome para comparar: sem acento, sem caixa, sem espaço duplo. */
export function nomeComparavel(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Qualificações de quem administra: sócio-administrador (49), administrador
// (5), diretor (10), presidente (16) e o titular da empresa individual (65).
const ADMINISTRA = new Set([5, 10, 16, 49, 65]);

export type SocioDaReceita = {
  nome: string;
  /** CNPJ inteiro do sócio pessoa jurídica. */
  documento: string | null;
  /** CPF mascarado do sócio pessoa física ("***504269**"). */
  documentoMascarado: string | null;
  qualificacao: string | null;
  administrador: boolean;
  entrada: Date | null;
};

export function lerQsa(corpo: unknown): SocioDaReceita[] {
  const lista = obj(corpo).qsa;
  if (!Array.isArray(lista)) return [];
  const saida: SocioDaReceita[] = [];
  for (const item of lista.map(obj)) {
    const nome = texto(item.nome_socio).replace(/\s+/g, " ").slice(0, 180);
    if (!nome) continue;
    const bruto = texto(item.cnpj_cpf_do_socio);
    const soDigitos = digitos(bruto);
    const pj = soDigitos.length === 14 && !bruto.includes("*");
    const dataTexto = texto(item.data_entrada_sociedade);
    const entrada = /^\d{4}-\d{2}-\d{2}$/.test(dataTexto) ? new Date(`${dataTexto}T12:00:00Z`) : null;
    const codigo = Number(item.codigo_qualificacao_socio);
    saida.push({
      nome,
      documento: pj ? soDigitos : null,
      documentoMascarado: !pj && bruto.includes("*") ? bruto.slice(0, 20) : null,
      qualificacao: texto(item.qualificacao_socio).slice(0, 80) || null,
      administrador: ADMINISTRA.has(codigo),
      entrada,
    });
  }
  return saida;
}

export type SocioCadastrado = {
  id: string;
  name: string;
  document: string | null;
  documentMasked: string | null;
  exitDate: Date | null;
};

/** Os seis dígitos públicos de um CPF, venham do mascarado ou do inteiro. */
function meioDoCpf(s: { document: string | null; documentMasked: string | null }): string | null {
  if (s.document && s.document.length === 11) return s.document.slice(3, 9);
  const m = s.documentMasked ? digitos(s.documentMasked) : "";
  return m.length === 6 ? m : null;
}

export function mesmoSocio(cadastrado: SocioCadastrado, daReceita: SocioDaReceita): boolean {
  if (daReceita.documento) return cadastrado.document === daReceita.documento;
  if (nomeComparavel(cadastrado.name) !== nomeComparavel(daReceita.nome)) return false;
  const meioReceita = daReceita.documentoMascarado ? digitos(daReceita.documentoMascarado) : null;
  const meioCadastro = meioDoCpf(cadastrado);
  // Nome igual e um dos lados sem dígito nenhum: é o mesmo — o cadastro manual
  // sem documento é o caso mais comum, e dois homônimos sem CPF não se separam
  // de jeito nenhum.
  if (!meioReceita || !meioCadastro) return true;
  return meioReceita === meioCadastro;
}

export type PlanoDaImportacao = {
  /** Na Receita e não no Connect: entram. */
  novos: SocioDaReceita[];
  /** Nos dois: o Connect ganha qualificação e entrada, se estiverem vazias. */
  jaCadastrados: { id: string; daReceita: SocioDaReceita }[];
  /** No Connect, atuais, e fora da Receita: provável saída — ninguém é tirado sozinho. */
  foraDaReceita: SocioCadastrado[];
};

export function planejarImportacao(cadastrados: SocioCadastrado[], daReceita: SocioDaReceita[]): PlanoDaImportacao {
  const usados = new Set<string>();
  const plano: PlanoDaImportacao = { novos: [], jaCadastrados: [], foraDaReceita: [] };
  for (const r of daReceita) {
    const par = cadastrados.find((c) => !usados.has(c.id) && mesmoSocio(c, r));
    if (par) {
      usados.add(par.id);
      plano.jaCadastrados.push({ id: par.id, daReceita: r });
    } else {
      plano.novos.push(r);
    }
  }
  plano.foraDaReceita = cadastrados.filter((c) => !usados.has(c.id) && c.exitDate === null);
  return plano;
}
