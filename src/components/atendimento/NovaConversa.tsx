"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCirclePlus, Search } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { buscarContatosAction, iniciarConversaAction, pedirParaAssumirAction } from "@/app/(app)/atendimento/actions";
import type { ContatoEncontrado } from "@/lib/atendimento/comandosDeContato";

/**
 * "Nova conversa" (13/11/2026, pedido do Victor): a pessoa busca um contato
 * que já tem histórico ou foi ligado a uma empresa e começa a conversa ela
 * mesma. Antes, o Connect confere se alguém já está atendendo: se está, mostra
 * quem e oferece pedir para assumir, que quem atende precisa autorizar.
 */
export function NovaConversa({ aberta, aoFechar, veTudo }: { aberta: boolean; aoFechar: () => void; veTudo: boolean }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<{ termo: string; lista: ContatoEncontrado[] } | null>(null);
  const [versao, setVersao] = useState(0);
  const buscando = termo.trim().length >= 2;

  useEffect(() => {
    if (!buscando) return;
    const pedido = termo;
    let vivo = true;
    const t = window.setTimeout(async () => {
      const lista = await buscarContatosAction(pedido);
      if (vivo) setAchados({ termo: pedido, lista });
    }, 300);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [termo, buscando, versao]);

  const lista = buscando && achados?.termo === termo ? achados.lista : null;

  return (
    <SlideOver open={aberta} onClose={aoFechar} title="Nova conversa" width="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-ui text-fg-secondary">
          Busque um contato que já falou com o escritório ou foi ligado a uma empresa. Se alguém já estiver atendendo, a conversa continua com essa pessoa até ser passada ou encerrada.
        </p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input
            autoFocus
            aria-label="Buscar contato"
            placeholder="Nome, empresa ou telefone"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            className="pl-9"
          />
        </div>
        {!buscando ? (
          <p className="text-micro text-fg-muted">Digite pelo menos 2 letras ou 4 números do telefone.</p>
        ) : lista === null ? (
          <p className="text-ui text-fg-muted">Buscando…</p>
        ) : lista.length === 0 ? (
          <p className="text-ui text-fg-muted">Nenhum contato com essa busca. Só aparecem os contatos que já falaram pelo número do escritório.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Contatos encontrados">
            {lista.map((x) => (
              <Contato key={x.contatoId} x={x} veTudo={veTudo} aoMudar={() => setVersao((n) => n + 1)} aoAbrir={aoFechar} />
            ))}
          </ul>
        )}
      </div>
    </SlideOver>
  );
}

function Contato({ x, veTudo, aoMudar, aoAbrir }: { x: ContatoEncontrado; veTudo: boolean; aoMudar: () => void; aoAbrir: () => void }) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const s = x.situacao;

  function comecar() {
    setErro(null);
    iniciar(async () => {
      const r = await iniciarConversaAction(x.contatoId);
      if (!r.ok) {
        setErro(r.erro);
        aoMudar();
        return;
      }
      aoAbrir();
      router.push(`/atendimento/${r.cicloId}`);
    });
  }

  function pedir(cicloId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await pedirParaAssumirAction(cicloId);
      if (!r.ok) setErro(r.erro);
      else toast.success(`Pedido enviado para ${x.comQuem ?? "quem atende"}.`);
      aoMudar();
    });
  }

  return (
    <li className="rounded-lg border border-border bg-surface px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-fg truncate">{x.titulo}</p>
          <p className="text-micro text-fg-muted truncate">
            {x.subtitulo ? `${x.subtitulo} · ` : ""}
            {x.telefone}
          </p>
        </div>
        {s.tipo === "livre" && !x.saiu && <Selo tom="sucesso">Livre</Selo>}
        {s.tipo === "comigo" && <Selo tom="marca">Com você</Selo>}
        {s.tipo === "com_outro" && <Selo tom="atencao">Em atendimento</Selo>}
        {s.tipo === "sem_responsavel" && <Selo tom="neutro">Sem responsável</Selo>}
        {x.saiu && <Selo tom="perigo">Pediu PARAR</Selo>}
      </div>

      {x.saiu ? (
        <p className="text-micro text-fg-muted">Este contato pediu para não receber mensagens. Só ele pode voltar a escrever.</p>
      ) : s.tipo === "livre" ? (
        <Button size="sm" className="self-start" loading={ocupado} onClick={comecar}>
          <MessageCirclePlus size={14} /> Iniciar conversa
        </Button>
      ) : s.tipo === "comigo" ? (
        <Button size="sm" className="self-start" href={`/atendimento/${s.cicloId}`} onClick={aoAbrir}>
          Abrir a conversa
        </Button>
      ) : s.tipo === "com_outro" ? (
        <>
          <p className="text-ui text-fg-secondary">
            <b>{x.comQuem}</b> está atendendo ({x.onde}). Você só fala com este contato se a conversa for passada para você ou encerrada.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {x.pediEu ? (
              <Selo tom="marca">Pedido enviado: esperando {x.comQuem} autorizar</Selo>
            ) : x.outroPediu ? (
              <span className="text-micro text-fg-muted">Outra pessoa já pediu para assumir. Espere a decisão.</span>
            ) : (
              <Button size="sm" variant="secondary" loading={ocupado} onClick={() => pedir(s.cicloId)}>
                Pedir para assumir
              </Button>
            )}
            {veTudo && (
              <Link href={`/atendimento/${s.cicloId}`} onClick={aoAbrir} className="text-ui text-brand hover:underline">
                Ver a conversa
              </Link>
            )}
          </div>
        </>
      ) : x.podeAssumir ? (
        <>
          <p className="text-ui text-fg-secondary">A conversa está aberta ({x.onde}), sem ninguém atendendo.</p>
          <Button size="sm" className="self-start" loading={ocupado} onClick={comecar}>
            Assumir e abrir
          </Button>
        </>
      ) : (
        <p className="text-ui text-fg-secondary">
          A conversa está aberta ({x.onde}), sem ninguém atendendo. Peça à triagem para encaminhar para o seu setor.
        </p>
      )}
      {erro && <p className="text-micro text-danger">{erro}</p>}
    </li>
  );
}
