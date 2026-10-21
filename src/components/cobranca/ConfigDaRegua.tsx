"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { Switch } from "@/components/ui/Switch";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { useConfirm } from "@/components/ui/useConfirm";
import { salvarRegua, alternarEmpresaNaRegua } from "@/app/(app)/cobranca/actions";

/**
 * Liga/desliga e passos da régua. Ligar pede confirmação: a partir do próximo
 * cron, sacados de clientes passam a receber e-mail — e isso não se desfaz.
 */
export function ConfigDaRegua({ ligada, passos, podeEditar }: { ligada: boolean; passos: string; podeEditar: boolean }) {
  const { dialog, requestConfirm } = useConfirm();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  function salvar(dados: FormData) {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const r = await salvarRegua(dados);
      if ("error" in r) setErro(r.error);
      else setSalvo(true);
    });
  }

  return (
    // Grade sem `items-end`: com ele, o texto de ajuda embaixo dos passos
    // puxava o campo para cima e a situação ficava 20px abaixo dele. O botão
    // vai em AlinhadoAoCampo, na altura dos campos.
    <form
      className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,20rem)_auto] gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        if (dados.get("ligada") === "1" && !ligada) {
          requestConfirm(
            {
              title: "Ligar a régua de cobrança?",
              description: "A partir da próxima execução, sacados com e-mail e títulos vencidos nos passos recebem lembrete em nome da empresa credora.",
              confirmLabel: "Ligar",
            },
            async () => salvar(dados)
          );
          return;
        }
        salvar(dados);
      }}
    >
      {/* Interruptor do Connect (15/10/2026), e não a lista Desligada/Ligada.
          Continua valendo no "Salvar", junto dos passos, e com a confirmação
          ao ligar; envia "1" ou "0", como a lista. */}
      <CampoForm label="Situação" htmlFor="regua-ligada">
        <div className="flex min-h-9 items-center">
          <Switch id="regua-ligada" name="ligada" value="1" valorDesligado="0" defaultChecked={ligada} disabled={!podeEditar} rotulo="Ligada" />
        </div>
      </CampoForm>
      <CampoForm label="Passos (dias de atraso)" htmlFor="regua-passos" helper="Separados por vírgula. Padrão: 1, 7, 15, 30.">
        <Input id="regua-passos" name="passos" defaultValue={passos} disabled={!podeEditar} />
      </CampoForm>
      {podeEditar && (
        // Na linha dos campos, e não no `FormFooter`: o formulário é uma linha
        // só. O "Salvando…" vem do `loading` do botão (08/10/2026).
        <AlinhadoAoCampo>
          <Button type="submit" loading={pendente}>
            Salvar
          </Button>
          {erro && (
            <span role="alert" className="text-helper font-medium text-danger">
              {erro}
            </span>
          )}
          {salvo && <span className="text-helper text-success-fg">Salvo.</span>}
        </AlinhadoAoCampo>
      )}
      {dialog}
    </form>
  );
}

/** Tirar uma empresa da régua, ou devolver. */
export function EmpresaNaRegua({
  empresas,
  companyId,
  fora,
}: {
  empresas?: EmpresaParaEscolher[];
  companyId?: string;
  fora: boolean;
}) {
  const [escolhida, setEscolhida] = useState(companyId ?? "");
  // Remonta o seletor depois de tirar a empresa: ele não é controlado.
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function alternar(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await alternarEmpresaNaRegua(id, fora);
      if ("error" in r) setErro(r.error);
      else if (empresas) {
        setEscolhida("");
        setVersao((v) => v + 1);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {empresas && (
        // A lista de empresas com busca, logo, CNPJ e recentes (15/10/2026):
        // era um <select> com todas as empresas ativas.
        <SearchableSelect
          key={versao}
          name="companyId"
          options={opcoesDeEmpresa(empresas)}
          compact
          avatar
          lembrarRecentes="empresas"
          placeholder="Buscar empresa…"
          textoSemValor="Escolha a empresa…"
          onChange={setEscolhida}
          className="w-72 max-w-full"
          aria-label="Empresa"
        />
      )}
      {/* Ao lado do seletor compacto (32px), o botão é `sm`; sozinho na linha
          da lista, `xs`, como as outras ações de linha. */}
      <Button size={empresas ? "sm" : "xs"} variant="secondary" loading={pendente} disabled={!escolhida} onClick={() => alternar(escolhida)}>
        {fora ? "Tirar da régua" : "Devolver à régua"}
      </Button>
      {erro && (
        <span role="alert" className="text-micro text-danger">
          {erro}
        </span>
      )}
    </div>
  );
}
