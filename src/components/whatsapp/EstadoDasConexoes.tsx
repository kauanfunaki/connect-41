"use client";

import { CheckCircle2, AlertTriangle, ChevronDown, Plug, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Contador } from "@/components/ui/Contador";
import { Popover } from "@/components/ui/Popover";
import { formatInstantDateTime } from "@/lib/format";
import type { ConexaoNaTela } from "@/lib/whatsapp/data";
import { PESO_DO_NIVEL, TITULO_SEM_RESPOSTA, type NivelDeSaude } from "@/lib/whatsapp/saude";

const ESTILO: Record<NivelDeSaude, { icone: typeof CheckCircle2; cor: string }> = {
  ok: { icone: CheckCircle2, cor: "text-success-fg" },
  atencao: { icone: AlertTriangle, cor: "text-warning-fg" },
  problema: { icone: XCircle, cor: "text-danger" },
};

/**
 * O estado de cada número, no topo das conversas.
 *
 * Fica nesta tela, e não numa de configuração, porque quem precisa saber que o
 * número caiu é quem está atendendo. Desde 14/10/2026 é um botão de uma linha
 * ao lado do título — o veredito mais grave e, quando são conversas paradas, o
 * número delas —, com os detalhes num painel que abre no clique: os cartões de
 * antes ("Candidatos sem resposta" e companhia) empurravam a conversa para
 * baixo, e o Kauan tinha de rolar a página para ler o chat.
 */
export function EstadoDasConexoes({ conexoes, podeConfigurar }: { conexoes: ConexaoNaTela[]; podeConfigurar: boolean }) {
  if (conexoes.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ui text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <Plug size={14} aria-hidden /> Nenhum número de WhatsApp conectado
        </span>
        {/* Botão, e não link de texto (30/09): é a ação de conectar. */}
        {podeConfigurar && (
          <Button href="/admin/integracoes" variant="secondary" size="sm">
            Conectar em Integrações
          </Button>
        )}
      </div>
    );
  }

  // O mais grave manda no botão; empate fica com o primeiro (a ordem de cadastro).
  const pior = conexoes.reduce((a, c) => (PESO_DO_NIVEL[c.saude.nivel] > PESO_DO_NIVEL[a.saude.nivel] ? c : a));
  const estilo = ESTILO[pior.saude.nivel];
  const Icone = estilo.icone;
  const paradas = pior.saude.titulo === TITULO_SEM_RESPOSTA ? conexoes.reduce((s, c) => s + c.esperandoRobo, 0) : 0;

  return (
    <Popover
      align="right"
      width={380}
      aria-label="Estado dos números de WhatsApp"
      trigger={({ open, toggle }) => (
        <Button
          type="button"
          variant={pior.saude.nivel === "problema" ? "danger" : "secondary"}
          size="sm"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Ver o estado dos números"
        >
          <Icone size={14} aria-hidden className={estilo.cor} />
          {pior.saude.titulo}
          {paradas > 0 && <Contador valor={paradas} tom="atencao" />}
          {conexoes.length > 1 && <span className="font-normal text-fg-muted">· {conexoes.length} números</span>}
          <ChevronDown size={13} aria-hidden className={`text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      )}
    >
      <ul className="flex flex-col gap-3">
        {conexoes.map((c) => {
          const e = ESTILO[c.saude.nivel];
          const I = e.icone;
          return (
            <li key={c.id} className="flex items-start gap-2 min-w-0">
              <I size={16} aria-hidden className={`${e.cor} mt-0.5 shrink-0`} />
              <div className="min-w-0">
                <p className="text-ui font-medium text-fg">
                  {c.saude.titulo}
                  <span className="font-normal text-fg-muted">
                    {" · "}
                    {c.rotulo}
                    {c.instancia && ` · ${c.instancia}`}
                  </span>
                </p>
                {c.saude.motivos.map((motivo) => (
                  <p key={motivo} className="text-fs-2 text-fg-secondary mt-0.5 break-words">
                    {motivo}
                  </p>
                ))}
                <p className="text-micro text-fg-muted mt-1">
                  {c.ultimaEntradaEm ? `Última mensagem recebida: ${formatInstantDateTime(c.ultimaEntradaEm)}` : "Nenhuma mensagem recebida ainda"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
