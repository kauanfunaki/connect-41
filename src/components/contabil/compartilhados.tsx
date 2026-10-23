"use client";
import { cloneElement, isValidElement, useId } from "react";
import type { ContextoContabil } from "@/lib/contabil/types";
export const texto = (v: unknown) => v == null ? "" : String(v);
export const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const classesCampo = "h-10 w-full rounded-md border border-border-strong bg-input-bg px-3 text-input text-fg";
export async function consultar<T>(operacao: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const r = await fetch("/api/contabil/sped/" + operacao + "?" + new URLSearchParams(params), { signal, cache: "no-store" });
  const dados = await r.json(); if (!r.ok) throw new Error(dados.error ?? "Não foi possível consultar."); return dados as T;
}
export async function comandar<T>(operacao: string, contexto: ContextoContabil, dados: Record<string, unknown> = {}, chave = crypto.randomUUID()): Promise<T> {
  const r = await fetch("/api/contabil/sped/" + operacao, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": chave }, body: JSON.stringify({ ...dados, contexto }) });
  const retorno = await r.json(); if (!r.ok) throw new Error(retorno.error ?? "Não foi possível concluir."); return retorno as T;
}
export function Mensagem({ children, erro = false }: { children: React.ReactNode; erro?: boolean }) {
  return <div role={erro ? "alert" : "status"} className={"rounded-lg border p-4 text-label " + (erro ? "border-danger/30 bg-danger-bg text-danger" : "border-border bg-surface-2 text-fg-secondary")}>{children}</div>;
}
export function Campo({ nome, children }: { nome: string; children: React.ReactNode }) {
  const id = useId();
  return <div className="flex flex-col gap-1.5 text-label font-medium text-fg"><label htmlFor={id}>{nome}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}
