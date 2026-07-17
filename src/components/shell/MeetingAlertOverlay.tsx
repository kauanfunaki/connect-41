"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Video, Clock, Building2, Users, ExternalLink } from "lucide-react";
import {
  buscarAlertasReuniao,
  confirmarCienciaReuniao,
  type MeetingAlert,
} from "@/app/(app)/agenda/alert-actions";

const POLL_INTERVAL_MS = 45 * 1000;

// Bloco focal de reunião próxima: overlay centralizado com fundo fosco que só
// sai da frente quando o participante dá o "OK, estou ciente" — não é um toast
// escondido num canto. Enquanto houver alerta pendente e a guia estiver em
// segundo plano, o título da aba pisca e um beep toca pra puxar o usuário de
// volta pro Connect.
export function MeetingAlertOverlay() {
  const [alerts, setAlerts] = useState<MeetingAlert[]>([]);
  // Momento da última busca — base pura pro cálculo de "faltam N min" na
  // renderização (Date.now() direto no render é impuro pro compilador React).
  const [fetchedAt, setFetchedAt] = useState(0);
  const [pending, startTransition] = useTransition();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await buscarAlertasReuniao();
      setAlerts(next);
      setFetchedAt(Date.now());
    } catch {
      // erro de rede transitório — tenta de novo no próximo ciclo
    }
  }, []);

  // Polling + refresh imediato quando a aba volta a ficar visível.
  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Navegadores só liberam áudio depois de um gesto do usuário — cria/destrava
  // o AudioContext na primeira interação, pra o beep funcionar quando precisar.
  useEffect(() => {
    function unlock() {
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new AudioContext();
        } catch {
          return;
        }
      }
      audioCtxRef.current.resume().catch(() => {});
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    }
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const beep = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== "running") return;
    try {
      // Dois toques curtos (dó-mi) — chama atenção sem ser um alarme.
      [0, 0.25].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 523.25 : 659.25;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } catch {
      // sem áudio disponível — o aviso visual continua
    }
  }, []);

  // Aviso na guia (título piscando + som) enquanto houver alerta e a aba não
  // estiver em foco — pra quem está em outra guia perceber e abrir o Connect.
  useEffect(() => {
    if (alerts.length === 0) return;

    if (originalTitleRef.current === null) originalTitleRef.current = document.title;
    const original = originalTitleRef.current;
    let flip = false;

    function tick() {
      if (document.visibilityState === "hidden") {
        flip = !flip;
        document.title = flip ? `🔔 Reunião às ${alerts[0].startTimeLabel} — Connect` : original;
      } else {
        document.title = original;
      }
    }

    if (document.visibilityState === "hidden") beep();
    const soundInterval = setInterval(() => {
      if (document.visibilityState === "hidden") beep();
    }, POLL_INTERVAL_MS);
    const titleInterval = setInterval(tick, 1200);

    return () => {
      clearInterval(titleInterval);
      clearInterval(soundInterval);
      document.title = original;
    };
  }, [alerts, beep]);

  if (alerts.length === 0) return null;

  const alert = alerts[0];

  function handleOk() {
    startTransition(async () => {
      await confirmarCienciaReuniao(alert.meetingId);
      setAlerts((prev) => prev.filter((a) => a.meetingId !== alert.meetingId));
    });
  }

  const startsInMin = Math.max(0, Math.round((new Date(alert.startAtIso).getTime() - fetchedAt) / 60000));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="meeting-alert-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-xl bg-brand-subtle border border-brand/20 flex items-center justify-center text-brand flex-shrink-0">
            <Video size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-brand uppercase tracking-wider">
              {startsInMin > 0 ? `Reunião em ${startsInMin} min` : "Reunião em andamento"}
            </p>
            <h2 id="meeting-alert-title" className="text-[16px] font-display font-semibold text-fg truncate">
              {alert.title}
            </h2>
          </div>
        </div>

        <div className="space-y-2 mb-5">
          <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
            <Clock size={14} className="text-fg-muted flex-shrink-0" />
            {alert.startTimeLabel} – {alert.endTimeLabel} · {alert.provider}
          </p>
          {alert.companyName && (
            <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
              <Building2 size={14} className="text-fg-muted flex-shrink-0" />
              {alert.companyName}
            </p>
          )}
          {(alert.clientName || alert.sectorLabel) && (
            <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
              <Users size={14} className="text-fg-muted flex-shrink-0" />
              {[alert.clientName, alert.sectorLabel].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOk}
            disabled={pending}
            className="flex-1 h-10 rounded-[10px] bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {pending ? "Registrando…" : "OK, estou ciente"}
          </button>
          <a
            href={alert.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] border border-border-strong text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
          >
            Entrar <ExternalLink size={13} />
          </a>
        </div>

        {alerts.length > 1 && (
          <p className="text-[12px] text-fg-muted mt-3 text-center">
            +{alerts.length - 1} outra{alerts.length > 2 ? "s" : ""} reunião{alerts.length > 2 ? "ões" : ""} próxima{alerts.length > 2 ? "s" : ""} aguardando ciência
          </p>
        )}
      </div>
    </div>
  );
}
