"use client";
import { cloneElement, isValidElement, useId } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Selo } from "@/components/ui/Selo";
import { rotuloDaColuna, rotuloDoEstado, tomDoEstado, valorDaCelula } from "@/lib/contabil/exibicao";
import type { ContextoContabil } from "@/lib/contabil/types";
export const texto = (v: unknown) => v == null ? "" : String(v);
export const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** O status da API acompanha a mensagem (26/10/2026): 503 é integração ausente ou fora do ar, e só ele leva a "Configurar integração". */
export class ErroDaApi extends Error { constructor(message: string, readonly status: number) { super(message); } }
export const integracaoIndisponivel = (e: unknown) => e instanceof ErroDaApi && e.status === 503;
export async function consultar<T>(operacao: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const r = await fetch("/api/contabil/sped/" + operacao + "?" + new URLSearchParams(params), { signal, cache: "no-store" });
  const dados = await r.json(); if (!r.ok) throw new ErroDaApi(dados.error ?? "Não foi possível consultar.", r.status); return dados as T;
}
export async function comandar<T>(operacao: string, contexto: ContextoContabil, dados: Record<string, unknown> = {}, chave = crypto.randomUUID()): Promise<T> {
  const r = await fetch("/api/contabil/sped/" + operacao, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": chave }, body: JSON.stringify({ ...dados, contexto }) });
  const retorno = await r.json(); if (!r.ok) throw new ErroDaApi(retorno.error ?? "Não foi possível concluir.", r.status); return retorno as T;
}
/** O rótulo é o do `CampoForm`, como no `CampoFiscal` (26/10/2026). */
export function Campo({ nome, helper, children, className }: { nome: string; helper?: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  return <CampoForm label={nome} htmlFor={id} helper={helper} className={className}>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</CampoForm>;
}
export function EstadoContabil({ estado }: { estado: string }) { return <Selo tom={tomDoEstado(estado)}>{rotuloDoEstado(estado)}</Selo>; }
/** Cabeçalho legível e células formatadas (26/10/2026): eram as chaves do motor e `JSON.stringify`. */
export function ListaDados({ linhas }: { linhas: Record<string, unknown>[] }) {
  if (!linhas.length) return <p className="text-label text-fg-secondary my-3">Nenhum item nesta lista.</p>;
  const colunas = [...new Set(linhas.flatMap(l => Object.keys(l)))].filter(k => !["sugestao", "caminhos"].includes(k)).slice(0, 8);
  return <div className="overflow-x-auto my-3"><table className="w-full text-ui text-left"><thead><tr>{colunas.map(c => <th key={c} scope="col" className="p-2 border-b border-border font-semibold text-fg-secondary">{rotuloDaColuna(c)}</th>)}</tr></thead><tbody>{linhas.slice(0, 100).map((l, i) => <tr key={i}>{colunas.map(c => <td key={c} className="p-2 border-b border-border break-words max-w-72">{valorDaCelula(c, l[c])}</td>)}</tr>)}</tbody></table>{linhas.length > 100 && <p className="text-helper text-fg-muted mt-2">Mostrando 100 itens. Use os arquivos para consultar a lista completa.</p>}</div>;
}
