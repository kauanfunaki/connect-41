"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Bot, Check, Copy, ExternalLink, Globe, LoaderCircle, ScanSearch } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { situacaoDaTriagem } from "@/app/(app)/chamados/triagem-actions";
import { ROTULOS_EXISTENTE, emTriagem, intervaloDaTriagem, textoDaTriagem, type Existente, type Triagem } from "@/lib/chamados/regras";

// A triagem na tela do chamado (10/11/2026). Enquanto ela roda, um aviso diz o
// que está acontecendo e a tela confere sozinha se terminou; quando termina, o
// que já existe no Orquestrador ganha um cartão, e o "A classificar" diz se foi
// falha ou falta de contexto. O classificado não ganha cartão: a categoria já
// aparece no alto e a frase entra na linha do tempo.

/** Confere a situação do chamado e recarrega a tela quando a triagem termina, sem F5. Com a aba escondida, para; ao voltar, confere na hora. */
export function AtualizacaoDaTriagem({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  useEffect(() => {
    let vivo = true, conferindo = false, ultima = 0;
    const inicio = Date.now();
    async function conferir() {
      const agora = Date.now();
      if (!vivo || conferindo || document.visibilityState !== "visible" || agora - ultima < intervaloDaTriagem(agora - inicio)) return;
      ultima = agora; conferindo = true;
      try {
        const s = await situacaoDaTriagem(id);
        if (vivo && s && (!emTriagem(s.status) || s.version !== version)) router.refresh();
      } finally { conferindo = false; }
    }
    const relogio = window.setInterval(() => void conferir(), 1000);
    const aoVoltar = () => { ultima = 0; void conferir(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; window.clearInterval(relogio); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [id, version, router]);
  return null;
}

export function TriagemEmAndamento({ id, version }: { id: string; version: number }) {
  return <div role="status" aria-live="polite">
    <Aviso tom="info" icone={<LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}>
      <p className="font-semibold">Triagem em andamento</p>
      <p>A IA está conferindo se já existe no Orquestrador algo que faça o pedido e classificando o chamado. A tela se atualiza sozinha, e o sino avisa quando terminar.</p>
    </Aviso>
    <AtualizacaoDaTriagem id={id} version={version} />
  </div>;
}

/** O resultado da triagem que pede atenção: o que já existe no Orquestrador, ou o porquê de ficar para a equipe classificar. */
export function ResultadoDaTriagem({ triagem, pedido, podeVerOps, souQuemAbriu }: { triagem: Triagem; pedido: string; podeVerOps: boolean; souQuemAbriu: boolean }) {
  if (triagem.existente) return <CartaoDoExistente e={triagem.existente} pedido={pedido} podeVerOps={podeVerOps} souQuemAbriu={souQuemAbriu} />;
  if (triagem.categoria) return null;
  return <Aviso tom={triagem.semCategoria === "falha" ? "atencao" : "neutro"} icone={<ScanSearch aria-hidden />}>
    <p className="font-semibold">{triagem.semCategoria === "falha" ? "A triagem automática falhou" : "A classificar pela equipe"}</p>
    <p>{textoDaTriagem(triagem)}</p>
  </Aviso>;
}

const ICONES = { robo: Bot, site: Globe, app: AppWindow };
// A mensagem pronta para o responsável é de quem abriu; a equipe vê o mesmo cartão sem ela.
function CartaoDoExistente({ e, pedido, podeVerOps, souQuemAbriu }: { e: Existente; pedido: string; podeVerOps: boolean; souQuemAbriu: boolean }) {
  const Icone = ICONES[e.tipo], primeiroNome = e.responsavel?.trim().split(/\s+/)[0];
  const rotulo = ROTULOS_EXISTENTE[e.tipo];
  // Texto pronto para quem pediu confirmar com o responsável, sem precisar do Orquestrador.
  const texto = pedido.trim(), resumo = texto.length > 600 ? `${texto.slice(0, 600).trimEnd()}…` : texto;
  const mensagem = `Oi, ${primeiroNome}! Tudo bem? Abri um chamado e a triagem apontou o ${rotulo} "${e.nome}", que fica com você. Ele atende ao que eu preciso?${resumo ? `\n\nO que eu preciso:\n${resumo}` : ""}\n\nSe atender, como faço para usar?`;
  const [copiado, setCopiado] = useState(false);
  function copiar() { navigator.clipboard.writeText(mensagem).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }, () => {}); }
  return <section aria-labelledby="titulo-existente" className="rounded-lg border border-brand/30 bg-surface p-5 shadow-[var(--c41-shadow-xs)]">
    <h2 id="titulo-existente" className="mb-3 text-ui font-semibold text-brand">{e.match === "same" ? "Já existe no Orquestrador" : "Pode já existir no Orquestrador"}</h2>
    <div className="flex items-start gap-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand"><Icone size={20} /></span>
      <div className="min-w-0">
        <p className="break-words font-semibold text-fg">{e.nome}</p>
        <p className="text-helper text-fg-muted">{rotulo[0].toLocaleUpperCase("pt-BR") + rotulo.slice(1)}{e.detalhe ? `, ${e.detalhe}` : ""}</p>
        {e.reason && <p className="mt-2 text-ui text-fg-secondary">{e.reason}</p>}
        <p className="mt-2 text-ui text-fg-secondary">Responsável: <strong className="text-fg">{e.responsavel ?? "sem responsável definido"}</strong></p>
        {(e.endereco || (podeVerOps && e.noOps)) && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-helper">
          {e.endereco && <a href={e.endereco} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"><ExternalLink size={12} aria-hidden />Abrir o {rotulo}</a>}
          {podeVerOps && e.noOps && <a href={e.noOps} className="inline-flex items-center gap-1 text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand">Ver no Orquestrador</a>}
        </div>}
      </div>
    </div>
    <p className="mt-4 text-ui text-fg-secondary">{souQuemAbriu
      ? `O chamado segue com a equipe. Se o ${rotulo} já resolver, fale com ${primeiroNome ?? "o responsável"} para começar a usar.`
      : `Quem abriu foi avisado. Se o ${rotulo} resolver o pedido, o chamado pode ser encerrado com a indicação dele.`}</p>
    {souQuemAbriu && primeiroNome && <div className="mt-3 rounded-lg bg-surface-hover p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-helper font-medium text-fg-secondary">Mensagem para {primeiroNome}</p>
        <Button size="sm" variant="ghost" onClick={copiar}>{copiado ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copiado ? "Copiada" : "Copiar"}</Button>
      </div>
      <p className="whitespace-pre-line break-words text-ui text-fg">{mensagem}</p>
    </div>}
  </section>;
}
