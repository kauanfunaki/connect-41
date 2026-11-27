// Modelos de documento do Societário (27/11/2026, funcionalidade-891) — a parte
// do banco: os modelos .docx do escritório, os advogados e testemunhas, quem
// assina em cada processo e a geração do documento.
//
// O documento sai do cadastro de agora (empresa, sócios, processo) e vai para
// os Arquivos da empresa, na pasta Societário — como o termo aditivo
// (src/lib/honorarios/termo/servidor.ts). Não vai para os documentos do
// processo, que o cliente vê no portal: é rascunho para a equipe revisar.

import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import {
  LUGARES,
  PAPEL_DO_LUGAR,
  ROTULO_DO_LUGAR,
  camposEmBranco,
  dadosDoDocumento,
  ehTipoDeModelo,
  nomeDoArquivoGerado,
  type EntradaDoDocumento,
  type Lugar,
  type PapelDoParticipante,
  type PessoaQueAssina,
  type TipoDeModelo,
} from "./campos";
import { ModeloInvalido, TIPO_DOCX, camposDoModelo, conferirModelo, preencherModelo } from "./docx";

/** Erro de regra: a mensagem vai para a tela como está. */
export class ErroDosModelos extends Error {}

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

// ─── Modelos ────────────────────────────────────────────────────────────────

export type ModeloNaLista = {
  id: string;
  tipo: TipoDeModelo;
  nome: string;
  nomeArquivo: string;
  ativo: boolean;
  enviadoPor: string;
  atualizadoEm: Date;
  gerados: number;
};

export async function listarModelos(tenantId: string): Promise<ModeloNaLista[]> {
  const modelos = await getPrisma().societarioModeloDocumento.findMany({
    where: { tenantId },
    select: { id: true, tipo: true, nome: true, nomeArquivo: true, ativo: true, enviadoPor: true, updatedAt: true, _count: { select: { gerados: true } } },
    orderBy: [{ ativo: "desc" }, { tipo: "asc" }, { nome: "asc" }],
  });
  return modelos.map((m) => ({
    id: m.id,
    tipo: ehTipoDeModelo(m.tipo) ? m.tipo : "OUTRO",
    nome: m.nome,
    nomeArquivo: m.nomeArquivo,
    ativo: m.ativo,
    enviadoPor: m.enviadoPor,
    atualizadoEm: m.updatedAt,
    gerados: m._count.gerados,
  }));
}

export type EntradaDoModelo = {
  /** Nulo cria; com id, troca o nome, o tipo e (se vier) o arquivo. */
  id: string | null;
  tipo: TipoDeModelo;
  nome: string;
  arquivo: { nome: string; bytes: Buffer } | null;
  enviadoPor: string;
};

/** Confere e guarda o modelo. Devolve o id e os avisos da conferência. */
export async function salvarModelo(tenantId: string, e: EntradaDoModelo): Promise<{ id: string; avisos: string[] }> {
  const prisma = getPrisma();
  let avisos: string[] = [];
  let arquivo: { nomeArquivo: string; conteudo: Uint8Array<ArrayBuffer> } | null = null;
  if (e.arquivo) {
    const conferido = conferirModelo(e.arquivo.bytes);
    if (!conferido.ok) throw new ErroDosModelos(conferido.erro);
    avisos = conferido.avisos;
    arquivo = { nomeArquivo: e.arquivo.nome.slice(0, 255), conteudo: new Uint8Array(e.arquivo.bytes) };
  }
  if (e.id === null) {
    if (!arquivo) throw new ErroDosModelos("Escolha o arquivo .docx do modelo.");
    const criado = await prisma.societarioModeloDocumento.create({
      data: { tenantId, tipo: e.tipo, nome: e.nome, enviadoPor: e.enviadoPor, ...arquivo },
      select: { id: true },
    });
    return { id: criado.id, avisos };
  }
  const r = await prisma.societarioModeloDocumento.updateMany({
    where: { id: e.id, tenantId },
    data: { tipo: e.tipo, nome: e.nome, ...(arquivo ? { ...arquivo, enviadoPor: e.enviadoPor } : {}) },
  });
  if (r.count === 0) throw new ErroDosModelos("O modelo não existe mais. Recarregue a tela.");
  return { id: e.id, avisos };
}

export async function ativarModelo(tenantId: string, id: string, ativo: boolean): Promise<string> {
  const prisma = getPrisma();
  const m = await prisma.societarioModeloDocumento.findFirst({ where: { id, tenantId }, select: { nome: true } });
  if (!m) throw new ErroDosModelos("O modelo não existe mais. Recarregue a tela.");
  await prisma.societarioModeloDocumento.update({ where: { id }, data: { ativo } });
  return m.nome;
}

/** Exclui o modelo. Os documentos já gerados ficam, sem o vínculo (SetNull). */
export async function excluirModelo(tenantId: string, id: string): Promise<string> {
  const prisma = getPrisma();
  const m = await prisma.societarioModeloDocumento.findFirst({ where: { id, tenantId }, select: { nome: true } });
  if (!m) throw new ErroDosModelos("O modelo não existe mais. Recarregue a tela.");
  await prisma.societarioModeloDocumento.delete({ where: { id } });
  return m.nome;
}

/** O .docx guardado, para baixar e conferir. */
export async function arquivoDoModelo(tenantId: string, id: string): Promise<{ nomeArquivo: string; conteudo: Buffer } | null> {
  const m = await getPrisma().societarioModeloDocumento.findFirst({ where: { id, tenantId }, select: { nomeArquivo: true, conteudo: true } });
  return m && { nomeArquivo: m.nomeArquivo, conteudo: Buffer.from(m.conteudo) };
}

// ─── Advogados e testemunhas ────────────────────────────────────────────────

export type ParticipanteNaLista = {
  id: string;
  papel: PapelDoParticipante;
  nome: string;
  cpf: string | null;
  rg: string | null;
  oab: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: string | null;
  ativo: boolean;
};

const CAMPOS_DO_PARTICIPANTE = {
  id: true,
  papel: true,
  nome: true,
  cpf: true,
  rg: true,
  oab: true,
  nacionalidade: true,
  estadoCivil: true,
  profissao: true,
  endereco: true,
  ativo: true,
} as const;

export async function listarParticipantes(tenantId: string): Promise<ParticipanteNaLista[]> {
  const lista = await getPrisma().societarioParticipante.findMany({
    where: { tenantId },
    select: CAMPOS_DO_PARTICIPANTE,
    orderBy: [{ ativo: "desc" }, { papel: "asc" }, { nome: "asc" }],
  });
  return lista.map((p) => ({ ...p, papel: p.papel === "ADVOGADO" ? "ADVOGADO" : "TESTEMUNHA" }));
}

export type EntradaDoParticipante = Omit<ParticipanteNaLista, "id" | "ativo"> & { id: string | null };

export async function salvarParticipante(tenantId: string, e: EntradaDoParticipante): Promise<string> {
  const prisma = getPrisma();
  const dados = {
    papel: e.papel,
    nome: e.nome,
    cpf: e.cpf,
    rg: e.rg,
    oab: e.papel === "ADVOGADO" ? e.oab : null,
    nacionalidade: e.nacionalidade,
    estadoCivil: e.estadoCivil,
    profissao: e.profissao,
    endereco: e.endereco,
  };
  if (e.id === null) {
    const criado = await prisma.societarioParticipante.create({ data: { tenantId, ...dados }, select: { id: true } });
    return criado.id;
  }
  const atual = await prisma.societarioParticipante.findFirst({ where: { id: e.id, tenantId }, select: { papel: true } });
  if (!atual) throw new ErroDosModelos("O cadastro não existe mais. Recarregue a tela.");
  // Trocar o papel desfaz o vínculo onde ele estava no lugar do outro papel:
  // uma testemunha que vira advogado não pode continuar como testemunha 1.
  return prisma.$transaction(async (tx) => {
    if (atual.papel !== e.papel) {
      const lugaresDoOutroPapel = LUGARES.filter((l) => PAPEL_DO_LUGAR[l] !== e.papel);
      await tx.processoParticipante.deleteMany({ where: { participanteId: e.id!, lugar: { in: [...lugaresDoOutroPapel] } } });
    }
    await tx.societarioParticipante.update({ where: { id: e.id! }, data: dados });
    return e.id!;
  });
}

export async function ativarParticipante(tenantId: string, id: string, ativo: boolean): Promise<string> {
  const prisma = getPrisma();
  const p = await prisma.societarioParticipante.findFirst({ where: { id, tenantId }, select: { nome: true } });
  if (!p) throw new ErroDosModelos("O cadastro não existe mais. Recarregue a tela.");
  await prisma.societarioParticipante.update({ where: { id }, data: { ativo } });
  return p.nome;
}

/** Exclui; sai também dos processos em que estava. */
export async function excluirParticipante(tenantId: string, id: string): Promise<string> {
  const prisma = getPrisma();
  const p = await prisma.societarioParticipante.findFirst({ where: { id, tenantId }, select: { nome: true } });
  if (!p) throw new ErroDosModelos("O cadastro não existe mais. Recarregue a tela.");
  await prisma.societarioParticipante.delete({ where: { id } });
  return p.nome;
}

// ─── No processo ────────────────────────────────────────────────────────────

export type ParaGerar = {
  modelos: { id: string; tipo: TipoDeModelo; nome: string }[];
  participantes: { id: string; papel: PapelDoParticipante; nome: string }[];
  /** O participante escolhido em cada lugar. */
  escolhidos: Record<Lugar, string | null>;
  historico: { id: string; nomeArquivo: string; modelo: string | null; geradoPor: string; geradoEm: Date; driveFileId: string | null }[];
};

/** O que o cartão "Gerar documento" do processo mostra. */
export async function paraGerarNoProcesso(tenantId: string, processId: string): Promise<ParaGerar> {
  const prisma = getPrisma();
  const [modelos, participantes, vinculos, historico] = await Promise.all([
    prisma.societarioModeloDocumento.findMany({ where: { tenantId, ativo: true }, select: { id: true, tipo: true, nome: true }, orderBy: [{ tipo: "asc" }, { nome: "asc" }] }),
    prisma.societarioParticipante.findMany({ where: { tenantId, ativo: true }, select: { id: true, papel: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.processoParticipante.findMany({ where: { tenantId, processId }, select: { lugar: true, participanteId: true } }),
    prisma.societarioDocumentoGerado.findMany({
      where: { tenantId, processId },
      select: { id: true, nomeArquivo: true, geradoPor: true, geradoEm: true, driveFileId: true, modelo: { select: { nome: true } } },
      orderBy: { geradoEm: "desc" },
      take: 20,
    }),
  ]);
  const escolhidos = Object.fromEntries(LUGARES.map((l) => [l, vinculos.find((v) => v.lugar === l)?.participanteId ?? null])) as Record<Lugar, string | null>;
  return {
    modelos: modelos.map((m) => ({ id: m.id, tipo: ehTipoDeModelo(m.tipo) ? m.tipo : "OUTRO", nome: m.nome })),
    participantes: participantes.map((p) => ({ id: p.id, papel: p.papel === "ADVOGADO" ? "ADVOGADO" : "TESTEMUNHA", nome: p.nome })),
    escolhidos,
    historico: historico.map((h) => ({ id: h.id, nomeArquivo: h.nomeArquivo, modelo: h.modelo?.nome ?? null, geradoPor: h.geradoPor, geradoEm: h.geradoEm, driveFileId: h.driveFileId })),
  };
}

/**
 * Grava quem assina no processo. Cada lugar aceita só o papel dele (advogado no
 * de advogado, testemunha nos de testemunha) e a mesma pessoa não ocupa dois.
 */
export async function definirParticipantesDoProcesso(tenantId: string, processId: string, escolhidos: Record<Lugar, string | null>): Promise<void> {
  const prisma = getPrisma();
  const processo = await prisma.process.findFirst({ where: { id: processId, tenantId }, select: { id: true } });
  if (!processo) throw new ErroDosModelos("Processo não encontrado.");
  const ids = LUGARES.map((l) => escolhidos[l]).filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) throw new ErroDosModelos("A mesma pessoa não pode assinar em dois lugares.");
  const pessoas = ids.length > 0 ? await prisma.societarioParticipante.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, papel: true } }) : [];
  for (const l of LUGARES) {
    const id = escolhidos[l];
    if (!id) continue;
    const p = pessoas.find((x) => x.id === id);
    if (!p) throw new ErroDosModelos("Uma das pessoas escolhidas não está mais cadastrada. Recarregue a tela.");
    if (p.papel !== PAPEL_DO_LUGAR[l]) throw new ErroDosModelos(`${ROTULO_DO_LUGAR[l]}: escolha alguém cadastrado como ${PAPEL_DO_LUGAR[l] === "ADVOGADO" ? "advogado" : "testemunha"}.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.processoParticipante.deleteMany({ where: { tenantId, processId } });
    const linhas = LUGARES.filter((l) => escolhidos[l]).map((l) => ({ tenantId, processId, lugar: l, participanteId: escolhidos[l]! }));
    if (linhas.length > 0) await tx.processoParticipante.createMany({ data: linhas });
  });
}

const enderecoDe = (e: {
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
}) => ({
  logradouro: e.addressStreet,
  numero: e.addressNumber,
  complemento: e.addressComplement,
  bairro: e.neighborhood,
  cidade: e.city,
  uf: e.stateCode,
  cep: e.zipCode,
});

const CAMPOS_DE_ENDERECO = {
  zipCode: true,
  addressStreet: true,
  addressNumber: true,
  addressComplement: true,
  neighborhood: true,
  city: true,
  stateCode: true,
} as const;

const CAMPOS_DA_PESSOA = { nome: true, cpf: true, rg: true, oab: true, nacionalidade: true, estadoCivil: true, profissao: true, endereco: true } as const;

/** Lê do banco tudo o que o documento pode pedir, para o processo. */
export async function entradaDoProcesso(tenantId: string, processId: string): Promise<EntradaDoDocumento | null> {
  const prisma = getPrisma();
  const processo = await prisma.process.findFirst({
    where: { id: processId, tenantId },
    select: {
      number: true,
      title: true,
      type: { select: { name: true } },
      company: {
        select: {
          name: true,
          tradeName: true,
          cnpj: true,
          nire: true,
          naturezaJuridica: true,
          cnaePrincipal: true,
          cnaeSecundarios: true,
          stateRegistration: true,
          municipalRegistration: true,
          foundationDate: true,
          ...CAMPOS_DE_ENDERECO,
          partners: {
            select: {
              name: true,
              document: true,
              qualification: true,
              administrator: true,
              nationality: true,
              maritalStatus: true,
              occupation: true,
              quotas: true,
              capitalAmount: true,
              sharePercent: true,
              exitDate: true,
              ...CAMPOS_DE_ENDERECO,
            },
            orderBy: [{ administrator: "desc" }, { name: "asc" }],
          },
        },
      },
      participantes: {
        select: {
          lugar: true,
          participante: { select: CAMPOS_DA_PESSOA },
        },
      },
    },
  });
  if (!processo) return null;
  const c = processo.company;
  const quem = (l: Lugar): PessoaQueAssina | null => processo.participantes.find((p) => p.lugar === l)?.participante ?? null;
  return {
    empresa: {
      razaoSocial: c.name,
      nomeFantasia: c.tradeName,
      cnpj: c.cnpj,
      nire: c.nire,
      naturezaJuridica: c.naturezaJuridica,
      cnaePrincipal: c.cnaePrincipal,
      cnaesSecundarios: c.cnaeSecundarios,
      inscricaoEstadual: c.stateRegistration,
      inscricaoMunicipal: c.municipalRegistration,
      dataDeAbertura: c.foundationDate,
      endereco: enderecoDe(c),
    },
    socios: c.partners.map((p) => ({
      nome: p.name,
      documento: p.document,
      qualificacao: p.qualification,
      administrador: p.administrator,
      nacionalidade: p.nationality,
      estadoCivil: p.maritalStatus,
      profissao: p.occupation,
      endereco: enderecoDe(p),
      quotas: p.quotas,
      capital: num(p.capitalAmount),
      percentual: num(p.sharePercent),
      saiu: p.exitDate !== null,
    })),
    processo: { numero: processo.number, tipo: processo.type.name, titulo: processo.title },
    advogado: quem("ADVOGADO"),
    testemunha1: quem("TESTEMUNHA_1"),
    testemunha2: quem("TESTEMUNHA_2"),
  };
}

/**
 * O que vai sair em branco com o modelo escolhido, antes de gerar. `escolhidos`
 * é quem a tela marcou e ainda não gravou: o aviso já considera essas pessoas.
 */
export async function camposEmBrancoNoProcesso(
  tenantId: string,
  processId: string,
  modeloId: string,
  escolhidos: Record<Lugar, string | null> | null = null,
  agora = new Date()
): Promise<string[]> {
  const prisma = getPrisma();
  const [entrada, modelo] = await Promise.all([
    entradaDoProcesso(tenantId, processId),
    prisma.societarioModeloDocumento.findFirst({ where: { id: modeloId, tenantId }, select: { conteudo: true } }),
  ]);
  if (!entrada || !modelo) return [];
  if (escolhidos) {
    const ids = LUGARES.map((l) => escolhidos[l]).filter((x): x is string => !!x);
    const pessoas = ids.length > 0 ? await prisma.societarioParticipante.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, ...CAMPOS_DA_PESSOA } }) : [];
    const de = (l: Lugar): PessoaQueAssina | null => {
      const p = pessoas.find((x) => x.id === escolhidos[l]);
      return p ? { nome: p.nome, cpf: p.cpf, rg: p.rg, oab: p.oab, nacionalidade: p.nacionalidade, estadoCivil: p.estadoCivil, profissao: p.profissao, endereco: p.endereco } : null;
    };
    entrada.advogado = de("ADVOGADO");
    entrada.testemunha1 = de("TESTEMUNHA_1");
    entrada.testemunha2 = de("TESTEMUNHA_2");
  }
  return camposEmBranco(camposDoModelo(modelo.conteudo), dadosDoDocumento(entrada, agora));
}

export type DocumentoGerado = { nomeArquivo: string; conteudoBase64: string; guardadoNosArquivos: boolean; emBranco: string[]; empresa: string };

/**
 * Preenche o modelo com o cadastro de agora, guarda nos Arquivos da empresa
 * (pasta Societário do modelo de pastas) e registra quem gerou. O arquivo volta
 * para a tela baixar na hora.
 */
export async function gerarDocumento(
  tenantId: string,
  processId: string,
  modeloId: string,
  quem: { userId: string | null; nome: string },
  agora: Date = new Date()
): Promise<DocumentoGerado> {
  const prisma = getPrisma();
  const [entrada, modelo, processo] = await Promise.all([
    entradaDoProcesso(tenantId, processId),
    prisma.societarioModeloDocumento.findFirst({ where: { id: modeloId, tenantId }, select: { id: true, nome: true, conteudo: true, ativo: true } }),
    prisma.process.findFirst({ where: { id: processId, tenantId }, select: { companyId: true, number: true } }),
  ]);
  if (!entrada || !processo) throw new ErroDosModelos("Processo não encontrado.");
  if (!modelo) throw new ErroDosModelos("O modelo não existe mais. Recarregue a tela.");
  if (!modelo.ativo) throw new ErroDosModelos("Este modelo foi desativado. Escolha outro ou peça à coordenação para reativar.");

  const dados = dadosDoDocumento(entrada, agora);
  let buffer: Buffer;
  try {
    buffer = preencherModelo(modelo.conteudo, dados);
  } catch (err) {
    if (err instanceof ModeloInvalido) throw new ErroDosModelos(`O modelo tem um problema: ${err.message}`);
    throw err;
  }
  const nomeArquivo = nomeDoArquivoGerado(modelo.nome, entrada.empresa.razaoSocial, processo.number);

  let driveFileId: string | null = null;
  if (await isModuleEnabled(tenantId, MODULO_ARQUIVOS)) {
    const pasta = await pastaDoModeloDaEmpresa(tenantId, processo.companyId, "societario");
    if (pasta) {
      const r = await guardarArquivo({
        tenantId,
        folderId: pasta,
        arquivo: new File([new Uint8Array(buffer)], nomeArquivo, { type: TIPO_DOCX }),
        uploadedByUserId: quem.userId,
      });
      if (r.ok) driveFileId = r.arquivoId;
      else console.error("[modelos do societário] não guardou nos Arquivos:", r.erro);
    }
  }
  await prisma.societarioDocumentoGerado.create({
    data: { tenantId, processId, modeloId: modelo.id, nomeArquivo, driveFileId, geradoPor: quem.nome.slice(0, 150) },
  });
  return {
    nomeArquivo,
    conteudoBase64: buffer.toString("base64"),
    guardadoNosArquivos: driveFileId !== null,
    emBranco: camposEmBranco(camposDoModelo(modelo.conteudo), dados),
    empresa: entrada.empresa.razaoSocial,
  };
}
