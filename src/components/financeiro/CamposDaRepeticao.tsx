"use client";

import { useState } from "react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";
import { AJUSTES_DO_DIA, FINS_DA_SERIE, FREQUENCIAS, MAXIMO_DE_OCORRENCIAS, type FimDaSerie, type Frequencia } from "@/lib/financeiro/repeticao";

/** "Todo mês · 12 vezes", "Todo mês · até 10/06/2027", "Todo mês · sem fim", ou "Não repete". */
export function resumoDaRepeticao(frequencia: string, vezes: string, fim: FimDaSerie["tipo"] = "VEZES", ate = ""): string {
  const f = FREQUENCIAS.find((x) => x.valor === frequencia);
  if (!f) return "Não repete";
  if (fim === "SEM_FIM") return `${f.rotulo} · sem fim`;
  if (fim === "ATE") return /^\d{4}-\d{2}-\d{2}$/.test(ate) ? `${f.rotulo} · até ${ate.slice(8, 10)}/${ate.slice(5, 7)}/${ate.slice(0, 4)}` : f.rotulo;
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
 * O fim da série (21/10): depois de algumas vezes, até uma data ou sem data
 * de fim — essas duas nascem até o horizonte, e as próximas vêm com o tempo.
 *
 * Os campos vão no formulário do lançamento (`repetirFrequencia`,
 * `repetirFim`, `repetirVezes`, `repetirAte`, `repetirAjuste`); quem valida é
 * `validarRepeticao`, no servidor. O formulário remonta este bloco depois de lançar, e ele volta a
 * "Não repete".
 */
export function CamposDaRepeticao({ className = "" }: { className?: string }) {
  const [frequencia, setFrequencia] = useState<Frequencia | "">("");
  const [fim, setFim] = useState<FimDaSerie["tipo"]>("VEZES");
  const [vezes, setVezes] = useState("12");
  const [ate, setAte] = useState("");
  const [ajuste, setAjuste] = useState("ADIAR");
  const repete = frequencia !== "";
  // O todo dia útil já pula fim de semana e feriado: o ajuste não se aplica.
  const diaria = frequencia === "DIARIA";

  return (
    <BlocoRecolhivel titulo="Repetir" resumo={resumoDaRepeticao(frequencia, vezes, fim, ate)} className={`bg-surface ${className}`.trim()}>
      <div className="flex flex-col gap-3 pt-1">
        <FieldGrid columns="sm:grid-cols-2">
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
          <CampoForm label="Termina" htmlFor="lancamento-repetir-fim">
            <Select
              id="lancamento-repetir-fim"
              name="repetirFim"
              value={fim}
              onChange={(e) => setFim(e.target.value as FimDaSerie["tipo"])}
              disabled={!repete}
            >
              {FINS_DA_SERIE.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
          {fim === "VEZES" ? (
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
          ) : fim === "ATE" ? (
            <CampoForm label="Até" htmlFor="lancamento-repetir-ate" helper="O último vencimento da série.">
              <CampoData id="lancamento-repetir-ate" name="repetirAte" value={ate} onChange={setAte} disabled={!repete} required={repete} />
            </CampoForm>
          ) : (
            <div />
          )}
          <CampoForm label="Em fim de semana ou feriado" htmlFor="lancamento-repetir-ajuste">
            <Select
              id="lancamento-repetir-ajuste"
              name="repetirAjuste"
              value={ajuste}
              onChange={(e) => setAjuste(e.target.value)}
              disabled={!repete || diaria}
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
          {repete && fim !== "VEZES"
            ? "As contas do próximo ano nascem agora (dois meses no todo dia útil); as seguintes nascem sozinhas conforme o tempo anda, copiando a última conta da série — o que você mudar numa conta vale para as que vierem depois. Cada uma se edita, paga e cancela sozinha, e \"Cancelar › Esta e as próximas\" encerra a série."
            : repete
            ? "As próximas nascem agora, em aberto, com o mesmo valor, contraparte e categoria. Cada uma se edita, paga e cancela sozinha; a competência anda com o mês do vencimento, e os feriados são os de Configurações › Feriados."
            : "Para aluguel, folha, pró-labore e mensalidades: escolha a frequência, e as próximas contas nascem junto com esta."}
        </p>
      </div>
    </BlocoRecolhivel>
  );
}
