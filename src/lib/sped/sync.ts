// Sincronização do acervo com o índice do SPED.
//
// O índice é **projeção derivada, nunca fonte de verdade**: divergência de
// contagem se conserta do lado de lá, com reindexação, e não com correção manual
// aqui. O que este arquivo faz é espelhar.
//
// Nada aqui varre competência inteira sob clique de usuário — isso é regra do
// contrato, e é o que separa este consumo do que derruba a conexão do SPED (a
// geração, que lê ~1 GB de blob de uma vez).

import { getPrisma } from "@/lib/prisma";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { credenciaisDoAmbiente, listarDocumentos, ErroDoSped, type CredenciaisSped } from "./client";
import { mapearDocumento, empresaDaLinha } from "./mapeamento";

export type ResultadoDaRaiz = {
  cnpjRaiz: string;
  paginas: number;
  vistos: number;
  gravados: number;
  removidos: number;
  semAtribuicao: number;
  ambiguos: number;
  ignorados: number;
  erro?: string;
};

/** Teto de páginas por execução, para o cron não ficar preso na carga inicial. */
const MAX_PAGINAS_POR_EXECUCAO = 30;
const POR_PAGINA = 500;

/**
 * Sincroniza uma raiz de CNPJ, de onde parou.
 *
 * O laço é o do contrato: sem cursor guardado, primeira varredura com
 * `alterado_desde` na origem dos tempos; com cursor, só ele. `proximo_cursor`
 * continua paginando agora; `cursor_retomada` é onde recomeçar na próxima vez.
 *
 * O `cursor_retomada` é gravado **a cada página**, não no fim: a carga inicial
 * são 457 páginas, e uma execução interrompida no meio precisa retomar de onde
 * parou em vez de recomeçar.
 */
export async function sincronizarRaiz(
  tenantId: string,
  cnpjRaiz: string,
  creds: CredenciaisSped
): Promise<ResultadoDaRaiz> {
  const prisma = getPrisma();
  const resultado: ResultadoDaRaiz = {
    cnpjRaiz,
    paginas: 0,
    vistos: 0,
    gravados: 0,
    removidos: 0,
    semAtribuicao: 0,
    ambiguos: 0,
    ignorados: 0,
  };

  const estado = await prisma.spedSyncState.upsert({
    where: { tenantId_cnpjRaiz: { tenantId, cnpjRaiz } },
    create: { tenantId, cnpjRaiz },
    update: {},
  });

  // Índice de empresa por documento, uma vez por raiz. O casamento é sempre
  // pelo cadastro do Connect, nunca pelo `sentido` que o índice sugere.
  const empresas = await prisma.company.findMany({
    where: { tenantId },
    select: { id: true, kind: true, cnpj: true, cpf: true },
  });
  const empresaPorDocumento = new Map<string, string>();
  for (const e of empresas) {
    const doc = documentoDaEmpresa(e);
    if (doc) empresaPorDocumento.set(doc.digitos, e.id);
  }

  let cursor = estado.cursorRetomada;
  let watermark = estado.watermark;

  try {
    for (let pagina = 0; pagina < MAX_PAGINAS_POR_EXECUCAO; pagina++) {
      const resposta = await listarDocumentos(creds, cnpjRaiz, { cursor, limite: POR_PAGINA });
      resultado.paginas += 1;
      resultado.vistos += resposta.documentos.length;
      if (resposta.watermark) watermark = resposta.watermark;

      for (const bruto of resposta.documentos) {
        const mapeado = mapearDocumento(bruto);
        if ("motivo" in mapeado) {
          resultado.ignorados += 1;
          continue;
        }

        // ── Lápide ──────────────────────────────────────────────────────────
        //
        // O documento saiu da origem e viaja assim uma última vez. A projeção
        // apaga — mas só o que É projeção: documento que alguém subiu à mão não
        // é do SPED para remover, e apagá-lo destruiria trabalho de gente.
        //
        // Quando existir lançamento (etapa 7), ele é SINALIZADO e nunca
        // removido em silêncio: alguém pode já tê-lo conferido ou aprovado.
        if (bruto.removido) {
          const marcados = await prisma.fiscalDocument.updateMany({
            where: { tenantId, dedupKey: mapeado.dedupKey, origin: "SPED", removedAtOrigin: false },
            data: { removedAtOrigin: true, removedAtOriginAt: new Date() },
          });
          resultado.removidos += marcados.count;
          continue;
        }

        const dona = empresaDaLinha(mapeado, empresaPorDocumento);
        if (dona === null) {
          // O índice chama isto de `sem_atribuicao`. Caso esperado: documento de
          // contribuinte que não é cliente cadastrado aqui.
          resultado.semAtribuicao += 1;
          continue;
        }
        if ("ambigua" in dona) {
          resultado.ambiguos += 1;
          continue;
        }

        const dados = {
          companyId: dona.companyId,
          type: mapeado.tipo,
          accessKey: mapeado.chaveAcesso,
          number: mapeado.numero,
          series: mapeado.serie,
          issuerName: mapeado.emitenteNome,
          issuerDocument: mapeado.emitenteDocumento,
          recipientName: mapeado.destinatarioNome,
          recipientDocument: mapeado.destinatarioDocumento,
          amount: mapeado.valor,
          issuedAt: mapeado.emitidoEm,
          competence: mapeado.competencia,
          completude: mapeado.completude,
          renderizavel: mapeado.renderizavel,
          spedTipo: mapeado.spedTipo,
          spedIdentificador: mapeado.spedIdentificador,
          // Reimportação ressuscita: o contrato diz que o documento volta com
          // `removido: false`, e a lápide não é recarimbada. Zerar a bandeira
          // aqui é o que faz a volta ser um update, e não um documento novo.
          removedAtOrigin: false,
          removedAtOriginAt: null,
        };

        // Upsert pela mesma chave que o upload usa. Documento que já entrou à
        // mão é RECONHECIDO, não duplicado — e ganha o identificador do SPED,
        // que é o que destrava buscar o PDF dele.
        //
        // `destination` fica de fora do update de propósito: é o eixo que é
        // trabalho nosso, e a sincronização não desfaz decisão de gente.
        await prisma.fiscalDocument.upsert({
          where: { tenantId_dedupKey: { tenantId, dedupKey: mapeado.dedupKey } },
          create: { tenantId, dedupKey: mapeado.dedupKey, origin: "SPED", ...dados },
          update: dados,
        });
        resultado.gravados += 1;
      }

      if (resposta.cursor_retomada) {
        cursor = resposta.cursor_retomada;
        await prisma.spedSyncState.update({
          where: { id: estado.id },
          data: { cursorRetomada: resposta.cursor_retomada, watermark, lastRunAt: new Date(), lastError: null },
        });
      }

      if (!resposta.proximo_cursor) break;
      cursor = resposta.proximo_cursor;
    }
  } catch (err) {
    const mensagem =
      err instanceof ErroDoSped ? err.message : err instanceof Error ? err.message : "falha desconhecida";
    resultado.erro = mensagem;
    await prisma.spedSyncState.update({
      where: { id: estado.id },
      data: { lastRunAt: new Date(), lastError: mensagem.slice(0, 500) },
    });
  }

  return resultado;
}

export type ResultadoDaSincronizacao = {
  raizes: ResultadoDaRaiz[];
  semCredencial: boolean;
};

/**
 * Sincroniza todas as raízes de CNPJ que o tenant tem cadastradas.
 *
 * As raízes saem de `ClientGroup.cnpjRoot` — que existe desde o agrupamento de
 * clientes de agosto e é exatamente o parâmetro que a API pede. Cliente sem raiz
 * (pessoa física, holding de raízes diferentes) simplesmente não tem o que
 * sincronizar, e isso não é erro.
 */
export async function sincronizarTenant(tenantId: string): Promise<ResultadoDaSincronizacao> {
  const creds = credenciaisDoAmbiente();
  if (!creds) return { raizes: [], semCredencial: true };

  const prisma = getPrisma();
  const grupos = await prisma.clientGroup.findMany({
    where: { tenantId, active: true, cnpjRoot: { not: null } },
    select: { cnpjRoot: true },
  });

  const raizes = [...new Set(grupos.map((g) => g.cnpjRoot!).filter((r) => r.length === 8))];

  const resultados: ResultadoDaRaiz[] = [];
  for (const raiz of raizes) {
    resultados.push(await sincronizarRaiz(tenantId, raiz, creds));
  }
  return { raizes: resultados, semCredencial: false };
}
