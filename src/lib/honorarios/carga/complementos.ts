// Os dados complementares que o Aditiva Pronto guardava para o termo aditivo
// (tabela company_complements) entrando no cadastro do Connect (12/11/2026,
// funcionalidade-643). Regra do Kauan: só preenche o que está vazio no
// Connect, nunca sobrescreve. Puro: o script lê e grava, aqui se decide.

import { mesmoSocio, nomeComparavel } from "@/lib/societario/qsa";
import { digitos } from "./mapear";

export type ComplementoDoAditiva = {
  company_id: string;
  nome_socio: string;
  cpf_socio: string;
  endereco_empresa: string | null;
  numero_empresa: string | null;
  bairro_empresa: string | null;
  cidade_empresa: string | null;
  estado_empresa: string | null;
  cep_empresa: string | null;
  nacionalidade_socio: string | null;
  estado_civil_socio: string | null;
  profissao_socio: string | null;
  endereco_socio: string | null;
  numero_socio: string | null;
  bairro_socio: string | null;
  cidade_socio: string | null;
  estado_socio: string | null;
  cep_socio: string | null;
  contato_administrativo_nome: string | null;
  contato_administrativo_telefone: string | null;
  contato_administrativo_email: string | null;
  contato_financeiro_nome: string | null;
  contato_financeiro_telefone: string | null;
  contato_financeiro_email: string | null;
};

type Endereco = {
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
};

export type EmpresaNoConnect = Endereco & {
  id: string;
  socios: (Endereco & {
    id: string;
    name: string;
    document: string | null;
    documentMasked: string | null;
    administrator: boolean;
    nationality: string | null;
    maritalStatus: string | null;
    occupation: string | null;
  })[];
  /** Papéis que já têm contato no Connect. */
  contatos: string[];
};

type CamposDoSocio = Partial<Endereco> & {
  name?: string;
  document?: string;
  administrator?: boolean;
  nationality?: string;
  maritalStatus?: string;
  occupation?: string;
};

export type PlanoDoComplemento = {
  companyId: string;
  /** Campos vazios do endereço da empresa que o Aditiva preenche. */
  empresa: Partial<Endereco>;
  socio: { acao: "atualizar"; id: string; campos: CamposDoSocio } | { acao: "criar"; campos: CamposDoSocio & { name: string; document: string } } | null;
  contatos: { papel: "ADMINISTRATIVO" | "FINANCEIRO"; nome: string; telefone: string | null; email: string | null }[];
  /** O que não entrou, para o relatório. */
  avisos: string[];
};

const t = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

function enderecoDoAditiva(e: string | null, n: string | null, b: string | null, c: string | null, uf: string | null, cep: string | null): Endereco {
  const ufLimpa = t(uf)?.toUpperCase() ?? null;
  const cepLimpo = digitos(cep);
  return {
    addressStreet: t(e)?.slice(0, 180) ?? null,
    addressNumber: t(n)?.slice(0, 20) ?? null,
    neighborhood: t(b)?.slice(0, 80) ?? null,
    city: t(c)?.slice(0, 80) ?? null,
    stateCode: ufLimpa && /^[A-Z]{2}$/.test(ufLimpa) ? ufLimpa : null,
    zipCode: cepLimpo.length === 8 ? cepLimpo : null,
  };
}

/** Só o que o Connect não tem: campo vazio lá e preenchido no Aditiva. */
function soOsVazios<T extends Record<string, string | null>>(noConnect: Partial<Record<keyof T, string | null>>, doAditiva: T): Partial<Record<keyof T, string>> {
  const saida: Partial<Record<keyof T, string>> = {};
  for (const k of Object.keys(doAditiva) as (keyof T)[]) {
    const novo = doAditiva[k];
    if (novo && !t(noConnect[k] ?? null)) saida[k] = novo;
  }
  return saida;
}

const CPF_VALIDO = (cpf: string) => cpf.length === 11 && !/^(\d)\1{10}$/.test(cpf);

export function planejarComplemento(c: ComplementoDoAditiva, empresa: EmpresaNoConnect): PlanoDoComplemento {
  const avisos: string[] = [];
  const plano: PlanoDoComplemento = {
    companyId: empresa.id,
    empresa: soOsVazios(empresa, enderecoDoAditiva(c.endereco_empresa, c.numero_empresa, c.bairro_empresa, c.cidade_empresa, c.estado_empresa, c.cep_empresa)),
    socio: null,
    contatos: [],
    avisos,
  };

  const cpf = digitos(c.cpf_socio);
  const nome = t(c.nome_socio);
  if (!nome || !CPF_VALIDO(cpf)) {
    avisos.push("sócio sem nome ou com CPF inválido no Aditiva");
  } else {
    const pessoais = {
      nationality: t(c.nacionalidade_socio)?.slice(0, 60) ?? null,
      maritalStatus: t(c.estado_civil_socio)?.slice(0, 40) ?? null,
      occupation: t(c.profissao_socio)?.slice(0, 120) ?? null,
      ...enderecoDoAditiva(c.endereco_socio, c.numero_socio, c.bairro_socio, c.cidade_socio, c.estado_socio, c.cep_socio),
    };
    // Pelo CPF inteiro; senão pelo nome com o meio do CPF (o sócio que veio da Receita).
    const porCpf = empresa.socios.find((s) => s.document === cpf);
    const porNome =
      porCpf ??
      empresa.socios.find(
        (s) =>
          (!s.document || s.document.length !== 14) &&
          mesmoSocio({ ...s, exitDate: null }, { nome, documento: null, documentoMascarado: `***${cpf.slice(3, 9)}**`, qualificacao: null, administrador: true, entrada: null }) &&
          (!s.document || s.document === cpf)
      );
    const temAdministrador = empresa.socios.some((s) => s.administrator);
    if (porNome) {
      const campos: CamposDoSocio = soOsVazios(porNome, pessoais);
      if (!porNome.document) campos.document = cpf;
      // Quem assinava o termo no Aditiva é o administrador; só marca quando a empresa não tem nenhum.
      if (!porNome.administrator && !temAdministrador) campos.administrator = true;
      if (Object.keys(campos).length > 0) plano.socio = { acao: "atualizar", id: porNome.id, campos };
    } else {
      const outroComNome = empresa.socios.some((s) => nomeComparavel(s.name) === nomeComparavel(nome));
      if (outroComNome) avisos.push("sócio com o mesmo nome e outro CPF no Connect: não entrou");
      else {
        const campos = Object.fromEntries(Object.entries(pessoais).filter(([, v]) => v !== null)) as CamposDoSocio;
        plano.socio = { acao: "criar", campos: { ...campos, name: nome.slice(0, 180), document: cpf, administrator: true } };
      }
    }
  }

  for (const [papel, n, tel, email] of [
    ["ADMINISTRATIVO", c.contato_administrativo_nome, c.contato_administrativo_telefone, c.contato_administrativo_email],
    ["FINANCEIRO", c.contato_financeiro_nome, c.contato_financeiro_telefone, c.contato_financeiro_email],
  ] as const) {
    const nomeDoContato = t(n);
    if (!nomeDoContato || empresa.contatos.includes(papel)) continue;
    plano.contatos.push({ papel, nome: nomeDoContato.slice(0, 180), telefone: t(tel)?.slice(0, 30) ?? null, email: t(email)?.toLowerCase().slice(0, 120) ?? null });
  }
  return plano;
}

/** O plano muda alguma coisa? */
export const mudaAlgo = (p: PlanoDoComplemento) => Object.keys(p.empresa).length > 0 || p.socio !== null || p.contatos.length > 0;
