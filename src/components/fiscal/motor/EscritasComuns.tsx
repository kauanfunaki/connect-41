"use client";

// Peças comuns dos botões das escritas de §13 nas telas fiscais (23/10/2026).

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import type { ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";
import type { PermissaoDeEscrita } from "@/lib/fiscal/motor/escrita";
import { conferirArquivos, ENVIOS, type DestinoDeEnvio } from "@/lib/sped/escritasDoMotor";
import { modoDoEnvio, TETO_DO_UPLOAD, type ProgressoDoEnvio } from "@/lib/sped/envioEmPartes";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";
import { useEnvioEmPartes } from "./useEnvioEmPartes";

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
 *
 * Em Documentos, acima de 25 MB (até 500 MB) o envio troca sozinho para a
 * sessão em partes (§14.4, `useEnvioEmPartes`): progresso por arquivo,
 * cancelar e retomar de onde parou.
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
  // "Desistir e apagar as partes" apaga no motor o que já subiu: confirma antes
  // (auditoria de UX, 30/10/2026) — era um botão discreto, um clique.
  const [confirmarDesistir, setConfirmarDesistir] = useState(false);
  const [gesto, , depoisDe] = useChaveDeIdempotencia();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<(Resultado & { retomavel?: boolean }) | null>(null);
  const accept = ACEITOS[destino];
  const arquivos = fila.map((a) => a.file);
  const extras = filaExtra.map((a) => a.file);
  const emPartes = destino === "documentos" ? modoDoEnvio(arquivos) : null;
  const problema = !fila.length ? null : emPartes?.modo === "partes" ? null : emPartes?.modo === "recusado" ? emPartes.motivo : conferirArquivos(destino, arquivos, extras);

  const marcar = useCallback((arquivo: File, mudanca: Partial<ArquivoNaFila>) => setFila((f) => f.map((a) => (a.file === arquivo ? { ...a, ...mudanca } : a))), []);
  const aoProgresso = useCallback((arquivo: File, p: ProgressoDoEnvio) => marcar(arquivo, { estado: "enviando", progresso: Math.min(99, Math.round((p.enviados / Math.max(p.total, 1)) * 100)) }), [marcar]);
  const aoConcluirArquivo = useCallback((arquivo: File) => marcar(arquivo, { estado: "concluido", progresso: 100 }), [marcar]);
  const partes = useEnvioEmPartes(raiz, aoProgresso, aoConcluirArquivo);

  const terminar = (r: ResultadoDoMotor<T>, retomavel = false) => {
    setResultado({ ok: r.ok, mensagem: r.mensagem, retomavel });
    if (r.ok) {
      setFila([]);
      setFilaExtra([]);
      if (r.dados !== undefined) aoConcluir?.(r.dados);
      router.refresh();
    } else {
      setFila((f) => f.map((a) => (a.estado === "concluido" ? a : { ...a, estado: "erro", progresso: 0, erro: undefined })));
      aoFalhar?.(r);
    }
  };

  const enviarEmPartes = async () => {
    setEnviando(true);
    setResultado(null);
    const pendentes = fila.filter((a) => a.estado !== "concluido").map((a) => a.file);
    const fim = await partes.enviar(pendentes);
    setEnviando(false);
    if (fim.ok) terminar({ ok: true, mensagem: fim.mensagem, dados: fim.dados as T });
    else terminar({ ok: false, mensagem: fim.mensagem, renovarChave: false }, fim.retomavel);
  };

  const enviar = async () => {
    if (emPartes?.modo === "partes") return enviarEmPartes();
    const recusa = emPartes?.modo === "recusado" ? emPartes.motivo : conferirArquivos(destino, arquivos, extras);
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

  const cancelar = async () => {
    await partes.cancelar();
    setEnviando(false);
    setFila((f) => f.map((a) => (a.estado === "concluido" ? a : { ...a, estado: "pendente", progresso: 0 })));
    setResultado({ ok: false, mensagem: "Envio cancelado: as partes já mandadas foram apagadas no motor." });
  };

  const adicionar = (setter: typeof setFila, varios: boolean) => (files: File[]) => {
    setResultado(null);
    setter((f) => [...(varios ? f.filter((a) => a.estado !== "erro" || emPartes?.modo === "partes") : []), ...files.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, progresso: 0, estado: "pendente" as const }))]);
  };
  const tetoMb = destino === "documentos" ? Math.floor(TETO_DO_UPLOAD / (1024 * 1024)) : Math.floor(regra.teto / (1024 * 1024));
  const p = partes.progresso;

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
    {emPartes?.modo === "partes" && fila.length > 0 && !enviando && <p className="text-helper text-fg-secondary">Acima de 25 MB: o Connect manda em partes de 8 MB, um arquivo por vez. Se a conexão cair, “Retomar” continua de onde parou.</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!permissao.pode || fila.length === 0 || !!problema} loading={enviando} loadingLabel={emPartes?.modo === "partes" ? "Enviando em partes…" : "Enviando ao motor…"} onClick={enviar}>{resultado?.retomavel ? "Retomar" : rotuloDoBotao}</Button>
      {enviando && emPartes?.modo === "partes" && <Button size="sm" variant="secondary" onClick={cancelar}>Cancelar envio</Button>}
      {!enviando && resultado?.retomavel && <Button size="sm" variant="danger" onClick={() => setConfirmarDesistir(true)}>Desistir e apagar as partes</Button>}
      {enviando && emPartes?.modo !== "partes" && <span className="text-helper text-fg-muted">O motor lê o arquivo na hora: pode levar até um minuto.</span>}
      {enviando && p && <span className="text-helper text-fg-muted" aria-live="polite">{p.arquivo}: {p.fase === "criando" ? "abrindo a sessão…" : p.fase === "enviando" ? `${Math.round(p.enviados / (1024 * 1024))} de ${Math.round(p.total / (1024 * 1024))} MB enviados` : p.fase === "concluindo" ? "o motor está juntando as partes e importando…" : "conferindo a conclusão no motor…"}</span>}
    </div>
    <MotivoSemEscrita permissao={permissao} />
    <AvisoDoResultado resultado={resultado} />
    <ConfirmDialog open={confirmarDesistir} title="Desistir do envio?" description="As partes que já subiram são apagadas no motor. Para mandar o arquivo de novo, o envio recomeça do zero."
      confirmLabel="Desistir e apagar" cancelLabel="Voltar" destructive
      onConfirm={() => { setConfirmarDesistir(false); void cancelar(); }} onCancel={() => setConfirmarDesistir(false)} />
  </div>;
}

const ACEITOS: Record<DestinoDeEnvio, string> = {
  documentos: ".xml,.pdf,.jpg,.jpeg,.png,.csv,.zip",
  omie: ".csv",
  confronto: ".xlsx",
  pagamentos_apoio: ".pdf",
  faturas_bpo: ".xlsx",
};
