"use client";

import { useActionState, useRef, useState } from "react";
import { FileKey, Bot, RefreshCw, Zap } from "lucide-react";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { salvarConexao, type ConexaoState } from "@/app/(app)/admin/integracoes/conexao-actions";
import { campoDispensado, valorDaEscolha } from "@/lib/integracoes/catalogo";
import type { IntegracaoNaTela } from "@/lib/integracoes/data";
import type { Saude } from "@/lib/integracoes/execucao";
import { Aviso } from "@/components/ui/Aviso";
import { ApontarAvisos } from "@/components/admin/ApontarAvisos";

export const SAUDE_LABEL: Record<Saude, string> = {
  nunca_rodou: "Nunca rodou",
  ok: "Em dia",
  com_erro: "Com erro",
  desligada: "Desligada",
  parada: "Parada",
};

// `parada` é warning e não info: é o silêncio — ligada, sem erro, e sem rodar
// há tempo demais. Foi assim que o SPED passou três dias parecendo saudável.
// `desligada` é neutra (07/10/2026): saiu de cena, não é aviso.
export const SAUDE_VARIANTE: Record<Saude, "success" | "warning" | "danger" | "info" | "neutral"> = {
  nunca_rodou: "info",
  ok: "success",
  com_erro: "danger",
  desligada: "neutral",
  parada: "warning",
};

/** O ícone da natureza: varre e traz, opera um site, chamada pontual. */
export const ICONE = {
  SYNC: RefreshCw,
  ROBO: Bot,
  API: Zap,
} as const;

const NATUREZA_LABEL = {
  SYNC: "varre e traz dado",
  ROBO: "opera um site no seu lugar",
  API: "chamada pontual",
} as const;

/**
 * A configuração de uma integração do catálogo, no painel do "Configurar"
 * (escolha 6A dos Ajustes de 15/10, 20/10/2026): o que ela é, a situação, o que
 * falta, o webhook e o formulário das credenciais. Era um cartão da vitrine,
 * empilhado com os outros, com o formulário abrindo dentro dele.
 *
 * `soLigar`: só o "Conexão ligada" — para quem tem formulário próprio das
 * credenciais (o Chatwoot), e aqui só liga e desliga. Os campos não vão no
 * envio, e o que está guardado fica como estava (`mesclarConfig`).
 */
export function ConfiguracaoDaIntegracao({
  integracao: i,
  urlPublica,
  setor,
  soLigar = false,
}: {
  integracao: IntegracaoNaTela;
  /** `APP_PUBLIC_URL`, vinda do servidor por prop — `NEXT_PUBLIC_` não chega ao build do container. */
  urlPublica: string | null;
  /** O nome do setor da integração ("Recrutamento"), e não o código. */
  setor?: string | null;
  soLigar?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ConexaoState, FormData>(salvarConexao, null);
  // Os campos de escolha, como estão no formulário: outro campo pode sair por
  // causa deles (na demonstração do Serpro não há chave nem certificado —
  // 20/10/2026).
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() =>
    Object.fromEntries(i.campos.filter((c) => c.type === "escolha").map((c) => [c.name, valorDaEscolha(c, i.valores)]))
  );
  const Icone = ICONE[i.natureza];

  return (
    <section className="flex flex-col gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Icone size={16} className="text-fg-muted shrink-0" />
          {i.conectada ? (
            <Selo tom={tomDaVariante(SAUDE_VARIANTE[i.saude])}>{SAUDE_LABEL[i.saude]}</Selo>
          ) : (
            <Selo tom="neutro">não conectada</Selo>
          )}
        </div>
        {!soLigar && <p className="text-fs-3 text-fg-secondary mt-2">{i.description}</p>}
        <p className="text-fs-1 text-fg-muted mt-1">
          {i.vendor} · {NATUREZA_LABEL[i.natureza]}
          {setor && ` · setor ${setor}`}
          {i.nomeDoCliente && ` · ${i.nomeDoCliente}`}
        </p>
      </div>

      {/* A configuração incompleta é o estado mais comum e o menos explicado:
          "não funciona" sem dizer qual campo falta faz a pessoa tentar de novo
          igual. */}
      {!soLigar && i.conectada && i.faltando.length > 0 && (
        <Aviso tom="atencao">
          Falta preencher: {i.faltando.join(", ")}.
        </Aviso>
      )}

      {/* A URL que se cadastra do outro lado (Meta, Evolution). Sem ela, quem
          configura precisaria descobrir o id da conexão no banco. */}
      {!soLigar && i.caminhoDoWebhook && (
        <p className="text-fs-2 text-fg-secondary break-all">
          <span className="text-fg-muted">URL do webhook: </span>
          <code className="text-fg">
            {urlPublica ? `${urlPublica.replace(/\/+$/, "")}${i.caminhoDoWebhook}` : i.caminhoDoWebhook}
          </code>
          {!urlPublica && (
            <span className="text-warning-fg"> — APP_PUBLIC_URL não configurada: complete com o domínio do Connect</span>
          )}
        </p>
      )}
      {/* Na Evolution, o Connect troca o endereço lá sozinho (21/10); na Meta,
          a URL é do app, no painel de desenvolvedor. */}
      {!soLigar && i.caminhoDoWebhook && urlPublica && i.id && i.code === "whatsapp_recrutamento_evolution" && (
        <div>
          <ApontarAvisos alvo={{ tipo: "whatsapp", integrationId: i.id }} />
        </div>
      )}

      {i.lastError && (
        <Aviso className="break-words">
          Último erro: {i.lastError}
        </Aviso>
      )}

      <form action={formAction} className="border-t border-border-soft pt-3 flex flex-col gap-3">
        <input type="hidden" name="code" value={i.code} />
        <input type="hidden" name="instanceKey" value={i.instanceKey} />

        {state && "error" in state && (
          <Aviso>
            {state.error}
          </Aviso>
        )}
        {state && "success" in state && (
          <Aviso tom="sucesso">
            Conexão salva.
          </Aviso>
        )}

        {!soLigar && (
          <FieldGrid>
            {i.campos.map((c) => {
              const guardado = i.segredosGuardados.includes(c.name);
              // Campo dispensado sai do formulário: o que estava guardado
              // continua guardado (campo que não vem fica como estava).
              if (campoDispensado(i.campos, c, escolhas)) return null;
              return (
                <CampoForm
                  key={c.name}
                  label={c.label}
                  htmlFor={`${i.code}-${c.name}`}
                  required={c.required && !guardado}
                  helper={
                    // Segredo guardado nunca volta para a tela. Dizer "preenchido"
                    // é o que impede alguém de reescrevê-lo sem precisar — e é o
                    // que faz "deixar em branco" significar "mantenha".
                    guardado ? `Guardado. Deixe em branco para manter. ${c.help ?? ""}` : c.help
                  }
                >
                  {c.type === "certificado" ? (
                    <CampoDeCertificado id={`${i.code}-${c.name}`} name={c.name} guardado={guardado} />
                  ) : c.type === "escolha" ? (
                    <Select
                      id={`${i.code}-${c.name}`}
                      name={c.name}
                      value={escolhas[c.name] ?? ""}
                      onChange={(e) => setEscolhas((atual) => ({ ...atual, [c.name]: e.target.value }))}
                    >
                      {c.opcoes?.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={`${i.code}-${c.name}`}
                      name={c.name}
                      type={c.type === "secret" ? "password" : c.type === "url" ? "url" : "text"}
                      autoComplete="off"
                      defaultValue={i.valores[c.name] ?? ""}
                      placeholder={guardado ? "•••• (preenchido)" : ""}
                    />
                )}
              </CampoForm>
            );
          })}
        </FieldGrid>
        )}

        <Checkbox id={`${i.code}-enabled`} name="enabled" defaultChecked={i.enabled} label="Conexão ligada"
          helper={
            <>
              {/* Integração nunca nasce ligada: ligar significa começar a falar
              com sistema de terceiro usando credencial de alguém. */}
              Desligada, nada é enviado nem buscado. Ligar é ato deliberado.
            </>
          }
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-soft">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando…" : i.conectada ? "Salvar" : "Conectar"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * O .pfx do certificado A1. Vai no próprio formulário (o arquivo segue no
 * FormData) e nunca volta para a tela: guardado, aparece só como "guardado".
 */
function CampoDeCertificado({ id, name, guardado }: { id: string; name: string; guardado: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 min-h-9">
      <input
        ref={entrada}
        id={id}
        name={name}
        type="file"
        accept=".pfx,.p12,application/x-pkcs12"
        className="sr-only"
        onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? null)}
      />
      <Button type="button" variant="secondary" size="sm" onClick={() => entrada.current?.click()}>
        <FileKey size={14} /> {arquivo || guardado ? "Trocar arquivo" : "Escolher arquivo"}
      </Button>
      <span className="text-ui text-fg-muted truncate min-w-0">{arquivo ?? (guardado ? "Certificado guardado" : "Nenhum arquivo")}</span>
    </div>
  );
}
