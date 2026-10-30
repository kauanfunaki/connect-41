import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { colunasPresentes } from "@/lib/fiscal/previa/doMotor";
import { rotuloDaColuna, valorDaCelula } from "@/lib/contabil/exibicao";
import type { FalhaDaLeitura } from "@/lib/fiscal/motor/leitura";

/** Códigos 422 de §11.0.9 e §2.1 que são situação do dado, não falha: aviso neutro. */
const SITUACOES = new Set(["sem_arquivo", "uf_nao_suportada", "obrigacao_incompativel", "matriz_nao_cadastrada", "sem_estabelecimento"]);

/**
 * O estado de erro de uma leitura do motor (§11). Três casos:
 * - `503 motor_ocupado`: o semáforo das leituras pesadas está cheio. Aviso de
 *   atenção, com o `Retry-After` na frase e o botão "Tentar de novo" (nada se
 *   repete sozinho);
 * - 422 de situação (sem arquivo, UF fora de SC, matriz não cadastrada...):
 *   aviso neutro, porque não há o que tentar de novo;
 * - o resto (fora do ar, tempo esgotado, resposta fora do contrato): aviso de
 *   atenção, e "Tentar de novo" quando a leitura é pesada ou o erro é passageiro.
 */
export function ErroDaLeitura({ falha, hrefDeNovo }: { falha: FalhaDaLeitura; hrefDeNovo?: string }) {
  if (falha.codigo && SITUACOES.has(falha.codigo)) return <Aviso tom="neutro">{falha.erro}</Aviso>;
  const passageiro = falha.codigo === "motor_ocupado" || falha.codigo === "tempo_esgotado" || falha.codigo === "falha_de_rede" || falha.status >= 500;
  return <div role="alert"><Aviso tom="atencao">
    <span className="flex flex-wrap items-center justify-between gap-3">
      <span>{falha.erro}</span>
      {passageiro && hrefDeNovo && <Button href={hrefDeNovo} variant="secondary" size="sm" scroll={false}>Tentar de novo</Button>}
    </span>
  </Aviso></div>;
}

/** O que aparece enquanto uma leitura pesada (o arquivo inteiro do SPED) roda no motor. */
export function CarregandoLeituraPesada({ oQue }: { oQue: string }) {
  return <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-4 py-5 text-ui text-fg-secondary">
    <Loader2 className="size-4 animate-spin" aria-hidden />
    <span>Lendo {oQue} no motor SPED. O motor lê o arquivo gerado inteiro: pode levar até um minuto.</span>
  </div>;
}

export function CarregandoLeitura({ oQue }: { oQue: string }) {
  return <p role="status" className="text-ui text-fg-secondary">Carregando {oQue} do motor SPED…</p>;
}

/** "Voltar ao início" e "Próxima página" de uma lista com cursor na URL. */
export function PaginacaoDoMotor({ temCursor, proximo, hrefInicio, hrefProxima }: { temCursor: boolean; proximo: string | null; hrefInicio: string; hrefProxima: (cursor: string) => string }) {
  if (!temCursor && !proximo) return null;
  return <div className="flex flex-wrap gap-3">
    {temCursor && <Button variant="secondary" size="sm" href={hrefInicio} scroll={false}>Voltar ao início</Button>}
    {proximo && <Button variant="secondary" size="sm" href={hrefProxima(proximo)} scroll={false}>Próxima página</Button>}
  </div>;
}

const INTEIRO = new Intl.NumberFormat("pt-BR");
const DECIMAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Célula legível (auditoria de UX, 30/10/2026): era o valor cru do motor —
 * `1234.5`, `2026-03-01`, `JSON.stringify` de objeto. Agora o mesmo formatador
 * do Contábil (`valorDaCelula`, 26/10): moeda nas colunas de valor, datas
 * dd/mm/aaaa, CNPJ com máscara, objeto em "Campo: valor"; e número solto no
 * formato brasileiro.
 */
function celula(coluna: string, v: unknown): ReactNode {
  if (typeof v === "number" && !/^valor|_valor$|^total/i.test(coluna)) {
    return <span className="tabular-nums">{Number.isInteger(v) ? INTEIRO.format(v) : DECIMAL.format(v)}</span>;
  }
  const texto = valorDaCelula(coluna, v);
  if (texto === "—") return texto;
  if (v !== null && typeof v === "object") return <span className="block max-w-72 break-words text-helper">{texto}</span>;
  return <span className={typeof v === "number" || /^-?R\$/.test(texto) ? "tabular-nums" : "break-words"}>{texto}</span>;
}

/**
 * Uma lista que o contrato só descreve pela função do motor: as colunas são as
 * que vieram (as `candidatas` primeiro). O cabeçalho sai legível desde 30/10
 * ("falta_para_aceitar" → "Falta para aceitar"). Coluna que nenhuma linha
 * trouxe não aparece. A tabela desenha 200 linhas e traz o resto pelo
 * "Mostrar mais" — antes cortava em 200, e a fila dos pagamentos vai a 2000.
 */
export function TabelaLivre({ linhas, candidatas = [], vazio = "Nada a mostrar.", acoes }: { linhas: Record<string, unknown>[]; candidatas?: readonly string[]; vazio?: string; /** Uma coluna "Ações" no fim, por linha (as escritas de §13). */ acoes?: (linha: Record<string, unknown>) => ReactNode }) {
  const colunas = colunasPresentes(linhas, candidatas);
  return <TabelaFiscal vazio={vazio} descricaoVazio="" colunas={[...colunas.map(rotuloDaColuna), ...(acoes ? ["Ações"] : [])]} linhas={linhas.map((l, i) => ({ id: String(l.id ?? i), celulas: [...colunas.map((c) => celula(c, l[c])), ...(acoes ? [acoes(l)] : [])] }))} />;
}

const ehRegistro = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Um bloco sem forma fixa (`simulacoes`, `cte`, `combustivel`...): lista vira tabela, objeto vira campo → valor. */
export function BlocoLivre({ valor }: { valor: unknown }) {
  if (valor === null || valor === undefined) return <p className="text-ui text-fg-muted">Não levantado pelo motor.</p>;
  if (Array.isArray(valor)) {
    if (valor.every(ehRegistro)) return <TabelaLivre linhas={valor} />;
    return <p className="text-ui text-fg">{valor.map((v) => String(v)).join(", ") || "—"}</p>;
  }
  if (!ehRegistro(valor)) return <p className="text-ui text-fg">{String(valor)}</p>;
  const simples = Object.entries(valor).filter(([, v]) => !Array.isArray(v) && !ehRegistro(v));
  const compostos = Object.entries(valor).filter(([, v]) => Array.isArray(v) || ehRegistro(v));
  return <div className="space-y-4">
    {simples.length > 0 && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{simples.map(([k, v]) => <div key={k}><dt className="text-helper text-fg-secondary">{rotuloDaColuna(k)}</dt><dd className="mt-1 text-ui text-fg tabular-nums">{celula(k, v)}</dd></div>)}</dl>}
    {compostos.map(([k, v]) => <section key={k} aria-label={rotuloDaColuna(k)}><h4 className="mb-2 text-label font-semibold text-fg">{rotuloDaColuna(k)}</h4>{Array.isArray(v) && v.every(ehRegistro) ? <TabelaLivre linhas={v} /> : celula(k, v)}</section>)}
  </div>;
}

/** Área que pede estabelecimento (as rotas por `empresa_id`). */
export function EscolhaUmEstabelecimento({ porQue }: { porQue: string }) {
  return <EmptyState title="Escolha um estabelecimento" description={porQue} />;
}
