"use client";

// O envio de documentos acima de 25 MiB, em partes (API-CONNECT §14.4). A
// lógica está em `@/lib/sped/envioEmPartes` (pura, testada); aqui ficam o
// estado da tela, o Web Crypto da parte, o cancelamento e a lembrança das
// sessões abertas (para retomar depois de recarregar a página).

import { useCallback, useRef, useState } from "react";
import { somarEnvios, type UploadConcluido } from "@/lib/sped/escritasDoMotor";
import { apiDoConnect, enviarEmPartes, type ProgressoDoEnvio, type SessaoDoEnvio } from "@/lib/sped/envioEmPartes";
import { Sha256 } from "@/lib/sped/sha256";

const nova = () => `c41:${globalThis.crypto.randomUUID()}`;
const chaveDoArquivo = (raiz: string, f: File) => `c41-upload:${raiz}:${f.name}:${f.size}:${f.lastModified}`;

// A sessão aberta fica no `sessionStorage` da aba: recarregar a página e
// escolher o mesmo arquivo retoma de onde parou. O token é do Connect, amarrado
// a este usuário (não é credencial do motor). Sem storage, só não retoma.
function lembrar(chave: string, s: SessaoDoEnvio | null) {
  try {
    if (s) globalThis.sessionStorage.setItem(chave, JSON.stringify({ id: s.id, token: s.token, tamanhoParte: s.tamanhoParte, partesEsperadas: s.partesEsperadas }));
    else globalThis.sessionStorage.removeItem(chave);
  } catch { /* sem storage: a retomada fica só na memória da aba */ }
}
function lembrada(chave: string): SessaoDoEnvio | null {
  try {
    const v = JSON.parse(globalThis.sessionStorage.getItem(chave) ?? "null");
    return v && typeof v.id === "string" && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}

async function sha256DaParte(bytes: Uint8Array<ArrayBuffer>) {
  const h = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type FimDoLote = { ok: true; mensagem: string; dados: UploadConcluido } | { ok: false; mensagem: string; retomavel: boolean };

/**
 * Um arquivo por sessão, um depois do outro (o motor aceita 4 sessões abertas
 * por raiz; assim nunca há mais de uma deste lote). Parou no meio (rede,
 * `motor_ocupado`, aba fechada): "Retomar" manda só o que falta.
 */
export function useEnvioEmPartes(raiz: string, aoProgresso: (arquivo: File, p: ProgressoDoEnvio) => void, aoConcluirArquivo: (arquivo: File) => void) {
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<(ProgressoDoEnvio & { arquivo: string }) | null>(null);
  const sessoes = useRef(new Map<string, SessaoDoEnvio>());
  const gesto = useRef(nova());
  const controle = useRef<AbortController | null>(null);
  const atual = useRef<{ chave: string; sessao: SessaoDoEnvio | null } | null>(null);

  const enviar = useCallback(async (arquivos: File[]): Promise<FimDoLote> => {
    const sinal = new AbortController();
    controle.current = sinal;
    setRodando(true);
    const api = apiDoConnect<UploadConcluido>(raiz, gesto.current, { sinal: sinal.signal });
    const feitos: UploadConcluido[] = [];
    try {
      for (const arquivo of arquivos) {
        const chave = chaveDoArquivo(raiz, arquivo);
        const retomar = sessoes.current.get(chave) ?? lembrada(chave);
        atual.current = { chave, sessao: retomar };
        const fim = await enviarEmPartes<UploadConcluido>(arquivo, {
          api,
          sha256DaParte,
          novoHash: () => new Sha256(),
          esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
          sinal: sinal.signal,
          aoProgresso: (p) => { setProgresso({ ...p, arquivo: arquivo.name }); aoProgresso(arquivo, p); },
          aoAbrir: (s) => { atual.current = { chave, sessao: s }; sessoes.current.set(chave, s); lembrar(chave, s); },
        }, retomar);
        if (sinal.signal.aborted) return { ok: false, mensagem: "Envio cancelado.", retomavel: false };
        if (fim.sessao) { sessoes.current.set(chave, fim.sessao); lembrar(chave, fim.sessao); atual.current = { chave, sessao: fim.sessao }; }
        if (!fim.ok) {
          if (!fim.retomavel) { sessoes.current.delete(chave); lembrar(chave, null); }
          const antes = feitos.length ? `${feitos.length} arquivo(s) importado(s). ` : "";
          return { ok: false, mensagem: `${antes}${arquivo.name}: ${fim.mensagem}${fim.retomavel ? " Use “Retomar”: as partes já enviadas não sobem de novo." : ""}`, retomavel: fim.retomavel };
        }
        sessoes.current.delete(chave);
        lembrar(chave, null);
        feitos.push(fim.dados);
        aoConcluirArquivo(arquivo);
      }
      gesto.current = nova();
      const junto = somarEnvios(feitos)!;
      const r = junto.resumo;
      return { ok: true, mensagem: `${feitos.length > 1 ? `${feitos.length} arquivos, ` : ""}importação #${junto.importacao_id}: ${r.novos} novo(s), ${r.duplicados} duplicado(s), ${r.erros} com erro, ${r.ignorados} ignorado(s).`, dados: { ...junto, upload_id: feitos[feitos.length - 1].upload_id } };
    } finally {
      setRodando(false);
      controle.current = null;
    }
  }, [raiz, aoProgresso, aoConcluirArquivo]);

  /** Para o envio e apaga a sessão aberta no motor (as partes já mandadas somem). */
  const cancelar = useCallback(async () => {
    controle.current?.abort();
    const a = atual.current;
    const sessao = a ? (sessoes.current.get(a.chave) ?? a.sessao ?? lembrada(a.chave)) : null;
    if (a) { sessoes.current.delete(a.chave); lembrar(a.chave, null); }
    atual.current = null;
    gesto.current = nova();
    setProgresso(null);
    if (sessao) await apiDoConnect(raiz, gesto.current).apagar(sessao);
  }, [raiz]);

  return { enviar, cancelar, rodando, progresso };
}
