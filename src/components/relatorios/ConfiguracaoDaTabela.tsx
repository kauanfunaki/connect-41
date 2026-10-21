"use client";

import { useId, useState } from "react";
import { Select } from "@/components/ui/Select";
import { CampoMes } from "@/components/ui/CampoMes";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DIMENSOES, MEDIDAS, ROTULO_DA_BASE, BASES, type Base, type Configuracao, type Dimensao, type Medida } from "@/lib/relatorios/tabelaDinamica";

const ROTULO = "text-micro font-medium uppercase tracking-wide text-fg-muted";

const dimensoesDa = (base: Base) => (Object.keys(DIMENSOES) as Dimensao[]).filter((d) => DIMENSOES[d].bases.includes(base));
const medidasDa = (base: Base) => (Object.keys(MEDIDAS) as Medida[]).filter((m) => MEDIDAS[m].bases.includes(base));

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}

/**
 * O quadro de configuração da tabela dinâmica: um formulário GET — a
 * configuração mora no endereço, então o link guarda a tabela. As opções
 * mudam com a base (o mês do pagamento é das baixas; a situação, das contas).
 */
export function ConfiguracaoDaTabela({ config, empresa }: { config: Configuracao; empresa: string | null }) {
  const id = useId();
  const [base, setBase] = useState<Base>(config.base);
  const [linha1, setLinha1] = useState<Dimensao>(config.linhas[0]!);
  const [linha2, setLinha2] = useState<Dimensao | "">(config.linhas[1] ?? "");
  const [coluna, setColuna] = useState<Dimensao | "nenhuma">(config.coluna ?? "nenhuma");
  const [medida, setMedida] = useState<Medida>(config.medida);
  const [semPeriodo, setSemPeriodo] = useState(!config.filtros.de && !config.filtros.ate);

  const dims = dimensoesDa(base);
  function trocarBase(nova: Base) {
    // O que não existe na base nova volta ao padrão dela.
    const validas = dimensoesDa(nova);
    setBase(nova);
    if (!validas.includes(linha1)) setLinha1("categoria");
    if (linha2 && !validas.includes(linha2)) setLinha2("");
    if (coluna !== "nenhuma" && !validas.includes(coluna)) setColuna(nova === "baixas" ? "pagamento" : "competencia");
    if (!medidasDa(nova).includes(medida)) setMedida("valor");
  }
  const opcoes = (excluir: (Dimensao | "")[]) =>
    dims
      .filter((d) => !excluir.includes(d))
      .map((d) => (
        <option key={d} value={d}>
          {DIMENSOES[d].rotulo}
        </option>
      ));

  return (
    <Card className="p-4">
      <form method="get" action="/tabela-dinamica" className="flex flex-col gap-4">
        {empresa && <input type="hidden" name="empresa" value={empresa} />}
        <input type="hidden" name="linhas" value={linha2 ? `${linha1},${linha2}` : linha1} />
        {semPeriodo && <input type="hidden" name="periodo" value="todos" />}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Campo id={`${id}-base`} rotulo="Base">
            <Select id={`${id}-base`} name="base" compact value={base} onChange={(e) => trocarBase(e.target.value as Base)}>
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {ROTULO_DA_BASE[b]}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id={`${id}-linha1`} rotulo="Linhas">
            <Select id={`${id}-linha1`} compact value={linha1} onChange={(e) => setLinha1(e.target.value as Dimensao)}>
              {opcoes([linha2, coluna === "nenhuma" ? "" : coluna])}
            </Select>
          </Campo>
          <Campo id={`${id}-linha2`} rotulo="Depois, por">
            <Select id={`${id}-linha2`} compact value={linha2} onChange={(e) => setLinha2(e.target.value as Dimensao | "")}>
              <option value="">Nada (um nível só)</option>
              {opcoes([linha1, coluna === "nenhuma" ? "" : coluna])}
            </Select>
          </Campo>
          <Campo id={`${id}-coluna`} rotulo="Colunas">
            <Select id={`${id}-coluna`} name="coluna" compact value={coluna} onChange={(e) => setColuna(e.target.value as Dimensao | "nenhuma")}>
              <option value="nenhuma">Nenhuma (só o total)</option>
              {opcoes([linha1, linha2])}
            </Select>
          </Campo>
          <Campo id={`${id}-medida`} rotulo="Valor">
            <Select id={`${id}-medida`} name="medida" compact value={medida} onChange={(e) => setMedida(e.target.value as Medida)}>
              {medidasDa(base).map((m) => (
                <option key={m} value={m}>
                  {MEDIDAS[m].rotulo}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Campo id={`${id}-tipo`} rotulo="Tipo">
            <Select id={`${id}-tipo`} name="tipo" compact defaultValue={config.filtros.tipo}>
              <option value="ambos">{base === "baixas" ? "Entradas e saídas" : "A pagar e a receber"}</option>
              <option value="PAGAR">{base === "baixas" ? "Só saídas" : "Só a pagar"}</option>
              <option value="RECEBER">{base === "baixas" ? "Só entradas" : "Só a receber"}</option>
            </Select>
          </Campo>
          <Campo id={`${id}-de`} rotulo={base === "baixas" ? "Pagas de" : "De"}>
            <CampoMes id={`${id}-de`} name="de" compact defaultValue={config.filtros.de ?? undefined} disabled={semPeriodo} />
          </Campo>
          <Campo id={`${id}-ate`} rotulo="Até">
            <CampoMes id={`${id}-ate`} name="ate" compact defaultValue={config.filtros.ate ?? undefined} disabled={semPeriodo} />
          </Campo>
          {base === "contas" ? (
            <Campo id={`${id}-por`} rotulo="Período pela">
              <Select id={`${id}-por`} name="periodoPor" compact defaultValue={config.filtros.periodoPor}>
                <option value="competencia">Competência</option>
                <option value="vencimento">Data de vencimento</option>
              </Select>
            </Campo>
          ) : (
            <div className="hidden lg:block" />
          )}
          {base === "contas" ? (
            <Campo id={`${id}-situacao`} rotulo="Situação">
              <Select id={`${id}-situacao`} name="situacao" compact defaultValue={config.filtros.situacao}>
                <option value="todas">Todas (sem as canceladas)</option>
                <option value="abertas">Em aberto</option>
                <option value="vencidas">Vencidas</option>
                <option value="quitadas">Pagas ou recebidas</option>
              </Select>
            </Campo>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox id={`${id}-todos`} label="Sem período — o histórico inteiro" checked={semPeriodo} onChange={(e) => setSemPeriodo(e.target.checked)} />
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </div>
      </form>
    </Card>
  );
}
