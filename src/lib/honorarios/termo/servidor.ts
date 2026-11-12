// O termo aditivo em Word (funcionalidade-643, 12/11/2026) — a parte do banco.
// As regras do texto estão em contratante.ts; o Word, em docx.ts.
//
// Os dados são do cadastro (decisão do Kauan): o endereço é o da empresa, o
// sócio é o de Sócios e os contatos ficam em `hon_contatos`. A tela do termo
// grava no próprio cadastro — corrigir aqui corrige a ficha da empresa.

import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import { AppError } from "@/lib/honorarios/servidor/erros";
import {
  dadosDoModelo,
  nomeDoArquivo,
  oQueFalta,
  PAPEIS_DE_CONTATO,
  podeGerar,
  type ContatoDoTermo,
  type DadosDoContratante,
  type EnderecoDoTermo,
  type EntradaDoContratante,
  type Falta,
  type PapelDoContato,
} from "./contratante";
import { conferirModelo, preencherModelo } from "./docx";

export type SocioNaTela = {
  id: string;
  nome: string;
  cpf: string | null;
  administrador: boolean;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: EnderecoDoTermo;
};

export type ContratanteNaTela = {
  companyId: string;
  nome: string;
  razaoSocial: string;
  cnpj: string | null;
  endereco: EnderecoDoTermo;
  /** Os sócios que estão na sociedade (sem data de saída), administradores primeiro. */
  socios: SocioNaTela[];
  /** Quem assina: o escolhido, ou o primeiro administrador. */
  socioId: string | null;
  contatos: Record<PapelDoContato, ContatoDoTermo | null>;
  dados: DadosDoContratante;
  faltas: Falta[];
  podeGerar: boolean;
};

const CAMPOS_DO_SOCIO = {
  id: true,
  name: true,
  document: true,
  administrator: true,
  nationality: true,
  maritalStatus: true,
  occupation: true,
  zipCode: true,
  addressStreet: true,
  addressNumber: true,
  addressComplement: true,
  neighborhood: true,
  city: true,
  stateCode: true,
} as const;

type EnderecoDoBanco = {
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
};

const enderecoDoBanco = (e: EnderecoDoBanco): EnderecoDoTermo => ({
  logradouro: e.addressStreet,
  numero: e.addressNumber,
  complemento: e.addressComplement,
  bairro: e.neighborhood,
  cidade: e.city,
  uf: e.stateCode,
  cep: e.zipCode,
});

export async function carregarContratante(tenantId: string, companyId: string, socioEscolhido?: string | null): Promise<ContratanteNaTela | null> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId },
    select: {
      id: true,
      name: true,
      displayName: true,
      cnpj: true,
      zipCode: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      neighborhood: true,
      city: true,
      stateCode: true,
      partners: { where: { exitDate: null }, select: CAMPOS_DO_SOCIO, orderBy: [{ administrator: "desc" }, { name: "asc" }] },
      honorarioContatos: { select: { papel: true, nome: true, telefone: true, email: true } },
    },
  });
  if (!empresa) return null;

  // Sócio pessoa física: o CNPJ de uma holding sócia não assina como "portador do CPF".
  const socios: SocioNaTela[] = empresa.partners
    .filter((p) => !p.document || p.document.length === 11)
    .map((p) => ({
      id: p.id,
      nome: p.name,
      cpf: p.document,
      administrador: p.administrator,
      nacionalidade: p.nationality,
      estadoCivil: p.maritalStatus,
      profissao: p.occupation,
      endereco: enderecoDoBanco(p),
    }));
  const socio = socios.find((s) => s.id === socioEscolhido) ?? socios.find((s) => s.administrador) ?? null;
  const contato = (papel: PapelDoContato): ContatoDoTermo | null => {
    const c = empresa.honorarioContatos.find((x) => x.papel === papel);
    return c ? { nome: c.nome, telefone: c.telefone, email: c.email } : null;
  };
  const contatos = { ADMINISTRATIVO: contato("ADMINISTRATIVO"), FINANCEIRO: contato("FINANCEIRO") };
  const dados: DadosDoContratante = {
    razaoSocial: empresa.name,
    cnpj: empresa.cnpj,
    endereco: enderecoDoBanco(empresa),
    socio: socio && { nome: socio.nome, cpf: socio.cpf, nacionalidade: socio.nacionalidade, estadoCivil: socio.estadoCivil, profissao: socio.profissao, endereco: socio.endereco },
    administrativo: contatos.ADMINISTRATIVO,
    financeiro: contatos.FINANCEIRO,
  };
  return {
    companyId: empresa.id,
    nome: nomeExibicao(empresa),
    razaoSocial: empresa.name,
    cnpj: empresa.cnpj,
    endereco: dados.endereco,
    socios,
    socioId: socio?.id ?? null,
    contatos,
    dados,
    faltas: oQueFalta(dados),
    podeGerar: podeGerar(dados),
  };
}

// ─── Gravar no cadastro ─────────────────────────────────────────────────────

const paraOBanco = (e: EnderecoDoTermo) => ({
  zipCode: e.cep?.replace(/\D/g, "") || null,
  addressStreet: e.logradouro,
  addressNumber: e.numero,
  addressComplement: e.complemento,
  neighborhood: e.bairro,
  city: e.cidade,
  stateCode: e.uf?.toUpperCase() || null,
});

/** Grava o que a tela do termo mostrou: endereço da empresa, o sócio que assina e os dois contatos. Devolve o id do sócio. */
export async function salvarContratante(tenantId: string, e: EntradaDoContratante): Promise<string> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: e.companyId, tenantId }, select: { id: true } });
  if (!empresa) throw new AppError(404, "Empresa não encontrada.");
  return prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: e.companyId }, data: paraOBanco(e.endereco) });

    const outro = await tx.companyPartner.findFirst({
      where: { tenantId, companyId: e.companyId, document: e.socio.cpf, ...(e.socioId === "novo" ? {} : { id: { not: e.socioId } }) },
      select: { id: true },
    });
    if (outro) throw new AppError(409, "Já existe outro sócio com este CPF nesta empresa. Escolha ele na lista de quem assina.");
    const dadosDoSocio = {
      name: e.socio.nome,
      document: e.socio.cpf,
      nationality: e.socio.nacionalidade,
      maritalStatus: e.socio.estadoCivil,
      occupation: e.socio.profissao,
      ...paraOBanco(e.socio.endereco),
    };
    let socioId: string;
    if (e.socioId === "novo") {
      const criado = await tx.companyPartner.create({
        data: { tenantId, companyId: e.companyId, administrator: true, origin: "MANUAL", ...dadosDoSocio },
        select: { id: true },
      });
      socioId = criado.id;
    } else {
      const r = await tx.companyPartner.updateMany({ where: { id: e.socioId, tenantId, companyId: e.companyId }, data: dadosDoSocio });
      if (r.count === 0) throw new AppError(404, "O sócio não é mais desta empresa. Recarregue a tela.");
      socioId = e.socioId;
    }

    for (const papel of PAPEIS_DE_CONTATO) {
      const c = e.contatos[papel];
      if (!c.nome?.trim()) {
        await tx.honorarioContato.deleteMany({ where: { companyId: e.companyId, papel } });
        continue;
      }
      const dados = { nome: c.nome.trim(), telefone: c.telefone?.trim() || null, email: c.email?.trim().toLowerCase() || null };
      await tx.honorarioContato.upsert({
        where: { companyId_papel: { companyId: e.companyId, papel } },
        create: { tenantId, companyId: e.companyId, papel, ...dados },
        update: dados,
      });
    }
    return socioId;
  });
}

// ─── O modelo ───────────────────────────────────────────────────────────────

export type ModeloNaTela = { nomeArquivo: string; cidade: string; enviadoPor: string; atualizadoEm: Date };

export async function modeloDoTermo(tenantId: string): Promise<ModeloNaTela | null> {
  const m = await getPrisma().honorarioModeloDoTermo.findUnique({
    where: { tenantId },
    select: { nomeArquivo: true, cidade: true, enviadoPor: true, updatedAt: true },
  });
  return m && { nomeArquivo: m.nomeArquivo, cidade: m.cidade, enviadoPor: m.enviadoPor, atualizadoEm: m.updatedAt };
}

/** Confere e guarda o modelo. Sem arquivo novo, troca só a cidade. Devolve os avisos da conferência. */
export async function salvarModelo(
  tenantId: string,
  entrada: { arquivo: { nome: string; bytes: Buffer } | null; cidade: string; enviadoPor: string }
): Promise<string[]> {
  const prisma = getPrisma();
  if (!entrada.arquivo) {
    const r = await prisma.honorarioModeloDoTermo.updateMany({ where: { tenantId }, data: { cidade: entrada.cidade, enviadoPor: entrada.enviadoPor } });
    if (r.count === 0) throw new AppError(400, "Escolha o arquivo .docx do modelo.");
    return [];
  }
  const conferido = conferirModelo(entrada.arquivo.bytes);
  if (!conferido.ok) throw new AppError(400, conferido.erro);
  const dados = { nomeArquivo: entrada.arquivo.nome.slice(0, 255), conteudo: new Uint8Array(entrada.arquivo.bytes), cidade: entrada.cidade, enviadoPor: entrada.enviadoPor };
  await prisma.honorarioModeloDoTermo.upsert({ where: { tenantId }, create: { tenantId, ...dados }, update: dados });
  return conferido.avisos;
}

// ─── Gerar ──────────────────────────────────────────────────────────────────

export type TermoGerado = { nomeArquivo: string; conteudoBase64: string; guardadoNosArquivos: boolean };

/**
 * Preenche o modelo com o cadastro de agora, guarda nos Arquivos da empresa
 * (pasta Societário do modelo de pastas) e registra quem gerou. O arquivo
 * volta para a tela baixar na hora.
 */
export async function gerarTermo(
  tenantId: string,
  companyId: string,
  socioId: string | null,
  quem: { userId: string | null; nome: string },
  agora: Date = new Date()
): Promise<TermoGerado> {
  const prisma = getPrisma();
  const [contratante, modelo] = await Promise.all([
    carregarContratante(tenantId, companyId, socioId),
    prisma.honorarioModeloDoTermo.findUnique({ where: { tenantId }, select: { conteudo: true, cidade: true } }),
  ]);
  if (!contratante) throw new AppError(404, "Empresa não encontrada.");
  if (!modelo) throw new AppError(400, "O escritório ainda não enviou o modelo do termo. Quem gerencia o módulo envia em “Modelo do termo”.");
  if (!contratante.podeGerar) {
    throw new AppError(400, `Falta para gerar: ${contratante.faltas.filter((f) => f.obrigatoria).map((f) => f.campo.toLowerCase()).join(", ")}.`);
  }
  const buffer = preencherModelo(modelo.conteudo, dadosDoModelo(contratante.dados, modelo.cidade, agora));
  const nomeArquivo = nomeDoArquivo(contratante.razaoSocial, contratante.cnpj);

  let driveFileId: string | null = null;
  if (await isModuleEnabled(tenantId, MODULO_ARQUIVOS)) {
    const pasta = await pastaDoModeloDaEmpresa(tenantId, companyId, "societario");
    if (pasta) {
      const r = await guardarArquivo({
        tenantId,
        folderId: pasta,
        arquivo: new File([new Uint8Array(buffer)], nomeArquivo, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        uploadedByUserId: quem.userId,
      });
      if (r.ok) driveFileId = r.arquivoId;
      else console.error("[termo aditivo] não guardou nos Arquivos:", r.erro);
    }
  }
  await prisma.honorarioTermoGerado.create({ data: { tenantId, companyId, nomeArquivo, driveFileId, geradoPor: quem.nome.slice(0, 150) } });
  return { nomeArquivo, conteudoBase64: buffer.toString("base64"), guardadoNosArquivos: driveFileId !== null };
}

export type TermoNoHistorico = { id: string; nomeArquivo: string; geradoPor: string; geradoEm: Date; driveFileId: string | null };

export async function historicoDoTermo(tenantId: string, companyId: string): Promise<TermoNoHistorico[]> {
  return getPrisma().honorarioTermoGerado.findMany({
    where: { tenantId, companyId },
    select: { id: true, nomeArquivo: true, geradoPor: true, geradoEm: true, driveFileId: true },
    orderBy: { geradoEm: "desc" },
    take: 20,
  });
}

// ─── A lista ────────────────────────────────────────────────────────────────

export type EmpresaParaTermo = {
  companyId: string;
  nome: string;
  cnpj: string | null;
  /** Nome do sócio administrador, quando há. */
  socio: string | null;
  podeGerar: boolean;
  /** Recomendações que faltam (o termo sai sem esses trechos). */
  recomendacoes: number;
  ultimoTermo: Date | null;
};

/** As empresas ativas, com o que falta para o termo de cada uma. */
export async function listarEmpresasParaTermo(tenantId: string): Promise<EmpresaParaTermo[]> {
  const prisma = getPrisma();
  const [empresas, ultimos] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId, status: "ACTIVE", cnpj: { not: null } },
      select: {
        id: true,
        name: true,
        displayName: true,
        cnpj: true,
        zipCode: true,
        addressStreet: true,
        addressNumber: true,
        addressComplement: true,
        neighborhood: true,
        city: true,
        stateCode: true,
        partners: { where: { exitDate: null }, select: CAMPOS_DO_SOCIO, orderBy: [{ administrator: "desc" }, { name: "asc" }] },
        honorarioContatos: { select: { papel: true, nome: true, telefone: true, email: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.honorarioTermoGerado.groupBy({ by: ["companyId"], where: { tenantId }, _max: { geradoEm: true } }),
  ]);
  const ultimoPorEmpresa = new Map(ultimos.map((u) => [u.companyId, u._max.geradoEm]));
  return empresas.map((e) => {
    const p = e.partners.find((x) => x.administrator && (!x.document || x.document.length === 11));
    const contato = (papel: PapelDoContato) => {
      const c = e.honorarioContatos.find((x) => x.papel === papel);
      return c ? { nome: c.nome, telefone: c.telefone, email: c.email } : null;
    };
    const dados: DadosDoContratante = {
      razaoSocial: e.name,
      cnpj: e.cnpj,
      endereco: enderecoDoBanco(e),
      socio: p ? { nome: p.name, cpf: p.document, nacionalidade: p.nationality, estadoCivil: p.maritalStatus, profissao: p.occupation, endereco: enderecoDoBanco(p) } : null,
      administrativo: contato("ADMINISTRATIVO"),
      financeiro: contato("FINANCEIRO"),
    };
    const faltas = oQueFalta(dados);
    return {
      companyId: e.id,
      nome: nomeExibicao(e),
      cnpj: e.cnpj,
      socio: p?.name ?? null,
      podeGerar: faltas.every((f) => !f.obrigatoria),
      recomendacoes: faltas.filter((f) => !f.obrigatoria).length,
      ultimoTermo: ultimoPorEmpresa.get(e.id) ?? null,
    };
  });
}
