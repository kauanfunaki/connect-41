"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { Switch } from "@/components/ui/Switch";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoData } from "@/components/ui/CampoData";
import type { DestinoNaTela, SetorNaTela } from "@/lib/drive/tela";

type Fechar = { open: boolean; onClose: () => void };

function Rodape({ onClose, pendente, rotulo, desabilitado }: { onClose: () => void; pendente: boolean; rotulo: string; desabilitado?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pendente}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" loading={pendente} disabled={desabilitado}>
        {rotulo}
      </Button>
    </div>
  );
}

/** Criar pasta ou renomear (pasta ou arquivo). O setor só aparece ao criar, quando há setor a escolher. */
export function DialogoDeNome({
  open,
  onClose,
  titulo,
  rotulo,
  inicial = "",
  setores,
  erro,
  pendente,
  onSalvar,
}: Fechar & {
  titulo: string;
  rotulo: string;
  inicial?: string;
  setores?: SetorNaTela[];
  erro: string | null;
  pendente: boolean;
  onSalvar: (nome: string, setor: string | null) => void;
}) {
  const [nome, setNome] = useState(inicial);
  const [setor, setSetor] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(nome, setor || null);
        }}
      >
        <CampoForm label="Nome" htmlFor="drive-nome" required>
          <Input id="drive-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} autoFocus />
        </CampoForm>
        {setores && setores.length > 0 && (
          <CampoForm
            label="Quem vê"
            htmlFor="drive-setor"
            helper="Pasta de um setor só aparece para quem é do setor — vale para tudo que estiver dentro dela."
          >
            <Select id="drive-setor" value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Todos que veem a empresa</option>
              {setores.map((s) => (
                <option key={s.code} value={s.code}>
                  Só {s.label}
                </option>
              ))}
            </Select>
          </CampoForm>
        )}
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <Rodape onClose={onClose} pendente={pendente} rotulo={rotulo} desabilitado={!nome.trim()} />
      </form>
    </Modal>
  );
}

/** O vencimento de um arquivo (contrato, procuração, certidão). Vazio tira o vencimento. */
export function DialogoDeVencimento({
  open,
  onClose,
  arquivoNome,
  atual,
  erro,
  pendente,
  onSalvar,
}: Fechar & { arquivoNome: string; atual: string | null; erro: string | null; pendente: boolean; onSalvar: (data: string | null) => void }) {
  const [data, setData] = useState(atual ?? "");
  return (
    <Modal open={open} onClose={onClose} title="Vencimento">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(data || null);
        }}
      >
        <p className="text-fs-3 text-fg-secondary truncate">{arquivoNome}</p>
        <CampoForm
          label="Vence em"
          htmlFor="drive-vencimento"
          helper="Quem cuida da empresa é avisado 30 dias antes e no dia. Deixe em branco para tirar o vencimento."
        >
          <CampoData id="drive-vencimento" value={data} onChange={setData} />
        </CampoForm>
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <Rodape onClose={onClose} pendente={pendente} rotulo="Salvar" />
      </form>
    </Modal>
  );
}

/** Restringir a pasta a um setor, ou abrir para todos. */
export function DialogoDeSetor({
  open,
  onClose,
  setores,
  atual,
  erro,
  pendente,
  onSalvar,
}: Fechar & { setores: SetorNaTela[]; atual: string | null; erro: string | null; pendente: boolean; onSalvar: (setor: string | null) => void }) {
  const [setor, setSetor] = useState(atual ?? "");
  return (
    <Modal open={open} onClose={onClose} title="Quem vê esta pasta">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(setor || null);
        }}
      >
        <CampoForm label="Quem vê" htmlFor="drive-setor-pasta" helper="Vale para tudo que está dentro da pasta.">
          <Select id="drive-setor-pasta" value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos que veem a empresa</option>
            {setores.map((s) => (
              <option key={s.code} value={s.code}>
                Só {s.label}
              </option>
            ))}
          </Select>
        </CampoForm>
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <Rodape onClose={onClose} pendente={pendente} rotulo="Salvar" />
      </form>
    </Modal>
  );
}

/**
 * Mover para outra pasta do mesmo lugar (da mesma empresa, ou das internas).
 * Pasta pode ir para o primeiro nível; arquivo precisa de uma pasta. A lista já
 * vem só com as pastas onde quem move pode mexer, e uma pasta nunca é oferecida
 * como destino dela mesma ou de algo que está dentro dela.
 */
export function DialogoDeMover({
  open,
  onClose,
  oQue,
  destinos,
  pastaMovida,
  atual,
  erro,
  pendente,
  onSalvar,
}: Fechar & {
  oQue: "pasta" | "arquivo";
  destinos: DestinoNaTela[];
  /** Quando é pasta: o id dela, para tirar ela e o que está dentro da lista. */
  pastaMovida?: string;
  atual: string | null;
  erro: string | null;
  pendente: boolean;
  onSalvar: (destino: string | null) => void;
}) {
  const opcoes = destinos.filter((d) => !pastaMovida || !d.caminhoIds.includes(pastaMovida));
  const [destino, setDestino] = useState<string>(atual ?? (oQue === "pasta" ? "" : opcoes[0]?.id ?? ""));
  return (
    <Modal open={open} onClose={onClose} title={oQue === "pasta" ? "Mover pasta" : "Mover arquivo"} maxWidth="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(destino || null);
        }}
      >
        <CampoForm label="Para" htmlFor="drive-destino">
          <Select id="drive-destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
            {oQue === "pasta" && <option value="">Primeiro nível</option>}
            {opcoes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </Select>
        </CampoForm>
        {opcoes.length === 0 && oQue === "arquivo" && (
          <p className="text-fs-3 text-fg-muted">Não há outra pasta onde você possa pôr o arquivo.</p>
        )}
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <Rodape onClose={onClose} pendente={pendente} rotulo="Mover" desabilitado={oQue === "arquivo" && !destino} />
      </form>
    </Modal>
  );
}

/** "Guardar numa pasta", no Do Connect: escolhe a pasta da empresa onde vai a cópia. */
export function DialogoDeGuardar({
  open,
  onClose,
  arquivoNome,
  destinos,
  erro,
  pendente,
  onSalvar,
}: Fechar & { arquivoNome: string; destinos: DestinoNaTela[]; erro: string | null; pendente: boolean; onSalvar: (pastaId: string) => void }) {
  const [destino, setDestino] = useState(destinos[0]?.id ?? "");
  return (
    <Modal open={open} onClose={onClose} title="Guardar numa pasta" maxWidth="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (destino) onSalvar(destino);
        }}
      >
        <p className="text-fs-3 text-fg-secondary">
          Uma cópia de <strong className="text-fg">{arquivoNome}</strong> vai para a pasta escolhida. O anexo continua onde está.
        </p>
        <CampoForm label="Pasta" htmlFor="drive-guardar">
          <Select id="drive-guardar" value={destino} onChange={(e) => setDestino(e.target.value)}>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </Select>
        </CampoForm>
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <Rodape onClose={onClose} pendente={pendente} rotulo="Guardar" desabilitado={!destino} />
      </form>
    </Modal>
  );
}

/**
 * Compartilhar com o cliente no portal. Herda para baixo: compartilhar
 * "Fiscal" mostra ao cliente "Fiscal" e tudo que está dentro. Avisar é
 * opcional e sai por e-mail (com o nome da pasta) e no celular (só a empresa).
 */
export function DialogoDeCompartilhar({
  open,
  onClose,
  pastaNome,
  compartilhada,
  compartilhadaPor,
  fixa,
  erro,
  pendente,
  onSalvar,
}: Fechar & {
  pastaNome: string;
  compartilhada: boolean;
  compartilhadaPor: string | null;
  /** "Enviados pelo cliente": sempre compartilhada, só dá para avisar. */
  fixa: boolean;
  erro: string | null;
  pendente: boolean;
  onSalvar: (compartilhar: boolean, avisar: boolean) => void;
}) {
  const [ligado, setLigado] = useState(compartilhada);
  const [avisar, setAvisar] = useState(false);
  const clienteVe = ligado || compartilhadaPor !== null;
  return (
    <Modal open={open} onClose={onClose} title="Compartilhar com o cliente" maxWidth="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(ligado, avisar);
        }}
      >
        <Switch
          id="drive-compartilhar"
          checked={ligado}
          onCheckedChange={setLigado}
          disabled={fixa}
          rotulo={`Mostrar “${pastaNome}” no portal do cliente`}
        />
        <p className="text-fs-3 text-fg-secondary">
          {fixa
            ? "Esta pasta fica sempre no portal: é onde cai o que o cliente envia."
            : compartilhadaPor
              ? `O cliente já vê esta pasta porque “${compartilhadaPor}”, acima dela, está compartilhada.`
              : "O cliente vê a pasta e tudo que está dentro dela, e pode baixar os arquivos. Ele não muda nem apaga nada."}
        </p>
        {clienteVe && (
          <Checkbox
            id="drive-avisar"
            checked={avisar}
            onChange={(e) => setAvisar(e.target.checked)}
            label="Avisar o cliente agora"
            helper="E-mail para quem tem acesso ao portal desta empresa, e aviso no celular de quem ativou."
          />
        )}
        {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
        <Rodape onClose={onClose} pendente={pendente} rotulo={avisar ? "Salvar e avisar" : "Salvar"} />
      </form>
    </Modal>
  );
}
