// Notas emitidas no Omie → acervo fiscal (Fase 1b da integração).
//
// **Só leitura do lado do Omie**: a única chamada é `ListarNF`. Nada é criado,
// alterado ou marcado na conta — o Omie que o BPO usa fica como está.
//
// Por conta (uma por empresa), a varredura anda em páginas de 100 e guarda no
// `cursor` da conexão a próxima página, para conta grande atravessar várias
// execuções. Ao chegar na última página o cursor volta a vazio e a próxima
// execução recomeça — é a volta completa que traz cancelamento de nota antiga.
//
// Deduplicação com o SPED pela chave de acesso, a mesma `dedupKey` dos outros
// caminhos. Nota que já estava no acervo (SPED ou upload) **não é reescrita**:
// ganha o id do Omie e, se o Omie diz que foi cancelada, a situação. Quem manda
// nos dados dela continua sendo o XML. `destination` nunca é tocado.

import { getPrisma } from "@/lib/prisma";
import { executar, lerConfig } from "@/lib/integracoes/data";
import { chamarOmie } from "./cliente";
import { instanciaDaEmpresa, PREFIXO_DA_EMPRESA } from "./contas";
import { mapearNotaOmie, paginaDoListarNF, type NotaDoOmie } from "./notas";

const POR_PAGINA = 100;
/** Páginas por execução e por conta: 1.000 notas, ~10 chamadas em sequência. */
const MAX_PAGINAS = 10;

export type ResumoDaConta = { companyId: string; ok: true; counters: Record<string, number> } | { companyId: string; ok: false; erro: string };

// Duas varreduras da mesma conta ao mesmo tempo (cron e botão) repetiriam a
// mesma chamada, e o Omie bloqueia chamada idêntica repetida por 60 s.
const emAndamento = new Set<string>();

function cortar(t: string | null, n: number): string | null {
  return t ? t.slice(0, n) : t;
}

/** Grava uma página já traduzida. Devolve os contadores dela. */
async function gravarNotas(tenantId: string, companyId: string, emitente: string, notas: NotaDoOmie[]) {
  const prisma = getPrisma();
  const c = { novas: 0, atualizadas: 0, reconhecidas: 0 };
  if (notas.length === 0) return c;

  const existentes = await prisma.fiscalDocument.findMany({
    where: { tenantId, dedupKey: { in: notas.map((n) => n.dedupKey) } },
    select: { id: true, dedupKey: true, origin: true, situation: true, omieIdNF: true },
  });
  const porChave = new Map(existentes.map((e) => [e.dedupKey, e]));

  for (const n of notas) {
    const dados = {
      companyId,
      type: n.tipo,
      accessKey: n.chaveAcesso,
      number: n.numero.slice(0, 20),
      series: cortar(n.serie, 10),
      issuerName: emitente.slice(0, 180),
      issuerDocument: n.emitenteDocumento,
      recipientName: cortar(n.destinatarioNome, 180),
      recipientDocument: n.destinatarioDocumento && n.destinatarioDocumento.length <= 14 ? n.destinatarioDocumento : null,
      amount: n.valor,
      issuedAt: n.emitidoEm,
      competence: n.competencia,
      situation: n.situacao,
      omieIdNF: n.omieIdNF,
    };
    const atual = porChave.get(n.dedupKey);

    if (!atual) {
      try {
        // Sem XML guardado no SPED: `renderizavel` falso, para ninguém pedir PDF de lá.
        await prisma.fiscalDocument.create({ data: { tenantId, dedupKey: n.dedupKey, origin: "OMIE", renderizavel: false, ...dados } });
        c.novas++;
      } catch (err) {
        // Corrida com a sincronização do SPED gravando a mesma chave: quem chegou
        // primeiro fica, e a próxima volta reconhece.
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
      continue;
    }

    if (atual.origin === "OMIE") {
      await prisma.fiscalDocument.update({ where: { id: atual.id }, data: dados });
      c.atualizadas++;
      continue;
    }

    // Veio antes pelo SPED ou upload: só o que o Omie sabe e o acervo não.
    const cancelou = n.situacao === "CANCELADA" && atual.situation !== "CANCELADA";
    if (cancelou || (n.omieIdNF && atual.omieIdNF !== n.omieIdNF)) {
      await prisma.fiscalDocument.update({
        where: { id: atual.id },
        data: { omieIdNF: n.omieIdNF ?? atual.omieIdNF, ...(cancelou ? { situation: "CANCELADA" as const } : {}) },
      });
    }
    c.reconhecidas++;
  }
  return c;
}

/**
 * A empresa da conta e as filiais cadastradas dela (`parentCompanyId`), por
 * CNPJ. Matriz e filiais dividem a base do Omie; o Connect guarda cada uma como
 * empresa, então a conta cadastrada na matriz alimenta as filiais também.
 */
export async function empresasDoGrupo(
  tenantId: string,
  companyId: string,
  daConta: { name: string; cnpj: string }
): Promise<{ cnpjs: Set<string>; porCnpj: Map<string, { id: string; name: string }> }> {
  const filiais = await getPrisma().company.findMany({
    where: { tenantId, parentCompanyId: companyId, cnpj: { not: null } },
    select: { id: true, name: true, cnpj: true },
  });
  const porCnpj = new Map<string, { id: string; name: string }>([[daConta.cnpj, { id: companyId, name: daConta.name }]]);
  for (const f of filiais) {
    const doc = (f.cnpj ?? "").replace(/\D/g, "");
    if (doc.length === 14 && !porCnpj.has(doc)) porCnpj.set(doc, { id: f.id, name: f.name });
  }
  return { cnpjs: new Set(porCnpj.keys()), porCnpj };
}

/** Varre as notas emitidas de uma conta do Omie e grava no acervo (a empresa da conta e as filiais dela). */
export async function sincronizarNotasDaEmpresa(
  tenantId: string,
  companyId: string,
  trigger: "CRON" | "MANUAL"
): Promise<ResumoDaConta> {
  const chave = `${tenantId}:${companyId}`;
  if (emAndamento.has(chave)) return { companyId, ok: false, erro: "Já existe uma leitura desta conta em andamento." };

  const prisma = getPrisma();
  const conexao = await prisma.tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
  });
  if (!conexao) return { companyId, ok: false, erro: "Esta empresa não tem conta do Omie cadastrada." };
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { name: true, cnpj: true } });
  const cnpj = (empresa?.cnpj ?? "").replace(/\D/g, "");
  if (!empresa || cnpj.length !== 14) return { companyId, ok: false, erro: "A empresa não tem CNPJ no Connect para conferir as notas." };
  const grupo = await empresasDoGrupo(tenantId, companyId, { name: empresa.name, cnpj });
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) return { companyId, ok: false, erro: "Falta App Key ou App Secret." };
  const cred = { appKey: config.appKey, appSecret: config.appSecret };

  emAndamento.add(chave);
  try {
    const counters = await executar({ tenantId, integrationId: conexao.id, trigger }, async () => {
      const cont: Record<string, number> = { paginas: 0, lidas: 0, novas: 0, atualizadas: 0, reconhecidas: 0 };
      let pagina = Math.max(1, Number(conexao.cursor) || 1);
      let proxima: string | null = null;

      for (let volta = 0; volta < MAX_PAGINAS; volta++) {
        // Em sequência e parando no primeiro erro: dez erros seguidos bloqueiam
        // a chave no Omie por 30 minutos.
        const corpo = await chamarOmie(cred, "produtos/nfconsultar", "ListarNF", {
          pagina,
          registros_por_pagina: POR_PAGINA,
          apenas_importado_api: "N",
        });
        const { notas, totalDePaginas } = paginaDoListarNF(corpo);
        cont.paginas++;
        cont.lidas += notas.length;

        const traduzidas: NotaDoOmie[] = [];
        for (const item of notas) {
          const r = mapearNotaOmie(item, grupo.cnpjs);
          if ("fora" in r) cont[`fora_${r.fora}`] = (cont[`fora_${r.fora}`] ?? 0) + 1;
          else traduzidas.push(r);
        }
        // Cada nota vai para a empresa do CNPJ emitente: a da conta ou uma filial dela.
        for (const [doc, destino] of grupo.porCnpj) {
          const daEmpresa = traduzidas.filter((n) => n.emitenteDocumento === doc);
          if (daEmpresa.length === 0) continue;
          const g = await gravarNotas(tenantId, destino.id, destino.name, daEmpresa);
          cont.novas += g.novas;
          cont.atualizadas += g.atualizadas;
          cont.reconhecidas += g.reconhecidas;
          if (destino.id !== companyId) cont.de_filiais = (cont.de_filiais ?? 0) + daEmpresa.length;
        }

        if (pagina >= totalDePaginas || notas.length === 0) {
          proxima = null;
          break;
        }
        pagina++;
        proxima = String(pagina);
      }
      return { resultado: cont, counters: cont, cursor: proxima };
    });
    return { companyId, ok: true, counters };
  } catch (err) {
    return { companyId, ok: false, erro: err instanceof Error ? err.message : "Falha ao ler as notas." };
  } finally {
    emAndamento.delete(chave);
  }
}

/**
 * Todas as contas ligadas de todos os tenants, uma de cada vez. Conta com erro
 * não para as outras — cada uma tem a sua chave e o seu limite no Omie.
 */
export async function sincronizarTodasAsContasOmie(): Promise<ResumoDaConta[]> {
  const contas = await getPrisma().tenantIntegration.findMany({
    where: { integrationCode: "omie", enabled: true, instanceKey: { startsWith: PREFIXO_DA_EMPRESA } },
    select: { tenantId: true, instanceKey: true },
    // A que rodou há mais tempo primeiro (nulo vem antes no MySQL).
    orderBy: { lastRunAt: "asc" },
  });
  const resumos: ResumoDaConta[] = [];
  for (const c of contas) {
    resumos.push(await sincronizarNotasDaEmpresa(c.tenantId, c.instanceKey.slice(PREFIXO_DA_EMPRESA.length), "CRON"));
  }
  return resumos;
}
