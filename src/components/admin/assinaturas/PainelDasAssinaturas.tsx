"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Building2, CircleCheck, Lock, OctagonAlert, Pencil, Settings2, Wallet } from "lucide-react";
import { salvarAssinatura, type AssinaturaState } from "@/app/(app)/admin/assinaturas/actions";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { Cartao, CartoesNoCelular, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { SlideOver } from "@/components/ui/SlideOver";
import { Textarea } from "@/components/ui/Textarea";
import { dataBR } from "@/lib/datas/calendario";
import { formatInstantDate, formatarReais } from "@/lib/format";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/subscription-labels";
import {
  botoesDeSituacao,
  contarSituacoes,
  diasAteARenovacao,
  emSomenteLeitura,
  filtrarPorSituacao,
  medidorDeUsuarios,
  mensalidadeDaLinha,
  situacaoDaLinha,
  textoDaRenovacao,
  type EntradaDoHistorico,
  type FiltroDeSituacao,
  type LinhaDaAssinatura,
  type TotaisDasAssinaturas,
} from "@/lib/assinaturas/painel";

export type PlanoParaEscolher = { id: string; nome: string; ativo: boolean };

type Props = {
  linhas: LinhaDaAssinatura[];
  totais: TotaisDasAssinaturas;
  planos: PlanoParaEscolher[];
  /** O histórico de cada escritório (pelo id), do mais novo para o mais antigo. */
  historicos: Record<string, EntradaDoHistorico[]>;
  /** Hoje no escritório, "AAAA-MM-DD" — vem do servidor para a conta dos dias não mudar na hidratação. */
  hoje: string;
};

const TOM_DA_SITUACAO: Record<ReturnType<typeof situacaoDaLinha>, TomDoSelo> = {
  ACTIVE: "sucesso",
  TRIAL: "marca",
  PAST_DUE: "perigo",
  CANCELED: "neutro",
  SEM: "neutro",
};

const MODO_CURTO = { MANAGED: "Gerenciado", SELF_SERVICE: "Autoatendimento" } as const;

/**
 * Administração › Assinaturas (escolha A do Kauan, 14/10/2026): os números do
 * topo, os botões de situação com a contagem, a tabela (cartões no celular) e o
 * Editar num painel ao lado, que abre por cima sem empurrar a lista, com o
 * histórico tirado da Auditoria embaixo.
 */
export function PainelDasAssinaturas({ linhas, totais, planos, historicos, hoje }: Props) {
  const [filtro, setFiltro] = useState<FiltroDeSituacao>("todas");
  const [editando, setEditando] = useState<string | null>(null);
  const visiveis = filtrarPorSituacao(linhas, filtro);
  const emEdicao = linhas.find((l) => l.tenantId === editando) ?? null;

  return (
    <>
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Clientes",
            valor: String(totais.clientes),
            icone: <Building2 />,
            detalhe: `${totais.comAssinatura} com assinatura`,
          },
          {
            rotulo: "Ativas",
            valor: String(totais.ativas),
            tom: "text-success-fg",
            icone: <CircleCheck />,
            detalhe:
              totais.ativasComImplantacaoPendente > 0
                ? `${totais.ativasComImplantacaoPendente} com implantação pendente`
                : "implantação em dia",
          },
          {
            rotulo: "Em atraso",
            valor: String(totais.emAtraso),
            tom: totais.emAtraso > 0 ? "text-danger" : "text-fg-muted",
            icone: <OctagonAlert />,
            detalhe: totais.emAtraso > 0 ? `${totais.emAtrasoEmSomenteLeitura} já em somente leitura` : "nenhuma",
          },
          {
            rotulo: "Mensalidade prevista",
            valor: formatarReais(totais.mensalidadePrevista),
            icone: <Wallet />,
            detalhe: "estimativa · ativas e em atraso",
          },
        ]}
      />

      <div role="group" aria-label="Filtrar por situação" className="mb-3 flex flex-wrap gap-2">
        {botoesDeSituacao(contarSituacoes(linhas)).map((b) => {
          const ativo = b.filtro === filtro;
          return (
            <button
              key={b.filtro}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(b.filtro)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-ui font-medium transition-colors ${
                ativo ? "border-brand bg-brand-subtle text-brand" : "border-border bg-surface text-fg-secondary hover:border-border-strong hover:text-fg"
              }`}
            >
              {b.rotulo}
              <span className="font-semibold tnum">{b.n}</span>
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 />} title="Nenhum escritório nesta situação" />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {visiveis.map((l) => (
              <Cartao key={l.tenantId}>
                <div className="flex items-center gap-2.5">
                  <AvatarImage src={l.logoUrl} name={l.nome} size={28} shape="lg" fontSize={11} />
                  <span className="min-w-0 flex-1 break-words font-medium text-fg">{l.nome}</span>
                  <SeloDaSituacao linha={l} />
                </div>
                <InfoDoCartao className="mt-2">
                  <Plano linha={l} emLinha />
                </InfoDoCartao>
                {l.assinatura && (
                  <>
                    <InfoDoCartao>
                      Usuários: <Usuarios linha={l} emLinha />
                    </InfoDoCartao>
                    <InfoDoCartao>
                      Renovação: <Renovacao linha={l} hoje={hoje} emLinha />
                    </InfoDoCartao>
                  </>
                )}
                <PeDoCartao>
                  <Implantacao linha={l} />
                  <span className="ml-auto">
                    <BotaoEditar linha={l} onClick={() => setEditando(l.tenantId)} />
                  </span>
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>

          <div className="c41-tabela scroll-x hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr>
                  <th className="c41-a-esquerda px-4">Cliente</th>
                  <th className="px-4">Plano</th>
                  <th className="px-4">Situação</th>
                  <th className="px-4">Usuários</th>
                  <th className="px-4">Renovação</th>
                  <th className="px-4">Implantação</th>
                  <th className="px-4">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr
                    key={l.tenantId}
                    className={`border-b border-border ${l.tenantId === editando ? "bg-selected-bg" : ""}`}
                  >
                    <td className="c41-a-esquerda px-4">
                      <div className="flex items-center gap-2.5">
                        <AvatarImage src={l.logoUrl} name={l.nome} size={28} shape="lg" fontSize={11} />
                        <span className="min-w-0">
                          <span className="block font-medium text-fg">{l.nome}</span>
                          {l.assinatura && (
                            <span className="block text-fs-2 text-fg-muted">
                              cliente desde {formatInstantDate(new Date(l.assinatura.inicio))}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4">
                      <Plano linha={l} />
                    </td>
                    <td className="px-4">
                      <div className="flex flex-col items-center gap-0.5">
                        <SeloDaSituacao linha={l} />
                        {emSomenteLeitura(l) && (
                          <span className="inline-flex items-center gap-1 text-fs-2 text-danger">
                            <Lock size={11} aria-hidden />
                            somente leitura
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4">
                      {l.assinatura ? <Usuarios linha={l} /> : <span className="text-fg-muted">—</span>}
                    </td>
                    <td className="px-4">
                      {l.assinatura ? <Renovacao linha={l} hoje={hoje} /> : <span className="text-fg-muted">—</span>}
                    </td>
                    <td className="px-4">
                      <Implantacao linha={l} />
                    </td>
                    <td className="px-4">
                      <BotaoEditar linha={l} onClick={() => setEditando(l.tenantId)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SlideOver open={emEdicao !== null} onClose={() => setEditando(null)} title={emEdicao?.nome} width="max-w-lg" fundo="leve">
        {emEdicao && (
          <PainelDeEdicao
            key={emEdicao.tenantId}
            linha={emEdicao}
            planos={planos}
            historico={historicos[emEdicao.tenantId] ?? []}
            onFechar={() => setEditando(null)}
          />
        )}
      </SlideOver>
    </>
  );
}

function SeloDaSituacao({ linha }: { linha: LinhaDaAssinatura }) {
  const s = situacaoDaLinha(linha);
  return (
    <Selo tom={TOM_DA_SITUACAO[s]} className="gap-1">
      {s === "PAST_DUE" && emSomenteLeitura(linha) && <Lock size={10} aria-hidden />}
      {s === "SEM" ? "Sem assinatura" : SUBSCRIPTION_STATUS_LABEL[s]}
    </Selo>
  );
}

function Plano({ linha, emLinha = false }: { linha: LinhaDaAssinatura; emLinha?: boolean }) {
  const a = linha.assinatura;
  if (!a) return <span className="text-fg-muted">{MODO_CURTO[linha.modo]} · sem plano</span>;
  const nome = a.plano?.nome ?? "plano removido";
  const cobranca = a.plano ? (a.plano.cobranca === "PER_USER_MONTHLY" ? "por usuário" : "valor fixo") : null;
  const apoio = [MODO_CURTO[linha.modo], cobranca].filter(Boolean).join(" · ");
  if (emLinha) return <>{`${nome} · ${apoio}`}</>;
  return (
    <span className="flex flex-col items-center">
      <span className="text-fg">{nome}</span>
      <span className="text-fs-2 text-fg-muted">{apoio}</span>
    </span>
  );
}

function Usuarios({ linha, emLinha = false }: { linha: LinhaDaAssinatura; emLinha?: boolean }) {
  const m = medidorDeUsuarios(linha.modo, linha.assinatura?.seatLimit, linha.usuariosAtivos);
  if (m.tipo === "sem-limite") {
    if (emLinha) return <>{`${m.usados} · sem limite`}</>;
    return (
      <span className="flex flex-col items-center">
        <span className="tnum text-fg">{m.usados}</span>
        <span className="text-fs-2 text-fg-muted">sem limite</span>
      </span>
    );
  }
  const texto = `${m.usados} de ${m.limite}`;
  if (emLinha) return <span className={m.cheio ? "font-medium text-danger" : undefined}>{texto}</span>;
  return (
    <span className="mx-auto flex w-20 flex-col items-center gap-1" title={m.cheio ? "Limite atingido: não dá para criar usuário novo." : undefined}>
      <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${m.cheio ? "bg-danger" : "bg-brand"}`} style={{ width: `${m.porcento}%` }} />
      </span>
      <span className={`text-fs-2 tnum ${m.cheio ? "font-medium text-danger" : "text-fg-secondary"}`}>{texto}</span>
    </span>
  );
}

function Renovacao({ linha, hoje, emLinha = false }: { linha: LinhaDaAssinatura; hoje: string; emLinha?: boolean }) {
  const data = linha.assinatura?.renovacao;
  if (!data) return <span className="text-fg-muted">sem data</span>;
  const { texto, vencida } = textoDaRenovacao(diasAteARenovacao(data, hoje));
  const cor = vencida ? "text-danger" : "text-fg";
  if (emLinha) return <span className={vencida ? "text-danger" : undefined}>{`${dataBR(data)} · ${texto}`}</span>;
  return (
    <span className={`flex flex-col items-center tnum ${cor}`}>
      <span>{dataBR(data)}</span>
      <span className={`text-fs-2 ${vencida ? "font-medium" : "text-fg-muted"}`}>{texto}</span>
    </span>
  );
}

function Implantacao({ linha }: { linha: LinhaDaAssinatura }) {
  if (!linha.assinatura) return <span className="text-fg-muted">—</span>;
  return linha.assinatura.implantacaoPagaEm ? <Selo tom="sucesso">Paga</Selo> : <Selo tom="atencao">Pendente</Selo>;
}

function BotaoEditar({ linha, onClick }: { linha: LinhaDaAssinatura; onClick: () => void }) {
  return (
    <Button variant="secondary" size="xs" onClick={onClick} aria-label={`${linha.assinatura ? "Editar" : "Configurar"} a assinatura de ${linha.nome}`}>
      {linha.assinatura ? <Pencil size={11} /> : <Settings2 size={11} />}
      {linha.assinatura ? "Editar" : "Configurar"}
    </Button>
  );
}

/**
 * O painel do Editar: os campos de antes (modo, plano, situação, limite,
 * renovação, implantação, observações), com as mesmas regras — o limite abaixo
 * dos usuários ativos pede confirmação —, a data de início, que existia e a
 * tela não mostrava, e o histórico.
 */
function PainelDeEdicao({
  linha,
  planos,
  historico,
  onFechar,
}: {
  linha: LinhaDaAssinatura;
  planos: PlanoParaEscolher[];
  historico: EntradaDoHistorico[];
  onFechar: () => void;
}) {
  const [state, formAction, isPending] = useActionState<AssinaturaState, FormData>(salvarAssinatura, null);
  const enviou = useRef(false);
  const id = useId();
  const a = linha.assinatura;

  // Fecha quando o salvar volta sem erro (o servidor refaz a tela).
  useEffect(() => {
    if (enviou.current && !isPending && !state?.error) onFechar();
    enviou.current = isPending;
  }, [isPending, state, onFechar]);

  const mensalidade = mensalidadeDaLinha(linha);
  const porUsuario = a?.plano?.cobranca === "PER_USER_MONTHLY";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-helper text-fg-secondary">
        {a ? `Cliente desde ${formatInstantDate(new Date(a.inicio))}` : "Ainda sem assinatura. Enquanto isso, nada é bloqueado."}
        {" · "}
        {linha.usuariosAtivos} {linha.usuariosAtivos === 1 ? "usuário ativo" : "usuários ativos"}
        {mensalidade !== null && (
          <>
            <br />
            Mensalidade prevista: {formatarReais(mensalidade)}
            {porUsuario && a?.plano && ` (${linha.usuariosAtivos} × ${formatarReais(a.plano.valorPorUsuario)})`}
          </>
        )}
      </p>

      {emSomenteLeitura(linha) && (
        <Aviso tom="perigo" icone={<Lock size={14} />}>
          Em somente leitura: este escritório não consegue criar nem editar até a situação voltar para Ativa ou Em teste.
        </Aviso>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tenantId" value={linha.tenantId} />
        <CampoForm label="Modo de gestão" htmlFor={`${id}-modo`}>
          <Select id={`${id}-modo`} name="managementMode" defaultValue={linha.modo}>
            <option value="MANAGED">Gerenciado pela 41 Tech</option>
            <option value="SELF_SERVICE">Autoatendimento (cliente administra)</option>
          </Select>
        </CampoForm>
        <FieldGrid>
          <CampoForm label="Plano" htmlFor={`${id}-plano`} required>
            <Select id={`${id}-plano`} name="planId" defaultValue={a?.planId ?? ""} required>
              <option value="" disabled>
                Selecione um plano
              </option>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ativo ? p.nome : `${p.nome} (inativo)`}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Situação" htmlFor={`${id}-status`}>
            <Select id={`${id}-status`} name="status" defaultValue={a?.status ?? "TRIAL"}>
              {Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([v, rotulo]) => (
                <option key={v} value={v}>
                  {rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Limite de usuários" htmlFor={`${id}-limite`} helper="Só vale no autoatendimento.">
            <CampoNumero id={`${id}-limite`} name="seatLimit" min={1} defaultValue={a?.seatLimit ?? ""} />
          </CampoForm>
          <CampoForm label="Próxima renovação" htmlFor={`${id}-renovacao`}>
            <CampoData id={`${id}-renovacao`} name="currentPeriodEnd" defaultValue={a?.renovacao ?? ""} />
          </CampoForm>
        </FieldGrid>
        <CampoForm label="Valor de implantação" htmlFor={`${id}-implantacao`}>
          <Input id={`${id}-implantacao`} name="setupFeeAmount" inputMode="decimal" prefix="R$" defaultValue={a?.implantacaoValor ?? ""} />
        </CampoForm>
        <Checkbox id={`${id}-implantacao-paga`} name="setupFeePaid" defaultChecked={!!a?.implantacaoPagaEm} label="Implantação já paga" />
        <CampoForm label="Observações" htmlFor={`${id}-observacoes`}>
          <Textarea id={`${id}-observacoes`} name="notes" defaultValue={a?.notes ?? ""} placeholder="Contrato, negociação…" />
        </CampoForm>
        {state?.needsSeatConfirm && (
          <Checkbox
            id={`${id}-confirma-limite`}
            name="confirmSeatBelowHeadcount"
            label="Confirmo o limite abaixo do número de usuários ativos"
          />
        )}
        <FormFooter pending={isPending} onCancel={onFechar} erro={state?.error} />
      </form>

      <section aria-labelledby={`${id}-historico`} className="border-t border-border pt-4">
        <h3 id={`${id}-historico`} className="c41-rotulo">
          Histórico
        </h3>
        {historico.length === 0 ? (
          <p className="mt-2 text-helper text-fg-muted">Nenhuma mudança registrada ainda.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {historico.map((h, i) => (
              <li key={`${h.quando}-${i}`} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 text-ui">
                <span className="tnum text-fg-muted">{formatInstantDate(new Date(h.quando))}</span>
                <span className="text-fg-secondary">
                  <span className="font-medium text-fg">{h.quem}</span> {h.texto}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-fs-2 text-fg-muted">O histórico mostra plano, situação e modo; os outros campos não ficam guardados com o valor.</p>
      </section>
    </div>
  );
}
