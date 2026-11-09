"use client";

import { useEffect, useState } from "react";
import { Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Deslizante } from "@/components/ui/Deslizante";
import { IconButton } from "@/components/ui/IconButton";
import { Radio, RadioGroup } from "@/components/ui/RadioGroup";
import { Switch } from "@/components/ui/Switch";
import {
  ICONE_DO_AVISO,
  assinarPush,
  cancelarPush,
  registroDoConnect,
  temAvisoNoComputador,
  temPush,
  type AssinaturaDePush,
} from "@/lib/notificacoes/pushDoNavegador";
import {
  PREFERENCIAS_PADRAO,
  SONS,
  gravarPreferenciasNoNavegador,
  lerPreferenciasDoNavegador,
  tocarSom,
  type ChaveDoSom,
  type PreferenciasDeSom,
} from "@/lib/notificacoes/som";

// O som e o aviso no computador (09/11/2026), na tela de Notificações: a
// pessoa liga o som, escolhe entre cinco, ouve e ajusta o volume; e liga o
// aviso do computador (o do Windows/navegador), que aparece como o de um
// programa instalado.
//
// Vale para este navegador (ver `lib/notificacoes/som.ts`). O "Aviso neste
// aparelho" é o interruptor que morava em Configurações (sua conta) e veio
// para cá: com as chaves de push no ambiente, ligar também assina o push, e o
// aviso chega com o Connect fechado (no computador e no celular); sem elas,
// chega com o Connect aberto em alguma aba.

type Permissao = "carregando" | "sem_suporte" | NotificationPermission;

export type AcoesDePush = {
  salvar: (sub: AssinaturaDePush) => Promise<{ error: string } | null>;
  remover: (endpoint: string) => Promise<void>;
};

export function SomEAvisoNoComputador({ publicKey, acoes }: { publicKey: string | null; acoes: AcoesDePush }) {
  const [prefs, setPrefs] = useState<PreferenciasDeSom>(PREFERENCIAS_PADRAO);
  const [permissao, setPermissao] = useState<Permissao>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O que está guardado neste navegador só existe depois de montar.
  useEffect(() => {
    let cancelado = false;
    async function ler() {
      const guardadas = lerPreferenciasDoNavegador();
      const atual: Permissao = temAvisoNoComputador() ? Notification.permission : "sem_suporte";
      await Promise.resolve();
      if (cancelado) return;
      setPrefs(guardadas);
      setPermissao(atual);
    }
    void ler();
    return () => {
      cancelado = true;
    };
  }, []);

  function mudar(parcial: Partial<PreferenciasDeSom>) {
    setPrefs(gravarPreferenciasNoNavegador(parcial));
  }

  function escolherSom(som: ChaveDoSom) {
    mudar({ som });
    void tocarSom(som, prefs.volume);
  }

  async function ligarNoComputador() {
    setErro(null);
    setOcupado(true);
    try {
      const resposta = await Notification.requestPermission();
      setPermissao(resposta);
      if (resposta !== "granted") return;
      mudar({ noComputador: true });
      if (publicKey && temPush()) {
        const r = await acoes.salvar(await assinarPush(publicKey));
        if (r?.error) setErro(r.error);
      } else {
        await registroDoConnect();
      }
    } catch {
      setErro("Não deu para ligar o aviso com o Connect fechado. Com o Connect aberto, ele aparece.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligarNoComputador() {
    setErro(null);
    setOcupado(true);
    mudar({ noComputador: false });
    try {
      const endpoint = await cancelarPush();
      if (endpoint) await acoes.remover(endpoint);
    } catch {
      setErro("Não deu para desligar por completo. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setErro(null);
    void tocarSom(prefs.som, prefs.volume);
    if (!noComputador) return;
    try {
      const registro = await registroDoConnect();
      await registro.showNotification("Connect", {
        body: "É assim que o aviso aparece neste aparelho.",
        icon: ICONE_DO_AVISO,
        badge: ICONE_DO_AVISO,
        tag: "connect:teste",
        data: { url: "/notificacoes" },
        silent: true,
      });
    } catch {
      setErro("O navegador não deixou mostrar o aviso.");
    }
  }

  const noComputador = permissao === "granted" && prefs.noComputador;
  const comSom = prefs.ligado;

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex flex-col gap-2.5">
        <Switch checked={comSom} onCheckedChange={(ligado) => mudar({ ligado })} rotulo="Som ao chegar notificação" />
        {comSom && (
          <>
            <RadioGroup<ChaveDoSom> valor={prefs.som} onChange={escolherSom} variante="linha" aria-label="Som da notificação" classeDasOpcoes="flex flex-col">
              {SONS.map((s) => (
                <div key={s.chave} className="flex h-8 items-center justify-between gap-2">
                  <Radio valor={s.chave} rotulo={s.rotulo} />
                  <IconButton size="sm" title={`Ouvir ${s.rotulo}`} onClick={() => void tocarSom(s.chave, prefs.volume)}>
                    <Play size={13} />
                  </IconButton>
                </div>
              ))}
            </RadioGroup>
            <div className="flex items-center gap-2.5">
              <Volume2 size={15} className="flex-shrink-0 text-fg-muted" aria-hidden />
              <Deslizante
                value={prefs.volume}
                min={0}
                max={100}
                step={5}
                aria-label="Volume do som"
                className="min-w-0 flex-1"
                onChange={(e) => mudar({ volume: Number(e.target.value) })}
                // Ao soltar, toca no volume novo: é ouvindo que se acerta.
                onPointerUp={(e) => void tocarSom(prefs.som, Number(e.currentTarget.value))}
                onKeyUp={(e) => void tocarSom(prefs.som, Number(e.currentTarget.value))}
              />
              <span className="w-9 flex-shrink-0 text-right text-fs-2 tabular-nums text-fg-muted">{prefs.volume}%</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <Switch
          checked={noComputador}
          disabled={ocupado || permissao === "carregando" || permissao === "sem_suporte" || permissao === "denied"}
          onCheckedChange={(ligado) => void (ligado ? ligarNoComputador() : desligarNoComputador())}
          rotulo="Aviso neste aparelho"
        />
        <p className="text-fs-2 leading-snug text-fg-muted">
          {permissao === "sem_suporte"
            ? "Este navegador não mostra avisos fora da página."
            : permissao === "denied"
              ? "Bloqueado neste navegador. Libere as notificações no cadeado ao lado do endereço e recarregue a página."
              : noComputador
                ? publicKey
                  ? "Aparece no canto da tela do computador (ou nas notificações do celular), como um programa instalado, mesmo com o Connect fechado."
                  : "Aparece no canto da tela do computador, como um programa instalado, com o Connect aberto em alguma aba."
                : "Mostra a notificação no canto da tela do computador (ou nas notificações do celular), como um programa instalado."}
        </p>
        {erro && <p className="text-helper font-medium text-danger">{erro}</p>}
      </div>

      {(comSom || noComputador) && (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => void testar()}>
          Testar
        </Button>
      )}
      <p className="text-fs-2 leading-snug text-fg-muted">Som e aviso valem para este navegador.</p>
    </div>
  );
}
