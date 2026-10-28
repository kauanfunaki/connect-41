"use client";

import { useActionState, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { AparenciaState } from "@/app/(app)/admin/tenant/actions";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SeletorDeCor, PALETA_DO_CONNECT } from "@/components/ui/SeletorDeCor";
import { Switch } from "@/components/ui/Switch";
import { WorkspaceLogoUpload } from "@/components/admin/WorkspaceLogoUpload";
import { PreviaDoPortal } from "@/components/aparencia/PreviaDoPortal";
import {
  GRUPOS,
  GRUPOS_DE_COR,
  avisosDaCor,
  corDoGrupo,
  lerCoresDosGrupos,
  tonsDaCor,
  type Aparencia,
  type GrupoDeCor,
} from "@/lib/aparencia/cores";

// O azul do Connect abre a paleta: é a cor de quem nunca escolheu.
const AZUL_DO_CONNECT = "#1F5EEA";
const PALETA = [AZUL_DO_CONNECT, ...PALETA_DO_CONNECT];

type Props = {
  action: (prev: AparenciaState, form: FormData) => Promise<AparenciaState>;
  inicial: Aparencia;
  tenantId: string;
  escritorio: { nome: string; logoUrl: string | null };
  /** A migration ainda não rodou: dá para ver, não para salvar. */
  bloqueado?: boolean;
};

/**
 * A Aparência do portal em Administração › Empresa (21/10/2026): a cor
 * principal, as cores dos grupos, o logo e a cor no Connect da equipe, com a
 * prévia nos dois temas. Nada vale antes do "Salvar": a prévia mostra a
 * escolha, o portal só muda depois.
 */
export function AparenciaDoPortalForm({ action, inicial, tenantId, escritorio, bloqueado = false }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [usarCor, setUsarCor] = useState(inicial.corPrincipal !== null);
  const [cor, setCor] = useState(inicial.corPrincipal ?? AZUL_DO_CONNECT);
  const [porGrupo, setPorGrupo] = useState(inicial.coresPorGrupo);
  const [cores, setCores] = useState<Record<GrupoDeCor, string>>(() =>
    Object.fromEntries(GRUPOS_DE_COR.map((g) => [g, corDoGrupo(inicial, g)])) as Record<GrupoDeCor, string>
  );
  const [logoUrl, setLogoUrl] = useState(escritorio.logoUrl);
  const [logoNoPortal, setLogoNoPortal] = useState(inicial.logoNoPortal);
  const [noConnect, setNoConnect] = useState(inicial.noConnect);

  const aparencia: Aparencia = {
    corPrincipal: usarCor ? cor : null,
    coresDosGrupos: lerCoresDosGrupos(cores),
    coresPorGrupo: porGrupo,
    logoNoPortal: logoNoPortal && !!logoUrl,
    noConnect: noConnect && usarCor,
  };
  const avisos = usarCor ? avisosDaCor(tonsDaCor(cor)!) : [];

  return (
    <form action={formAction} className="space-y-6">
      {state && "error" in state && <Aviso>{state.error}</Aviso>}
      {state && "success" in state && <Aviso tom="sucesso">Aparência salva. O portal já abre com ela.</Aviso>}

      {/* O que vai no formulário: a cor vazia é o azul do Connect. */}
      <input type="hidden" name="corPrincipal" value={aparencia.corPrincipal ?? ""} />
      {GRUPOS_DE_COR.map((g) => (
        <input key={g} type="hidden" name={`cor_${g}`} value={cores[g]} />
      ))}

      <div className="space-y-3">
        <h3 className="text-label font-semibold text-fg">Cor principal</h3>
        <Switch
          checked={usarCor}
          onCheckedChange={setUsarCor}
          rotulo="Usar a cor do escritório no lugar do azul do Connect"
        />
        {usarCor && (
          <div className="space-y-2">
            <SeletorDeCor valor={cor} onChange={setCor} cores={PALETA} aria-label="Cor principal do portal" />
            <p className="text-helper text-fg-muted">
              Vai nos botões, no item aberto do menu, nos links e no cabeçalho das tabelas do portal.
            </p>
            {avisos.length > 0 && (
              <Aviso tom="info">
                <p className="font-medium">Ajustamos o tom para o texto ficar legível:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Aviso>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <h3 className="text-label font-semibold text-fg">Cores das áreas de uso</h3>
        <Switch name="coresPorGrupo" checked={porGrupo} onCheckedChange={setPorGrupo} rotulo="Uma cor para cada área de uso" />
        <p className="text-helper text-fg-muted">
          Como no Omie, no portal e no Connect da equipe: a cor diz o uso da tela (Finanças, Pessoas, Recrutamento…), não o setor.
          Aparece no ícone de cada item do menu, no traço do título e no cartão do número de cada tela; no Connect da equipe, também na
          linha e na etiqueta do cabeçalho, no título, no botão principal e no cabeçalho das tabelas. Desligado, tudo fica na cor
          principal. Pessoas, Recrutamento e Escritório só aparecem no Connect da equipe.
        </p>
        {porGrupo && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {GRUPOS_DE_COR.map((g) => {
              const trocada = cores[g] !== GRUPOS[g].padrao;
              return (
                <li key={g} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <SeletorDeCor
                    modo="botao"
                    valor={cores[g]}
                    onChange={(c) => setCores((atual) => ({ ...atual, [g]: c }))}
                    aria-label={`Cor de ${GRUPOS[g].rotulo}`}
                  />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-label font-medium text-fg">{GRUPOS[g].rotulo}</p>
                    <p className="text-helper text-fg-muted leading-snug">{GRUPOS[g].telas}</p>
                  </div>
                  {trocada && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCores((atual) => ({ ...atual, [g]: GRUPOS[g].padrao }))}
                    >
                      <RotateCcw size={14} /> Padrão
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <h3 className="text-label font-semibold text-fg">Logo</h3>
        <WorkspaceLogoUpload tenantId={tenantId} tenantName={escritorio.nome} logoUrl={logoUrl} aoTrocar={setLogoUrl} oQue="logo" />
        <Checkbox
          id="logoNoPortal"
          name="logoNoPortal"
          checked={logoNoPortal && !!logoUrl}
          disabled={!logoUrl}
          onChange={(e) => setLogoNoPortal(e.target.checked)}
          label="Mostrar o logo e o nome do escritório no menu do portal"
          // 22/10/2026: o logo e a cor também vão para a entrada do portal e os e-mails ao cliente.
          helper={
            logoUrl
              ? "No lugar do logo do Connect — também na entrada do portal e no topo dos e-mails ao cliente."
              : "Adicione o logo primeiro. O envio vale na hora, sem o Salvar."
          }
        />
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <h3 className="text-label font-semibold text-fg">Connect da equipe</h3>
        <Switch
          name="noConnect"
          checked={noConnect && usarCor}
          onCheckedChange={setNoConnect}
          disabled={!usarCor}
          rotulo="Usar a cor principal também no Connect da equipe"
        />
        <p className="text-helper text-fg-muted">
          Desligado, a equipe segue no azul do Connect onde a tela não tem área de uso. As cores das áreas valem para a equipe de
          qualquer jeito.
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-5">
        <h3 className="text-label font-semibold text-fg">Prévia</h3>
        <PreviaDoPortal aparencia={aparencia} logo={aparencia.logoNoPortal && logoUrl ? { src: logoUrl, nome: escritorio.nome } : null} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || bloqueado}>
          {isPending ? "Salvando…" : "Salvar aparência"}
        </Button>
      </div>
    </form>
  );
}
