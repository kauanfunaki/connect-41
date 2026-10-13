import { ArrowLeftRight, CalendarDays, Check, Folder, FolderInput } from "lucide-react";
import { ABERTURA, CARTAO, FAIXA, RESPIRO, TITULO_2 } from "./estilos";
import { Rotulo } from "./Marca";

// O que o Connect faz, num mosaico (13/10/2026, versão 3 do site). Só recurso
// que existe: os setores e as transferências, o Portal do Cliente, os
// documentos fiscais, o financeiro dos clientes, os processos do Societário,
// os Arquivos, o WhatsApp do Recrutamento e as integrações — essas só pelo
// NOME, em fichas neutras (logo de terceiro é marca registrada).
//
// Cada cartão traz um desenho pequeno da tela de verdade, com dados
// inventados — decoração (aria-hidden): o texto do cartão diz tudo.

// A cor de cada setor, a mesma do menu do Connect (--c41-sector-*).
const SETORES = [
  { nome: "BPO Financeiro", cor: "var(--c41-sector-bpo)" },
  { nome: "Fiscal", cor: "var(--c41-sector-fiscal)" },
  { nome: "Departamento Pessoal", cor: "var(--c41-sector-dprh)" },
  { nome: "Societário", cor: "var(--c41-sector-societario)" },
  { nome: "Recrutamento", cor: "var(--c41-sector-recrutamento)" },
  { nome: "Gestão", cor: "var(--c41-sector-gestao)" },
];

const INTEGRACOES = ["Omie", "SPED", "Google Agenda", "WhatsApp"];

const MINI = "rounded-xl border border-border bg-surface-elevated";

function Cartao({
  titulo,
  texto,
  className = "",
  children,
}: {
  titulo: string;
  texto: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <li className={`c41-site-surge ${CARTAO} relative flex flex-col overflow-hidden p-5 sm:p-6 lg:p-7 ${className}`}>
      <h3 className="font-display text-fs-8 font-medium leading-tight tracking-[-0.015em] text-fg">{titulo}</h3>
      <p className="mt-2 max-w-[34em] text-fs-5 leading-relaxed text-fg-secondary">{texto}</p>
      <div aria-hidden className="mt-6 flex flex-1 flex-col justify-end">
        {children}
      </div>
    </li>
  );
}

export function MosaicoDoConnect() {
  return (
    <section id="o-connect" aria-labelledby="o-connect-titulo" className="scroll-mt-16">
      <div className={`${FAIXA} ${RESPIRO}`}>
        <div className="c41-site-surge max-w-[46em]">
          <Rotulo>O Connect</Rotulo>
          <h2 id="o-connect-titulo" className={`${TITULO_2} mt-4 text-fg`}>
            Os setores, o cliente e os arquivos no mesmo lugar
          </h2>
          <p className={`${ABERTURA} mt-5 text-fg-secondary`}>
            Cada escritório liga os setores e os módulos que usa, e o cliente acompanha pelo Portal do Cliente o que o escritório faz
            pela empresa dele.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <Cartao
            className="md:col-span-2 lg:col-span-7"
            titulo="Um espaço para cada setor"
            texto="BPO Financeiro, Fiscal, Departamento Pessoal, Societário, Recrutamento e Gestão: cada setor com as suas telas, e uma transferência quando o trabalho passa de um para outro."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SETORES.map((s) => (
                <span key={s.nome} className={`${MINI} flex items-center gap-2.5 px-3 py-2.5`}>
                  <span className="size-3 flex-none rounded-[4px]" style={{ background: s.cor }} />
                  <span className="truncate text-fs-3 font-medium text-fg sm:text-fs-4">{s.nome}</span>
                </span>
              ))}
            </div>
            <span className="mt-2 flex items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-3 py-2.5 text-fs-3 text-fg-secondary">
              <ArrowLeftRight size={15} className="flex-none text-brand" />
              <span className="min-w-0 truncate">Transferência do Fiscal para o BPO Financeiro · notas de setembro para lançar</span>
            </span>
          </Cartao>

          <Cartao
            className="lg:col-span-5"
            titulo="Portal do Cliente"
            texto="A empresa vê os documentos, responde às pendências com o arquivo junto, aprova pagamentos e acompanha os processos, no computador ou no celular."
          >
            {/* Um celular saindo pelo pé do cartão. */}
            <div className="-mb-7 mx-auto w-full max-w-[272px] rounded-t-[22px] border border-b-0 border-border bg-surface-elevated px-3.5 pb-6 pt-3 shadow-[var(--c41-shadow-md)] lg:-mb-9">
              <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border-strong" />
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">Portal do Cliente</p>
              <p className="font-display text-fs-6 font-semibold text-fg">Padaria Bom Grão</p>
              <div className="mt-3 flex flex-col gap-2">
                <div className="rounded-lg border border-border bg-canvas p-2.5 dark:bg-surface">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warning-fg">Pendência</p>
                  <p className="mt-0.5 text-fs-3 font-semibold text-fg">Enviar o extrato de setembro</p>
                  <span className="mt-2 inline-flex h-6 items-center gap-1 rounded-md bg-brand-solid px-2 text-[11px] font-semibold text-on-brand">
                    <FolderInput size={11} className="flex-none" />
                    Responder com o arquivo
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-canvas p-2.5 dark:bg-surface">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">Aprovação</p>
                  <p className="mt-0.5 text-fs-3 font-semibold text-fg">Moinho Sul · R$ 3.120,00</p>
                  <span className="mt-2 flex gap-1.5">
                    <span className="inline-flex h-6 items-center rounded-md border border-border-strong px-2 text-[11px] font-semibold text-fg">Recusar</span>
                    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-brand-solid px-2 text-[11px] font-semibold text-on-brand">
                      <Check size={11} className="flex-none" />
                      Aprovar
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </Cartao>

          <Cartao
            className="lg:col-span-4"
            titulo="Documentos fiscais"
            texto="NF-e, NFC-e, CT-e e NFS-e das empresas atendidas, por empresa e por mês, com o que ainda falta lançar no financeiro."
          >
            <div className={`${MINI} divide-y divide-border`}>
              {[
                { tipo: "NF-e", numero: "4.512", situacao: "Lançada", tom: "bg-success-bg text-success-fg" },
                { tipo: "CT-e", numero: "1.187", situacao: "Pendente", tom: "bg-warning-bg text-warning-fg" },
                { tipo: "NFS-e", numero: "92", situacao: "Pendente", tom: "bg-warning-bg text-warning-fg" },
              ].map((d) => (
                <span key={d.tipo} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="flex w-14 flex-none items-center gap-1.5 font-mono text-[11px] font-medium text-fg">
                    <span className="size-1.5 flex-none rounded-full bg-sector-fiscal" />
                    {d.tipo}
                  </span>
                  <span className="flex-1 text-fs-3 tabular-nums text-fg-secondary">{`nº ${d.numero}`}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${d.tom}`}>{d.situacao}</span>
                </span>
              ))}
            </div>
          </Cartao>

          <Cartao
            className="lg:col-span-4"
            titulo="Financeiro dos clientes"
            texto="Contas a pagar e a receber, conciliação bancária, fluxo de caixa e DRE, com a aprovação do cliente antes de pagar."
          >
            <div className={`${MINI} px-3.5 pb-2.5 pt-3`}>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">DRE · resultado do mês</p>
              <span className="mt-3 flex h-[84px] items-end gap-2">
                {[46, 58, 52, 70, 63, 84].map((altura, i, todas) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t-[5px]"
                    style={{
                      height: `${altura}%`,
                      background:
                        i === todas.length - 1
                          ? "linear-gradient(var(--c41-grafico-coluna-destaque-topo), var(--c41-grafico-coluna-destaque-base))"
                          : "linear-gradient(var(--c41-grafico-coluna-topo), var(--c41-grafico-coluna-base))",
                    }}
                  />
                ))}
              </span>
              <span className="mt-1.5 flex gap-2 font-mono text-[10px] text-fg-muted">
                {["abr", "mai", "jun", "jul", "ago", "set"].map((mes) => (
                  <span key={mes} className="flex-1 text-center">
                    {mes}
                  </span>
                ))}
              </span>
            </div>
          </Cartao>

          <Cartao
            className="lg:col-span-4"
            titulo="Processos societários"
            texto="Abertura, alteração e baixa de empresas, com etapas, exigências e prazos contados em dias úteis."
          >
            <div className={`${MINI} px-3.5 py-3`}>
              {[
                { etapa: "Viabilidade", situacao: "Concluída", feito: true },
                { etapa: "Registro na Junta", situacao: "Em exigência · 3 dias úteis", atual: true },
                { etapa: "Alvará", situacao: "Aguardando" },
              ].map((e, i, todas) => (
                <span key={e.etapa} className="relative flex gap-3 pb-3 last:pb-0">
                  {/* O fio que liga uma etapa à outra. */}
                  {i < todas.length - 1 && <span className="absolute bottom-0 left-[9px] top-5 w-px bg-border-strong" />}
                  <span
                    className={`relative mt-0.5 flex size-[19px] flex-none items-center justify-center rounded-full ${
                      e.feito
                        ? "bg-brand-solid text-on-brand"
                        : e.atual
                          ? "border-2 border-sector-societario bg-surface-elevated"
                          : "border-2 border-border-strong bg-surface-elevated"
                    }`}
                  >
                    {e.feito && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-fs-3 font-semibold text-fg">{e.etapa}</span>
                    <span className={`block text-[11.5px] ${e.atual ? "text-warning-fg" : "text-fg-muted"}`}>{e.situacao}</span>
                  </span>
                </span>
              ))}
            </div>
          </Cartao>

          <Cartao
            className="lg:col-span-4"
            titulo="Arquivos"
            texto="As pastas de cada empresa e o que o cliente mandou pelo portal, com o aviso do que ninguém da equipe abriu ainda."
          >
            <div className={`${MINI} divide-y divide-border`}>
              {[
                { pasta: "Padaria Bom Grão", nota: "2 novos", novo: true },
                { pasta: "Transportes Modelo", nota: "48" },
                { pasta: "Documentos internos", nota: "17" },
              ].map((p) => (
                <span key={p.pasta} className="flex items-center gap-2.5 px-3 py-2">
                  <Folder size={15} className="flex-none text-brand" />
                  <span className="min-w-0 flex-1 truncate text-fs-3 font-medium text-fg">{p.pasta}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                      p.novo ? "bg-warning-bg text-warning-fg" : "bg-canvas text-fg-muted dark:bg-surface"
                    }`}
                  >
                    {p.nota}
                  </span>
                </span>
              ))}
            </div>
          </Cartao>

          <Cartao
            className="lg:col-span-4"
            titulo="WhatsApp do Recrutamento"
            texto="Um número próprio do Recrutamento: um assistente virtual responde o candidato sobre o processo e as vagas abertas, e chama uma pessoa quando a pergunta pede."
          >
            <div className="flex flex-col gap-2">
              <span className="max-w-[80%] self-start rounded-xl rounded-bl-sm border border-border bg-surface-elevated px-3 py-2 text-fs-3 text-fg">
                Oi! Em que etapa está a minha candidatura?
              </span>
              <span
                className="max-w-[85%] self-end rounded-xl rounded-br-sm px-3 py-2 text-fs-3 text-fg"
                style={{ background: "color-mix(in srgb, var(--c41-sector-recrutamento) 16%, var(--c41-surface-elevated))" }}
              >
                Oi, Diego! Você está na etapa de entrevista da vaga de Assistente Fiscal.
              </span>
              <span className="self-end font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">Assistente virtual</span>
            </div>
          </Cartao>

          <Cartao
            className="md:col-span-2 lg:col-span-4"
            titulo="Agenda e integrações"
            texto="Agenda, tarefas e o Meu dia, com a opção de conectar o Google Agenda para marcar reuniões. E integrações com outros sistemas:"
          >
            <ul className="flex flex-wrap gap-1.5">
              {INTEGRACOES.map((nome) => (
                <li key={nome} className="rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-fs-3 font-medium text-fg-secondary">
                  {nome}
                </li>
              ))}
            </ul>
            <span className={`${MINI} mt-2 flex items-center gap-2.5 px-3 py-2`}>
              <CalendarDays size={15} className="flex-none text-brand" />
              <span className="flex-1 truncate text-fs-3 font-medium text-fg">Reunião com cliente</span>
              <span className="rounded-md bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-brand">14:30</span>
            </span>
          </Cartao>
        </ul>
      </div>
    </section>
  );
}
