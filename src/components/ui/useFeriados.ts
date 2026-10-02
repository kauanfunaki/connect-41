"use client";

import { useEffect, useState } from "react";

// Os feriados do escritório para o calendário marcar. Uma busca por página
// (o resultado fica neste módulo até recarregar — trocar de escritório recarrega),
// e só quando o primeiro calendário abre: a maioria das telas nunca abre um.
// Sem sessão (portal, página pública) ou com erro, fica sem feriado e o
// calendário funciona igual.

const VAZIO: ReadonlyMap<string, string> = new Map();
let busca: Promise<ReadonlyMap<string, string>> | null = null;

function buscar(): Promise<ReadonlyMap<string, string>> {
  busca ??= fetch("/api/feriados")
    .then((r) => (r.ok ? r.json() : { feriados: [] }))
    .then((j: { feriados?: { data: string; nome: string }[] }) => new Map((j.feriados ?? []).map((f) => [f.data, f.nome])))
    .catch(() => {
      busca = null; // tenta de novo na próxima abertura
      return VAZIO;
    });
  return busca;
}

/** "AAAA-MM-DD" → nome do feriado. */
export function useFeriados(): ReadonlyMap<string, string> {
  const [feriados, setFeriados] = useState(VAZIO);
  useEffect(() => {
    let vivo = true;
    buscar().then((m) => {
      if (vivo) setFeriados(m);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return feriados;
}
