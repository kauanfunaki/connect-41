"use client";

import { useState } from "react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";
import { AJUSTES_DO_DIA, FREQUENCIAS, MAXIMO_DE_OCORRENCIAS, type Frequencia } from "@/lib/financeiro/repeticao";

/** "Todo mês · 12 vezes", ou "Não repete". */
export function resumoDaRepeticao(frequencia: string, vezes: string): string {
  const f = FREQUENCIAS.find((x) => x.valor === frequencia);
  if (!f) return "Não repete";
  const n = Number(vezes);
  return Number.isInteger(n) && n >= 2 ? `${f.rotulo} · ${n} vezes` : f.rotulo;
}

/**
 * "Repetir" no lançamento manual (lote D, a "repetição" do Omie): aluguel,
 * folha, pró-labore, mensalidade. Escolhida a frequência, o lançamento nasce
 * com as próximas ocorrências, de uma vez — cada uma é uma conta comum, ligada
 * às outras pela série ("3/12"). Num bloco que começa fechado (a regra do
 * Kauan, 08/10), com o resumo na linha.
 *
 * Os campos vão no formulário do lançamento (`repetirFrequencia`,
 * `repetirVezes`, `repetirAjuste`); quem valida é `validarRepeticao`, no
 * servidor. O formulário remonta este bloco depois de lançar, e ele volta a
 * "Não repete".
 */
export function CamposDaRepeticao({ className = "" }: { className?: string }) {
  const [frequencia, setFrequencia] = useState<Frequencia | "">("");
  const [vezes, setVezes] = useState("12");
  const [ajuste, setAjuste] = useState("ADIAR");
  const repete = frequencia !== "";

  return (
    <BlocoRecolhivel titulo="Repetir" resumo={resumoDaRepeticao(frequencia, vezes)} className={`bg-surface ${className}`.trim()}>
      <div className="flex flex-col gap-3 pt-1">
        <FieldGrid columns="sm:grid-cols-3">
          <CampoForm label="Frequência" htmlFor="lancamento-repetir-frequencia">
            <Select
              id="lancamento-repetir-frequencia"
              name="repetirFrequencia"
              value={frequencia}
              onChange={(e) => setFrequencia(e.target.value as Frequencia | "")}
            >
              <option value="">Não repete</option>
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Quantas vezes" htmlFor="lancamento-repetir-vezes" helper="Contando esta.">
            <CampoNumero
              id="lancamento-repetir-vezes"
              name="repetirVezes"
              min={2}
              max={MAXIMO_DE_OCORRENCIAS}
              value={vezes}
              onChange={(e) => setVezes(e.target.value)}
              disabled={!repete}
            />
          </CampoForm>
          <CampoForm label="Em fim de semana ou feriado" htmlFor="lancamento-repetir-ajuste">
            <Select
              id="lancamento-repetir-ajuste"
              name="repetirAjuste"
              value={ajuste}
              onChange={(e) => setAjuste(e.target.value)}
              disabled={!repete}
            >
              {AJUSTES_DO_DIA.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
        </FieldGrid>
        <p className="text-helper text-fg-muted">
          {repete
            ? "As próximas nascem agora, em aberto, com o mesmo valor, contraparte e categoria. Cada uma se edita, paga e cancela sozinha; a competência anda com o mês do vencimento, e os feriados são os de Configurações › Feriados."
            : "Para aluguel, folha, pró-labore e mensalidades: escolha a frequência, e as próximas contas nascem junto com esta."}
        </p>
      </div>
    </BlocoRecolhivel>
  );
}
