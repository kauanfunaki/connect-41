"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { CaixaDeConversas, PainelVazio } from "@/components/conversas/caixa/Caixa";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { ContextoDaCaixaDoWhatsapp, useCaixaDoWhatsapp, type DadosDaCaixa } from "@/components/whatsapp/contextoDaCaixa";
import { filtrarConversas, situacaoDaConversa } from "@/lib/whatsapp/conversas";
import { ATUALIZAR_A_CADA_MS, buscarConversas, horaDeAtualizar, recorteDaUrl } from "@/lib/whatsapp/caixa";

/**
 * A caixa do WhatsApp do Recrutamento, no layout de /whatsapp (14/10/2026).
 *
 * O layout não remonta ao trocar de conversa — só o painel da direita (a
 * página) muda. Então a lista guarda a rolagem, a busca, a aba e a seleção, e
 * não aparece esqueleto de tela inteira. A conversa aberta vem da URL
 * (`/whatsapp/[id]`, que continua valendo para link direto, voltar e F5), e o
 * recorte também (`?ver=`), mas trocar de aba não vai ao servidor: a lista já
 * está aqui inteira, e só a URL muda (`history.pushState`, que o Next
 * acompanha).
 */
export function CaixaDoWhatsapp({ dados, cabecalho, children }: { dados: DadosDaCaixa; cabecalho: ReactNode; children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const abertaId = typeof params.id === "string" ? params.id : null;
  const recorte = recorteDaUrl(useSearchParams().get("ver") ?? undefined);
  const [busca, setBusca] = useState("");

  const doRecorte = useMemo(() => filtrarConversas(dados.conversas, recorte, dados.userId), [dados.conversas, recorte, dados.userId]);
  const visiveis = useMemo(() => buscarConversas(doRecorte, busca), [doRecorte, busca]);
  const valor = useMemo(
    () => ({ ...dados, recorte, doRecorte, busca, setBusca, visiveis, abertaId }),
    [dados, recorte, doRecorte, busca, visiveis, abertaId]
  );

  useAtualizacaoPeriodica();

  return (
    <ContextoDaCaixaDoWhatsapp.Provider value={valor}>
      {/* No celular, com a conversa aberta, o título sai: a conversa fica com a tela. */}
      <div className={abertaId ? "hidden lg:block" : undefined}>{cabecalho}</div>
      <CaixaDeConversas aberta={!!abertaId} lista={<ConversasLista />} painel={children} />
    </ContextoDaCaixaDoWhatsapp.Provider>
  );
}

/**
 * Busca de novo o que chegou, de tempos em tempos, com a aba à vista. Antes,
 * cada conversa aberta recarregava a tela inteira, e a lista vinha nova junto;
 * parada no layout, ela envelheceria até alguma ação ou um F5. O
 * `router.refresh()` não remonta nada: a lista, o rascunho da resposta e a
 * rolagem ficam, e só os dados trocam.
 */
function useAtualizacaoPeriodica() {
  const router = useRouter();
  useEffect(() => {
    let ultimaEm = Date.now();
    function talvezAtualizar() {
      const agora = Date.now();
      if (!horaDeAtualizar(ultimaEm, agora, document.visibilityState === "visible")) return;
      ultimaEm = agora;
      router.refresh();
    }
    const intervalo = window.setInterval(talvezAtualizar, ATUALIZAR_A_CADA_MS / 3);
    // Voltou para a aba depois de um tempo: busca na hora, sem esperar a volta do relógio.
    document.addEventListener("visibilitychange", talvezAtualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", talvezAtualizar);
    };
  }, [router]);
}

/** O painel sem conversa escolhida (só no computador; no celular a lista ocupa a tela). */
export function PainelSemConversa() {
  const { conversas, agora } = useCaixaDoWhatsapp();
  const precisam = conversas.filter((c) => situacaoDaConversa(c, agora) === "precisa_atencao").length;
  return (
    <PainelVazio
      icone={<MessagesSquare />}
      titulo="Escolha uma conversa"
      texto={
        precisam > 0
          ? `${precisam === 1 ? "1 conversa precisa" : `${precisam} conversas precisam`} de alguém. Use ↑↓ no painel para passar de uma para outra.`
          : "Ninguém esperando agora. Abra uma conversa à esquerda para ver as mensagens e responder."
      }
    />
  );
}
