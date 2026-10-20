"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { gruposDeVerbas } from "@/lib/rescisaoChecklist";
import { contagemDoBloco, marcarGrupo, quantosNoConjunto } from "@/lib/listaEmBlocos";
import type { RescisaoConfig, OrigemCampo } from "@/lib/rescisao/config";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { SecaoDeConfiguracao } from "@/components/configuracoes/SecaoDeConfiguracao";
import { CalendarRange, Handshake, HardHat, ListX, Scale } from "lucide-react";

export type RescisaoConfigState = { error: string } | null;

type Props = {
  action: (prev: RescisaoConfigState, form: FormData) => Promise<RescisaoConfigState>;
  /** Valores efetivos hoje (já resolvidos). */
  valores: RescisaoConfig;
  /** De onde cada valor veio — só é exibido no nível empresa. */
  origem?: Record<keyof RescisaoConfig, OrigemCampo>;
  /** true = tela da empresa (campos podem herdar). */
  nivelEmpresa: boolean;
  canEdit: boolean;
};

const GRAU_OPTIONS = [
  { value: "NENHUM", label: "Nenhum" },
  { value: "MINIMO", label: "Mínimo (10%)" },
  { value: "MEDIO", label: "Médio (20%)" },
  { value: "MAXIMO", label: "Máximo (40%)" },
];

const BASE_INSALUBRIDADE_OPTIONS = [
  { value: "SALARIO_MINIMO", label: "Salário mínimo" },
  { value: "SALARIO_BASE", label: "Salário base do colaborador" },
  { value: "PISO_CATEGORIA", label: "Piso da categoria" },
];

const MEDIA_BASE_OPTIONS = [
  { value: "PERIODO_AQUISITIVO", label: "Período aquisitivo" },
  { value: "ANO_CIVIL", label: "Ano civil" },
  { value: "ULTIMOS_N_MESES", label: "Últimos N meses" },
];

const ORIGEM_LABEL: Record<OrigemCampo, string> = {
  PADRAO_LEGAL: "padrão legal",
  TENANT: "padrão do escritório",
  EMPRESA: "definido nesta empresa",
};

export function RescisaoConfigForm({ action, valores, origem, nivelEmpresa, canEdit }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Sem isso a herança se perde na prática: o usuário abre a tela da empresa e
  // não sabe o que está vindo do padrão do escritório.
  const heranca = (campo: keyof RescisaoConfig) =>
    nivelEmpresa && origem ? `Origem: ${ORIGEM_LABEL[origem[campo]]}` : undefined;

  return (
    // Seções em duas colunas (escolha 1B dos Ajustes de 15/10, 20/10/2026): o
    // título e o que a seção faz à esquerda, o cartão com os campos à direita.
    // Era um cartão só, na largura toda, com os campos nas pontas. Um salvar
    // só, no fim, como antes.
    <form action={formAction}>
      {state?.error && (
        <Aviso className="mb-4">{state.error}</Aviso>
      )}

      <SecaoDeConfiguracao
        titulo="Adicionais"
        descricao="Os percentuais são fixos em lei — o que varia por empresa é o grau apurado no laudo e a incidência."
        icone={<HardHat />}
      >
        <Card className="p-5">
          <FieldGrid>
            <CampoForm label="Grau de insalubridade" htmlFor="insalubridadeGrau" helper={heranca("insalubridadeGrau")}>
              <Select id="insalubridadeGrau" name="insalubridadeGrau" defaultValue={valores.insalubridadeGrau} disabled={!canEdit}>
                {GRAU_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </CampoForm>

            <CampoForm
              label="Base da insalubridade"
              htmlFor="insalubridadeBase"
              helper={heranca("insalubridadeBase") ?? "A Súmula Vinculante 4 do STF deixou o tema em aberto."}
            >
              <Select id="insalubridadeBase" name="insalubridadeBase" defaultValue={valores.insalubridadeBase} disabled={!canEdit}>
                {BASE_INSALUBRIDADE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>

          <div className="mt-4 space-y-2">
            <Checkbox
              name="periculosidadeAplica"
              value="true"
              defaultChecked={valores.periculosidadeAplica}
              disabled={!canEdit}
              label="Aplica periculosidade (30% sobre o salário base)"
            />
            <Checkbox
              name="periculosidadeIntegral"
              value="true"
              defaultChecked={valores.periculosidadeIntegral}
              disabled={!canEdit}
              label="Periculosidade sobre a remuneração integral — somente eletricitários (Súmula 191 TST)"
            />
          </div>
        </Card>
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="Médias de variáveis"
        descricao="A janela e o período de onde sai a média das verbas variáveis nas férias e no 13º."
        icone={<CalendarRange />}
      >
        <Card className="p-5">
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm label="Janela" htmlFor="mediaMeses" helper={heranca("mediaMeses") ?? "Entre 3 e 12."}>
              <CampoNumero
                id="mediaMeses"
                name="mediaMeses"
                min={3}
                max={12}
                suffix="meses"
                defaultValue={valores.mediaMeses}
                disabled={!canEdit}
              />
            </CampoForm>

            <CampoForm label="Base das férias" htmlFor="mediaBaseFerias" helper={heranca("mediaBaseFerias")}>
              <Select id="mediaBaseFerias" name="mediaBaseFerias" defaultValue={valores.mediaBaseFerias} disabled={!canEdit}>
                {MEDIA_BASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </CampoForm>

            <CampoForm label="Base do 13º" htmlFor="mediaBaseDecimoTerceiro" helper={heranca("mediaBaseDecimoTerceiro")}>
              <Select
                id="mediaBaseDecimoTerceiro"
                name="mediaBaseDecimoTerceiro"
                defaultValue={valores.mediaBaseDecimoTerceiro}
                disabled={!canEdit}
              >
                {MEDIA_BASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>
        </Card>
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="Conferência"
        descricao="Quanto de diferença o cálculo aceita antes de acusar divergência no TRCT, e como o 1/3 vem."
        icone={<Scale />}
      >
        <Card className="p-5">
          {/* Um campo só, de percentual: na coluna de um terço, a mesma das
              médias acima — era meia tela para um número de até 5. */}
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm
              label="Tolerância de divergência"
              htmlFor="toleranciaPct"
              helper={heranca("toleranciaPct") ?? "Máximo 5% — acima disso divergências reais deixariam de acender."}
            >
              <Input
                id="toleranciaPct"
                name="toleranciaPct"
                type="number"
                step="0.1"
                min={0}
                max={5}
                suffix="%"
                defaultValue={valores.toleranciaPct}
                disabled={!canEdit}
              />
            </CampoForm>
          </FieldGrid>

          <div className="mt-4">
            <Checkbox
              name="tercoApresentadoSeparado"
              value="true"
              defaultChecked={valores.tercoApresentadoSeparado}
              disabled={!canEdit}
              label="A contabilidade apresenta o 1/3 constitucional como item separado"
            />
            <p className="text-helper text-fg-muted mt-1 ml-6">
              Desmarque se ela envia o 1/3 embutido nas férias — o item deixa de acusar divergência.
            </p>
          </div>
        </Card>
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="Verbas não praticadas"
        descricao="Marcadas aqui deixam de entrar no total — mas continuam aparecendo na conferência com o valor que teriam, pra ninguém esconder verba devida sem querer."
        icone={<ListX />}
      >
        {/* A chave remonta o bloco quando o que está gravado muda (depois de
            salvar), para a marcação partir do valor novo. */}
        <VerbasNaoPraticadas
          key={valores.verbasDesabilitadas.join(",")}
          iniciais={valores.verbasDesabilitadas}
          canEdit={canEdit}
        />
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="Convenção coletiva"
        descricao={
          <>
            Texto de orientação exibido ao conferente — <strong>não é regra executável</strong>. O motor não interpreta
            cláusula de CCT.
          </>
        }
        icone={<Handshake />}
      >
        <Card className="p-5 space-y-4">
          <CampoForm label="Sindicato / CCT" htmlFor="cctNome" helper={heranca("cctNome")}>
            <Input id="cctNome" name="cctNome" type="text" defaultValue={valores.cctNome ?? ""} maxLength={180} disabled={!canEdit} />
          </CampoForm>
          <CampoForm label="Observações da CCT" htmlFor="cctObservacoes" helper={heranca("cctObservacoes")}>
            <Textarea
              id="cctObservacoes"
              name="cctObservacoes"
              rows={3}
              defaultValue={valores.cctObservacoes ?? ""}
              disabled={!canEdit}
              placeholder="Ex: piso da categoria, adicionais previstos, prazos específicos…"
            />
          </CampoForm>
        </Card>
      </SecaoDeConfiguracao>

      {canEdit && (
        <div className="flex items-center justify-end gap-3 pt-5 border-t border-border">
          <Button
            variant="primary"
            size="md"
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Salvando…" : "Salvar configuração"}
          </Button>
        </div>
      )}
    </form>
  );
}

const GRUPOS_DE_VERBAS = gruposDeVerbas();
const PALAVRA = { um: "marcada", varios: "marcadas" };

/**
 * As verbas que a empresa não pratica, por grupo da conferência (escolha A da
 * página "Telas pesadas", 08/10/2026): cada grupo num `BlocoRecolhivel` que
 * começa fechado, com "2 de 8 marcadas" na linha e "Marcar o grupo" ao lado.
 * Eram as quinze caixas abertas numa lista só. Prazos e documentos não entra:
 * não tem verba de valor para tirar do total.
 *
 * As caixas são controladas e sem `name`; o que vai para o formulário são os
 * campos escondidos, um por verba marcada — o mesmo `verbasDesabilitadas` de
 * antes. Assim "Marcar o grupo" vale com o bloco fechado. Quando o React limpa
 * o formulário depois de enviar, a marcação volta ao que está gravado, como
 * faria a caixa não controlada (a mesma regra do `Switch`).
 */
function VerbasNaoPraticadas({ iniciais, canEdit }: { iniciais: string[]; canEdit: boolean }) {
  const [marcadas, setMarcadas] = useState(() => new Set(iniciais));
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = raiz.current?.closest("form");
    if (!form) return;
    const voltar = () => setMarcadas(new Set(iniciais));
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, [iniciais]);

  const marcar = (chaves: string[], ligar: boolean) => setMarcadas((atual) => marcarGrupo(atual, chaves, ligar));

  return (
    <div ref={raiz} className="flex flex-col gap-2">
      {[...marcadas].map((chave) => (
        <input key={chave} type="hidden" name="verbasDesabilitadas" value={chave} />
      ))}
      {GRUPOS_DE_VERBAS.map((g) => {
        const chaves = g.itens.map((i) => i.key);
        const n = quantosNoConjunto(marcadas, chaves);
        const todas = n === chaves.length;
        return (
          <BlocoRecolhivel
            key={g.chave}
            titulo={g.rotulo}
            resumo={contagemDoBloco(n, chaves.length, PALAVRA)}
            espacoDaAcao="pr-36"
            acao={
              canEdit && (
                <Button
                  variant="link"
                  className="text-ui leading-5"
                  onClick={() => marcar(chaves, !todas)}
                  aria-label={`${todas ? "Desmarcar" : "Marcar"} o grupo ${g.rotulo}`}
                >
                  {todas ? "Desmarcar o grupo" : "Marcar o grupo"}
                </Button>
              )
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-1">
              {g.itens.map((i) => (
                <Checkbox
                  key={i.key}
                  checked={marcadas.has(i.key)}
                  onChange={(e) => marcar([i.key], e.target.checked)}
                  disabled={!canEdit}
                  label={i.label}
                />
              ))}
            </div>
          </BlocoRecolhivel>
        );
      })}
    </div>
  );
}
