"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudDownload, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { dataHora } from "@/lib/honorarios/rotulos";
import type { EstadoAcessorias } from "@/lib/honorarios/servidor/acessoriasService";
import { conferirNoAcessorias, liberarEnviosAoAcessorias } from "@/app/(app)/honorarios/actions";
import { useAcao } from "./useAcao";

type Resumo = { conferidoEm: Date | null; iguais: number; diferentes: number; naoEncontradas: number };

/**
 * O Acessórias na tela de Honorários: se a integração está pronta, quando foi a
 * última conferência, o andamento da operação em curso e a trava dos envios.
 * Enquanto uma operação roda, a tela se recarrega a cada 3 s; ao terminar,
 * avisa o resultado.
 */
export function QuadroDoAcessorias({ estado, resumo, podeAgir, podeGerir }: { estado: EstadoAcessorias; resumo: Resumo; podeAgir: boolean; podeGerir: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { rodando, rodar } = useAcao();
  const op = estado.operacao;

  const idAntes = useRef(op?.executando ? op.id : null);
  useEffect(() => {
    const antes = idAntes.current;
    idAntes.current = op?.executando ? op.id : null;
    if (antes && op?.id === antes && !op.executando && op.mensagem) {
      if (op.erros > 0) toast.error(op.mensagem);
      else toast.success(op.mensagem);
    }
    if (!op?.executando) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [op, router, toast]);

  if (!estado.configurado) {
    return (
      <Aviso tom="neutro" className="mb-4">
        {estado.motivoNaoConfigurado} Dá para conferir os valores lidos e informar os que faltam, mas não para ler nem atualizar o Acessórias.{" "}
        <Link href="/admin/integracoes" className="text-brand hover:underline">
          Abrir Integrações
        </Link>
      </Aviso>
    );
  }

  let andamento: string | null = null;
  if (op?.executando) {
    andamento = op.tipo === "conferir" ? `Lendo o Acessórias… ${op.feitos} empresa(s) até agora.` : `Enviando… ${op.feitos} de ${op.total ?? "?"}.`;
  } else if (op?.mensagem) {
    andamento = `Última operação (${op.conta}, ${dataHora(op.concluidaEm ?? op.iniciadaEm)}): ${op.mensagem}`;
  }

  return (
    <>
      {estado.bloqueio && <AvisoDeTrava bloqueio={estado.bloqueio} podeGerir={podeGerir} />}
      <section aria-label="Acessórias" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-ui text-fg">
            <span className="font-semibold">Acessórias</span>
            {" · "}
            {resumo.conferidoEm ? `conferido em ${dataHora(resumo.conferidoEm)}` : "ainda não conferido"}
          </p>
          {resumo.conferidoEm && (
            <p className="mt-0.5 text-label text-fg-secondary">
              <Link href="/honorarios?situacao=todas&acessorias=DIFERENTE" className={resumo.diferentes > 0 ? "text-warning-fg hover:underline" : "hover:underline"}>
                {resumo.diferentes} diferente(s)
              </Link>
              {" · "}
              <Link href="/honorarios?situacao=todas&acessorias=IGUAL" className="hover:underline">
                {resumo.iguais} igual(is)
              </Link>
              {" · "}
              <Link href="/honorarios?situacao=todas&acessorias=NAO_ENCONTRADA" className="hover:underline">
                {resumo.naoEncontradas} não encontrada(s)
              </Link>
            </p>
          )}
          {andamento && (
            <p className="mt-0.5 text-label text-fg-muted" aria-live="polite">
              {andamento}
            </p>
          )}
        </div>
        {podeAgir && (
          <Button
            variant="secondary"
            size="sm"
            disabled={rodando || !!op?.executando}
            onClick={() => rodar(() => conferirNoAcessorias())}
            title="Lê o honorário de todas as empresas no Acessórias para comparar. Nada é alterado lá."
          >
            {op?.executando && op.tipo === "conferir" ? (
              <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <CloudDownload size={14} aria-hidden />
            )}
            Conferir no Acessórias
          </Button>
        )}
      </section>
    </>
  );
}

const vazio = (v: unknown) => (v === null || v === undefined || v === "" ? "(vazio)" : typeof v === "string" ? v : JSON.stringify(v));
const curto = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);

/** Um envio mexeu em outros campos da ficha no Acessórias: tudo para até alguém conferir lá. */
function AvisoDeTrava({ bloqueio, podeGerir }: { bloqueio: NonNullable<EstadoAcessorias["bloqueio"]>; podeGerir: boolean }) {
  const [verDetalhe, setVerDetalhe] = useState(false);
  const { rodando, rodar } = useAcao();
  return (
    <Aviso tom="perigo" icone={<LockKeyhole size={16} />} className="mb-4">
      <p className="font-semibold">Envios ao Acessórias travados</p>
      <p className="mt-1">
        Ao atualizar o honorário de <strong>{bloqueio.razaoSocial}</strong> ({dataHora(bloqueio.enviadoEm)}, por {bloqueio.conta}), estes campos também
        mudaram no Acessórias: <strong>{bloqueio.outrosCampos.join(", ")}</strong>. Confira a empresa no Acessórias, corrija o que for preciso e só
        então libere.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="xs" onClick={() => setVerDetalhe((v) => !v)} aria-expanded={verDetalhe}>
          {verDetalhe ? "Esconder antes e depois" : "Ver antes e depois"}
        </Button>
        {podeGerir && (
          <Button size="xs" disabled={rodando} onClick={() => rodar(() => liberarEnviosAoAcessorias(bloqueio.id))}>
            Já conferi no Acessórias: liberar envios
          </Button>
        )}
      </div>
      {verDetalhe && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-label text-fg">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted text-left">
                <th className="py-1 pr-3 font-medium">Campo</th>
                <th className="py-1 pr-3 font-medium">Antes</th>
                <th className="py-1 font-medium">Depois</th>
              </tr>
            </thead>
            <tbody>
              {bloqueio.outrosCampos.map((c) => (
                <Fragment key={c}>
                  <tr className="border-t border-border-soft align-top">
                    <td className="py-1 pr-3 font-medium">{c}</td>
                    <td className="py-1 pr-3 break-words">{curto(vazio(bloqueio.fichaAntes?.[c]))}</td>
                    <td className="py-1 break-words">{curto(vazio(bloqueio.fichaDepois?.[c]))}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Aviso>
  );
}

