"use client";

// Peças comuns dos botões das escritas de §13 nas telas fiscais (23/10/2026).

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import type { ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";
import type { PermissaoDeEscrita } from "@/lib/fiscal/motor/escrita";
import { conferirArquivos, ENVIOS, type DestinoDeEnvio } from "@/lib/sped/escritasDoMotor";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

export type Resultado = { ok: boolean; mensagem: string };

/** Por que os botões estão desabilitados (sem token) — ou, sem perfil, por que não aparecem. */
export function MotivoSemEscrita({ permissao }: { permissao: PermissaoDeEscrita }) {
  if (!permissao.motivo) return null;
  return <p className="text-helper text-fg-muted">{permissao.motivo}</p>;
}

export function AvisoDoResultado({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null;
  return <div role={resultado.ok ? "status" : "alert"}><Aviso tom={resultado.ok ? "sucesso" : "atencao"}>{resultado.mensagem}</Aviso></div>;
}

/**
 * O laço de uma escrita pesada sobre vários itens (CT-e dos arquivos pendentes,
 * combustível de cada filial): um por vez, na ordem, mostrando o progresso.
 * Para no primeiro erro — em `503 motor_ocupado` não tenta sozinho: a pessoa
 * continua de onde parou. Cada item tem a sua chave, repetida na nova
 * tentativa daquele item.
 */
export function useLacoPesado<T>(executar: (item: T, chave: string) => Promise<ResultadoDoMotor<unknown>>, rotulo: (item: T) => string) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [total, setTotal] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [restantes, setRestantes] = useState<T[]>([]);
  const chaves = useRef(new Map<T, string>());
  const rodar = useCallback(async (itens: T[]) => {
    const chaveDe = (item: T) => {
      let k = chaves.current.get(item);
      if (!k) { k = `c41:${globalThis.crypto.randomUUID()}`; chaves.current.set(item, k); }
      return k;
    };
    setRodando(true);
    setResultado(null);
    setTotal(itens.length);
    setFeitos(0);
    let i = 0;
    for (; i < itens.length; i++) {
      const r = await executar(itens[i], chaveDe(itens[i])).catch(() => ({ ok: false as const, mensagem: "Falha de conexão com o Connect. Tente de novo.", renovarChave: false }));
      if (!r.ok) {
        if (r.renovarChave) chaves.current.delete(itens[i]);
        setResultado({ ok: false, mensagem: `${i} de ${itens.length} feito(s). Parou em ${rotulo(itens[i])}: ${r.mensagem}` });
        setRestantes(itens.slice(i));
        break;
      }
      chaves.current.delete(itens[i]);
      setFeitos(i + 1);
    }
    if (i === itens.length) { setRestantes([]); setResultado({ ok: true, mensagem: `${itens.length} de ${itens.length} feito(s).` }); }
    setRodando(false);
    if (i > 0) router.refresh();
  }, [executar, rotulo, router]);
  return { rodar, rodando, feitos, total, resultado, restantes };
}

/**
 * O envio de arquivo ao motor, pela rota `/api/fiscal/sped/envios/[destino]`
 * (o corpo passa do limite das Server Actions). Recusa antes de sair o que o
 * motor recusaria (quantidade, tipo, tamanho). O `gesto` é a chave do gesto:
 * a rota deriva dele e do conteúdo a `Idempotency-Key`, então tentar de novo o
 * mesmo arquivo depois de falha de rede, 5xx ou `motor_ocupado` é replay no
 * motor, e não um segundo envio.
 */
export function EnvioDeArquivo<T>({ destino, raiz, permissao, campos = {}, aoConcluir, aoFalhar, rotuloDoBotao }: {
  destino: DestinoDeEnvio;
  raiz: string;
  permissao: PermissaoDeEscrita;
  campos?: Record<string, string>;
  aoConcluir?: (dados: T) => void;
  /** A recusa inteira (código e detalhe), para a tela oferecer o passo seguinte (ex.: substituir). */
  aoFalhar?: (r: Extract<ResultadoDoMotor<T>, { ok: false }>) => void;
  rotuloDoBotao: string;
}) {
  const router = useRouter();
  const regra = ENVIOS[destino];
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);
  const [filaExtra, setFilaExtra] = useState<ArquivoNaFila[]>([]);
  const [gesto, , depoisDe] = useChaveDeIdempotencia();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const accept = ACEITOS[destino];
  const arquivos = fila.map((a) => a.file);
  const extras = filaExtra.map((a) => a.file);
  const problema = fila.length ? conferirArquivos(destino, arquivos, extras) : null;

  const terminar = (r: ResultadoDoMotor<T>) => {
    setResultado({ ok: r.ok, mensagem: r.mensagem });
    if (r.ok) {
      setFila([]);
      setFilaExtra([]);
      if (r.dados !== undefined) aoConcluir?.(r.dados);
      router.refresh();
    } else {
      setFila((f) => f.map((a) => ({ ...a, estado: "erro", progresso: 0, erro: undefined })));
      aoFalhar?.(r);
    }
  };

  const enviar = async () => {
    const recusa = conferirArquivos(destino, arquivos, extras);
    if (recusa) { setResultado({ ok: false, mensagem: recusa }); return; }
    setEnviando(true);
    setResultado(null);
    setFila((f) => f.map((a) => ({ ...a, estado: "enviando", progresso: 50 })));
    const form = new FormData();
    form.append("gesto", gesto);
    for (const [k, v] of Object.entries(campos)) if (v) form.append(k, v);
    for (const a of arquivos) form.append(regra.parte, a, a.name);
    if (regra.extra) for (const a of extras) form.append(regra.extra.parte, a, a.name);
    let r: ResultadoDoMotor<T>;
    try {
      const resposta = await fetch(`/api/fiscal/sped/envios/${destino}?raiz=${raiz}`, { method: "POST", body: form });
      r = await resposta.json().catch(() => ({ ok: false, mensagem: resposta.status === 413 ? "O envio passou do limite de tamanho." : `O Connect não conseguiu enviar (${resposta.status}). Tente de novo.`, renovarChave: resposta.status < 500 }));
    } catch {
      r = { ok: false, mensagem: "Falha de conexão com o Connect. Tente de novo: o mesmo arquivo não é importado duas vezes.", renovarChave: false };
    }
    depoisDe(r);
    setEnviando(false);
    terminar(r);
  };

  const adicionar = (setter: typeof setFila, varios: boolean) => (files: File[]) => {
    setResultado(null);
    setter((f) => [...(varios ? f.filter((a) => a.estado !== "erro") : []), ...files.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, progresso: 0, estado: "pendente" as const }))]);
  };
  const tetoMb = Math.floor(regra.teto / (1024 * 1024));

  if (!permissao.visivel) return <MotivoSemEscrita permissao={permissao} />;
  return <div className="space-y-3">
    <FileDropzone accept={accept} maxSizeMb={tetoMb} multiple={regra.varios} arquivos={fila} desabilitado={!permissao.pode || enviando}
      onAdicionar={adicionar(setFila, regra.varios)} onRemover={(id) => setFila((f) => f.filter((a) => a.id !== id))} />
    {regra.extra && <div className="space-y-1">
      <p className="text-helper text-fg-secondary">{regra.extra.rotulo[0].toUpperCase() + regra.extra.rotulo.slice(1)} em PDF (opcional): ligam à fatura pelo número da nota no nome do arquivo; o conteúdo não é lido.</p>
      <FileDropzone accept=".pdf" maxSizeMb={tetoMb} multiple arquivos={filaExtra} desabilitado={!permissao.pode || enviando}
        onAdicionar={adicionar(setFilaExtra, true)} onRemover={(id) => setFilaExtra((f) => f.filter((a) => a.id !== id))} />
    </div>}
    {problema && <Aviso tom="atencao">{problema}</Aviso>}
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!permissao.pode || fila.length === 0 || !!problema} loading={enviando} loadingLabel="Enviando ao motor…" onClick={enviar}>{rotuloDoBotao}</Button>
      {enviando && <span className="text-helper text-fg-muted">O motor lê o arquivo na hora: pode levar até um minuto.</span>}
    </div>
    <MotivoSemEscrita permissao={permissao} />
    <AvisoDoResultado resultado={resultado} />
  </div>;
}

const ACEITOS: Record<DestinoDeEnvio, string> = {
  documentos: ".xml,.pdf,.jpg,.jpeg,.png,.csv,.zip",
  omie: ".csv",
  confronto: ".xlsx",
  pagamentos_apoio: ".pdf",
  faturas_bpo: ".xlsx",
};
