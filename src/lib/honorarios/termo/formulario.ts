// O formulário da tela do termo aditivo: lê e confere o que a pessoa digitou
// antes de gravar no cadastro. Puro, para o teste.

import { lerDocumentoFiscal } from "@/lib/companyTaxId";
import { PAPEIS_DE_CONTATO, type ContatoDoTermo, type EnderecoDoTermo, type EntradaDoContratante, type PapelDoContato } from "./contratante";

const texto = (form: FormData, campo: string, max: number): string | null => {
  const v = String(form.get(campo) ?? "").trim();
  return v ? v.slice(0, max) : null;
};

function endereco(form: FormData, prefixo: string): EnderecoDoTermo | string {
  const uf = texto(form, `${prefixo}uf`, 40)?.toUpperCase() ?? null;
  if (uf && !/^[A-Z]{2}$/.test(uf)) return "UF deve ter duas letras.";
  const cep = texto(form, `${prefixo}cep`, 10)?.replace(/\D/g, "") || null;
  if (cep && cep.length !== 8) return "CEP deve ter 8 números.";
  return {
    logradouro: texto(form, `${prefixo}logradouro`, 180),
    numero: texto(form, `${prefixo}numero`, 20),
    complemento: texto(form, `${prefixo}complemento`, 80),
    bairro: texto(form, `${prefixo}bairro`, 80),
    cidade: texto(form, `${prefixo}cidade`, 80),
    uf,
    cep,
  };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function lerFormularioDoContratante(form: FormData): { ok: true; entrada: EntradaDoContratante } | { ok: false; erro: string } {
  const companyId = texto(form, "companyId", 64);
  if (!companyId) return { ok: false, erro: "Empresa não informada." };
  const socioId = texto(form, "socioId", 64) ?? "novo";

  const nome = texto(form, "socioNome", 180);
  if (!nome) return { ok: false, erro: "Informe o nome do sócio que assina." };
  const cpf = lerDocumentoFiscal(texto(form, "socioCpf", 20));
  if (cpf?.tipo !== "CPF") return { ok: false, erro: "CPF do sócio inválido." };

  const daEmpresa = endereco(form, "empresa_");
  if (typeof daEmpresa === "string") return { ok: false, erro: `Endereço da empresa: ${daEmpresa}` };
  const doSocio = endereco(form, "socio_");
  if (typeof doSocio === "string") return { ok: false, erro: `Endereço do sócio: ${doSocio}` };

  const contatos = {} as Record<PapelDoContato, ContatoDoTermo>;
  for (const papel of PAPEIS_DE_CONTATO) {
    const p = papel.toLowerCase();
    const c: ContatoDoTermo = {
      nome: texto(form, `${p}_nome`, 180),
      telefone: texto(form, `${p}_telefone`, 30),
      email: texto(form, `${p}_email`, 120)?.toLowerCase() ?? null,
    };
    const rotulo = papel === "ADMINISTRATIVO" ? "administrativo" : "financeiro";
    if (c.email && !EMAIL.test(c.email)) return { ok: false, erro: `E-mail do contato ${rotulo} inválido.` };
    if (!c.nome && (c.telefone || c.email)) return { ok: false, erro: `Informe o nome do contato ${rotulo}, ou apague o telefone e o e-mail.` };
    contatos[papel] = c;
  }

  return {
    ok: true,
    entrada: {
      companyId,
      socioId,
      endereco: daEmpresa,
      socio: {
        nome,
        cpf: cpf.digitos,
        nacionalidade: texto(form, "socioNacionalidade", 60),
        estadoCivil: texto(form, "socioEstadoCivil", 40),
        profissao: texto(form, "socioProfissao", 120),
        endereco: doSocio,
      },
      contatos,
    },
  };
}
