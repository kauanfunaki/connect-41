"use client";

// "Vamos conhecer a empresa" — o bloco `company` do workspace do Connect
// Tributário: nome, CNPJ, atividade, regime atual, UF/município, período e
// como os valores serão usados. Trocar a atividade ajusta anexo e presunções,
// como no original.

import { Building2 } from "lucide-react";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Study } from "@/lib/tributario/avaliacao/model";
import { NOTA, ROTULO, TITULO_DA_SECAO } from "../estilos";

export const ROTULOS_DA_ATIVIDADE: Record<Study["activity"], string> = {
  services: "Serviços",
  commerce: "Comércio",
  industry: "Indústria",
  mixed: "Atividades mistas",
};

export function DadosDaEmpresa({ estudo, patch }: { estudo: Study; patch: (p: Partial<Study>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ROTULO}>Contexto da avaliação</p>
          <h2 className={TITULO_DA_SECAO}>Vamos conhecer a empresa</h2>
        </div>
        <Building2 size={24} className="text-fg-muted" aria-hidden />
      </div>
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
        <CampoForm label="Nome da empresa" htmlFor="avaliacao-nome" className="sm:col-span-2 lg:col-span-3">
          <Input id="avaliacao-nome" value={estudo.name} maxLength={160} onChange={(e) => patch({ name: e.target.value })} />
        </CampoForm>
        <CampoForm label="CNPJ" htmlFor="avaliacao-cnpj">
          <Input
            id="avaliacao-cnpj"
            inputMode="numeric"
            maxLength={18}
            value={estudo.cnpj}
            placeholder="Somente números"
            onChange={(e) => patch({ cnpj: e.target.value.replace(/\D/g, "") })}
          />
        </CampoForm>
        <CampoForm label="Atividade" htmlFor="avaliacao-atividade">
          <Select
            id="avaliacao-atividade"
            value={estudo.activity}
            onChange={(e) => {
              const activity = e.target.value as Study["activity"];
              const comercioOuIndustria = activity === "commerce" || activity === "industry";
              patch({
                activity,
                base: {
                  ...estudo.base,
                  annex: activity === "commerce" ? "I" : activity === "industry" ? "II" : "III",
                  presIR: comercioOuIndustria ? 8 : 32,
                  presCS: comercioOuIndustria ? 12 : 32,
                },
                assumptionsReviewed: false,
              });
            }}
          >
            {Object.entries(ROTULOS_DA_ATIVIDADE).map(([v, t]) => (
              <option value={v} key={v}>
                {t}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Regime atual" htmlFor="avaliacao-regime">
          <Select
            id="avaliacao-regime"
            value={estudo.currentRegime}
            onChange={(e) => patch({ currentRegime: e.target.value as Study["currentRegime"] })}
          >
            <option value="unknown">A informar</option>
            <option value="simple">Simples Nacional</option>
            <option value="presumed">Lucro Presumido</option>
            <option value="real">Lucro Real</option>
          </Select>
        </CampoForm>
        <CampoForm label="UF" htmlFor="avaliacao-uf">
          <Input
            id="avaliacao-uf"
            maxLength={2}
            value={estudo.uf}
            placeholder="UF"
            onChange={(e) => patch({ uf: e.target.value.toUpperCase() })}
          />
        </CampoForm>
        <CampoForm label="Município" htmlFor="avaliacao-municipio">
          <Input id="avaliacao-municipio" value={estudo.city} placeholder="Município" onChange={(e) => patch({ city: e.target.value })} />
        </CampoForm>
        <CampoForm label="Início do período" htmlFor="avaliacao-inicio">
          <CampoData id="avaliacao-inicio" value={estudo.start} onChange={(v) => patch({ start: v })} />
        </CampoForm>
        <CampoForm label="Fim do período" htmlFor="avaliacao-fim">
          <CampoData id="avaliacao-fim" value={estudo.end} onChange={(v) => patch({ end: v })} />
        </CampoForm>
        <CampoForm label="Como os valores serão usados?" htmlFor="avaliacao-uso" className="sm:col-span-2 lg:col-span-1">
          <Select
            id="avaliacao-uso"
            value={estudo.periodMode}
            onChange={(e) => patch({ periodMode: e.target.value as Study["periodMode"] })}
          >
            <option value="actual">Totais realizados do período</option>
            <option value="monthly-projection">Média mensal para projetar 12 meses</option>
          </Select>
        </CampoForm>
      </FieldGrid>
      {estudo.periodMode === "monthly-projection" && (
        <p className={NOTA}>
          Selecione um único mês de referência. Receitas, custos e despesas informados serão multiplicados por 12. RBT12, FS12 e
          posições patrimoniais mantêm seus valores próprios. A projeção será identificada no relatório.
        </p>
      )}
    </div>
  );
}
