"use client";

import { useState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { CampoMes } from "@/components/ui/CampoMes";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormularioDoDp2, type AcaoDoDp2 } from "./Formulario";

type Tipo = "INSS" | "IRRF" | "SALARIO_MINIMO" | "SALARIO_FAMILIA";

/**
 * Gravar uma versão de tabela oficial pelo escritório (11/11/2026): só os
 * campos do tipo escolhido aparecem. As faixas vão uma por linha.
 */
export function FormularioDeTabela({ acao }: { acao: AcaoDoDp2 }) {
  const [tipo, setTipo] = useState<Tipo>("INSS");
  return (
    <FormularioDoDp2 acao={acao} rotulo="Gravar tabela">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoForm label="Tabela" htmlFor="tipo">
          <Select id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option value="INSS">INSS do empregado</option>
            <option value="IRRF">IRRF mensal</option>
            <option value="SALARIO_MINIMO">Salário mínimo</option>
            <option value="SALARIO_FAMILIA">Salário-família</option>
          </Select>
        </CampoForm>
        <CampoForm label="Vale a partir de" htmlFor="vigencia" required>
          <CampoMes id="vigencia" name="vigencia" required />
        </CampoForm>
      </div>

      {(tipo === "INSS" || tipo === "IRRF") && (
        <CampoForm
          label="Faixas"
          htmlFor="faixas"
          className="mt-4"
          helper={
            tipo === "INSS"
              ? "Uma por linha: limite da faixa; alíquota. A última é o teto. Ex.: 1.621,00; 7,5"
              : "Uma por linha: limite; alíquota; parcela a deduzir. Na última, deixe o limite vazio. Ex.: ; 27,5; 908,73"
          }
        >
          <Textarea id="faixas" name="faixas" rows={5} className="font-mono" />
        </CampoForm>
      )}

      {tipo === "IRRF" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mt-4">
            <CampoForm label="Dedução por dependente" htmlFor="deducaoDependente">
              <Input id="deducaoDependente" name="deducaoDependente" inputMode="decimal" prefix="R$" defaultValue="189,59" />
            </CampoForm>
            <CampoForm label="Desconto simplificado" htmlFor="descontoSimplificado">
              <Input id="descontoSimplificado" name="descontoSimplificado" inputMode="decimal" prefix="R$" defaultValue="607,20" />
            </CampoForm>
            <CampoForm label="Mínimo para reter" htmlFor="minimoRetencao">
              <Input id="minimoRetencao" name="minimoRetencao" inputMode="decimal" prefix="R$" defaultValue="10,00" />
            </CampoForm>
          </div>
          <p className="text-fs-2 text-fg-muted mt-4">Redução da Lei 15.270 (deixe vazio se a tabela não tiver):</p>
          <div className="grid gap-4 sm:grid-cols-5 mt-2">
            <CampoForm label="Isento até" htmlFor="reducaoIsentoAte">
              <Input id="reducaoIsentoAte" name="reducaoIsentoAte" inputMode="decimal" placeholder="5.000,00" />
            </CampoForm>
            <CampoForm label="Redução máxima" htmlFor="reducaoMaxima">
              <Input id="reducaoMaxima" name="reducaoMaxima" inputMode="decimal" placeholder="312,89" />
            </CampoForm>
            <CampoForm label="Reduz até" htmlFor="reducaoAte">
              <Input id="reducaoAte" name="reducaoAte" inputMode="decimal" placeholder="7.350,00" />
            </CampoForm>
            <CampoForm label="Constante" htmlFor="reducaoConstante">
              <Input id="reducaoConstante" name="reducaoConstante" inputMode="decimal" placeholder="978,62" />
            </CampoForm>
            <CampoForm label="Fator" htmlFor="reducaoFator">
              <Input id="reducaoFator" name="reducaoFator" inputMode="decimal" placeholder="0,133145" />
            </CampoForm>
          </div>
          <div className="mt-3">
            <Checkbox id="reducaoNoDecimo" name="reducaoNoDecimo" label="A redução vale também para o 13º" />
          </div>
        </>
      )}

      {tipo === "SALARIO_MINIMO" && (
        <CampoForm label="Valor" htmlFor="valor" className="mt-4">
          <Input id="valor" name="valor" inputMode="decimal" prefix="R$" />
        </CampoForm>
      )}

      {tipo === "SALARIO_FAMILIA" && (
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <CampoForm label="Remuneração até" htmlFor="limite">
            <Input id="limite" name="limite" inputMode="decimal" prefix="R$" />
          </CampoForm>
          <CampoForm label="Cota por filho" htmlFor="cota">
            <Input id="cota" name="cota" inputMode="decimal" prefix="R$" />
          </CampoForm>
        </div>
      )}

      <CampoForm label="Fundamento" htmlFor="observacao" className="mt-4" helper="A portaria ou a lei, para quem conferir depois.">
        <Input id="observacao" name="observacao" maxLength={500} />
      </CampoForm>
    </FormularioDoDp2>
  );
}
