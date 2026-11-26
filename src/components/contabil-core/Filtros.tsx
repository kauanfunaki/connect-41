import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoPeriodo } from "@/components/ui/CampoPeriodo";
import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";

// Filtro por GET (mês, conta bancária e texto), sem recarregar a página: a URL guarda a seleção e o
// link pode ser mandado para outra pessoa.

export function Filtros({
  empresaId,
  aba,
  mes,
  agenciaId,
  agencias,
  busca,
  status,
  vista,
  periodo,
}: {
  empresaId: string;
  aba: string;
  mes?: string | null;
  agenciaId?: string | null;
  agencias?: { value: string; label: string }[];
  busca?: string | null;
  /** Mostra o filtro de situação da transação (aba Extrato). */
  status?: string | null;
  /** A vista da aba que o filtro mantém (Fase D1: "conflitos" na aba NEO). */
  vista?: string | null;
  /** O período em datas, "de" e "ate" (Fase D2: aba Relatórios). */
  periodo?: { de: string | null; ate: string | null };
}) {
  return (
    <FormularioDeFiltro role="search" className="mb-3 flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="empresa" value={empresaId} />
      <input type="hidden" name="aba" value={aba} />
      {vista && <input type="hidden" name="vista" value={vista} />}
      {mes !== undefined && (
        <label className="flex flex-col gap-1">
          <span className="text-micro text-fg-muted">Competência</span>
          <CampoMes name="mes" defaultValue={mes ?? ""} compact aria-label="Competência" />
        </label>
      )}
      {periodo && (
        <div className="flex flex-col gap-1">
          <span className="text-micro text-fg-muted">Período</span>
          <CampoPeriodo nomeDe="de" nomeAte="ate" defaultDe={periodo.de ?? ""} defaultAte={periodo.ate ?? ""} compact aria-label="Período" />
        </div>
      )}
      {agencias && (
        <label className="flex flex-col gap-1">
          <span className="text-micro text-fg-muted">Conta bancária</span>
          <Select name="agencia" defaultValue={agenciaId ?? ""} aria-label="Conta bancária">
            <option value="">Todas</option>
            {agencias.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {status !== undefined && (
        <label className="flex flex-col gap-1">
          <span className="text-micro text-fg-muted">Situação</span>
          <Select name="status" defaultValue={status ?? ""} aria-label="Situação">
            <option value="">Todas</option>
            <option value="pendente">Pendentes</option>
            <option value="processada">Classificadas</option>
            <option value="erro">Com erro</option>
          </Select>
        </label>
      )}
      {busca !== undefined && (
        <label className="flex flex-col gap-1">
          <span className="text-micro text-fg-muted">Buscar</span>
          <Input type="search" name="busca" defaultValue={busca ?? ""} maxLength={100} aria-label="Buscar" />
        </label>
      )}
      <Button type="submit" size="sm" variant="secondary">
        Filtrar
      </Button>
    </FormularioDeFiltro>
  );
}
