// O arquivo da EFD ICMS/IPI, lido pelo Connect (29/10/2026).
//
// O motor guarda e entrega o arquivo (`GET /arquivos/{id}/download`, §6.4);
// a leitura — classificação, apuração e livro — é feita aqui, em fluxo, linha
// a linha (`arquivoIcms.ts`). Um ICMS da matriz passa de 200 MB: o corpo nunca
// vira uma string inteira, e a classificação corta o download no `D001`.
//
// O resultado fica em memória, por arquivo: um arquivo gerado não muda (a
// regeração cria outro id), então a mesma tela aberta de novo, ou a outra
// etapa sobre o mesmo arquivo, não baixa tudo de novo. Duas leituras iguais ao
// mesmo tempo esperam a mesma promessa.

import "server-only";
import { ErroDoMotor, type ArquivoDoMotor } from "@/lib/sped/motor";
import type { MotorDoEscritorio } from "@/lib/fiscal/motor/servidor";
import { doMotor, type Leitura } from "@/lib/fiscal/motor/leitura";
import { leitorDaApuracao, leitorDaClassificacao, type LeituraDaApuracao, type LeituraDaClassificacao } from "./arquivoIcms";

type Leitor<R> = { lerLinha: (linha: string) => boolean; resultado: () => R };

const LEITORES = { classificacao: leitorDaClassificacao, apuracao: leitorDaApuracao } as const;
type TipoDeLeitura = keyof typeof LEITORES;
type ResultadoDe<T extends TipoDeLeitura> = T extends "classificacao" ? LeituraDaClassificacao : LeituraDaApuracao;

const LIMITE_DO_CACHE = 24;
const VALIDADE_MS = 30 * 60_000;
const cache = new Map<string, { em: number; valor: Promise<unknown> }>();

/** Passa o corpo do download pelo leitor, decodificando ISO-8859-1. Para quando o leitor pede. */
export async function lerEmFluxo<R>(corpo: ReadableStream<Uint8Array>, leitor: Leitor<R>): Promise<R> {
  const leitorDoCorpo = corpo.getReader();
  const decodificador = new TextDecoder("latin1");
  let resto = "";
  let continuar = true;
  try {
    while (continuar) {
      const { done, value } = await leitorDoCorpo.read();
      resto += done ? decodificador.decode() : decodificador.decode(value, { stream: true });
      let fim = resto.indexOf("\n");
      while (fim >= 0 && continuar) {
        continuar = leitor.lerLinha(resto.slice(0, fim).replace(/\r$/, ""));
        resto = resto.slice(fim + 1);
        fim = resto.indexOf("\n");
      }
      if (done) {
        if (continuar && resto) leitor.lerLinha(resto.replace(/\r$/, ""));
        break;
      }
    }
  } finally {
    if (!continuar) await leitorDoCorpo.cancel().catch(() => undefined);
    leitorDoCorpo.releaseLock();
  }
  return leitor.resultado();
}

async function baixarELer<T extends TipoDeLeitura>(motor: MotorDoEscritorio, raiz: string, arquivo: ArquivoDoMotor, tipo: T): Promise<ResultadoDe<T>> {
  const resposta = await motor.cliente.baixarArquivo(raiz, arquivo.id);
  if (!resposta.body) throw new ErroDoMotor(resposta.status, "resposta_invalida", "O motor SPED devolveu o arquivo vazio.");
  return lerEmFluxo(resposta.body, LEITORES[tipo]() as Leitor<ResultadoDe<T>>);
}

/**
 * A leitura de um arquivo de ICMS/IPI, do cache ou do motor. Só aceita arquivo
 * de ICMS/IPI: o de Contribuições tem outro leiaute.
 */
export function lerArquivoIcms<T extends TipoDeLeitura>(tenantId: string, motor: MotorDoEscritorio, raiz: string, arquivo: ArquivoDoMotor, tipo: T): Promise<Leitura<ResultadoDe<T>>> {
  return doMotor(async () => {
    if (arquivo.obrigacao !== "icms_ipi") throw new ErroDoMotor(0, "parametro_invalido", "Este arquivo não é da EFD ICMS/IPI.");
    const chave = `${tenantId}:${raiz}:${arquivo.id}:${arquivo.gerado_em}:${tipo}`;
    const agora = Date.now();
    const guardado = cache.get(chave);
    if (guardado && agora - guardado.em < VALIDADE_MS) return guardado.valor as Promise<ResultadoDe<T>>;
    const valor = baixarELer(motor, raiz, arquivo, tipo);
    cache.set(chave, { em: agora, valor });
    // Falha não fica guardada: a próxima tentativa baixa de novo.
    valor.catch(() => { if (cache.get(chave)?.valor === valor) cache.delete(chave); });
    while (cache.size > LIMITE_DO_CACHE) cache.delete(cache.keys().next().value!);
    return valor;
  });
}
