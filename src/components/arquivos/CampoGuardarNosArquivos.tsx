"use client";

import { useEffect, useState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { CAMPO_DA_PASTA, type DestinoNaTela } from "@/lib/drive/tela";
import { destinosParaGuardar } from "@/app/(app)/arquivos/actions";

/**
 * "Guardar também em Arquivos" (09/10/2026): escolhe uma pasta da empresa para
 * guardar uma cópia do que está sendo anexado. O anexo continua no módulo.
 *
 * Com `destinos` vindo do servidor (a tela já sabe a empresa), mostra direto;
 * sem eles, busca as pastas quando a empresa muda (formulários em que a empresa
 * é escolhida na hora). Com os Arquivos desligados, o campo não aparece.
 */
export function CampoGuardarNosArquivos({
  companyId,
  destinos: iniciais,
  id = "guardar-em-pasta",
}: {
  companyId: string | null;
  destinos?: DestinoNaTela[] | null;
  id?: string;
}) {
  const [buscados, setBuscados] = useState<{ companyId: string; destinos: DestinoNaTela[] | null } | null>(null);

  useEffect(() => {
    if (iniciais !== undefined || !companyId) return;
    let vivo = true;
    destinosParaGuardar(companyId)
      .then((d) => vivo && setBuscados({ companyId, destinos: d }))
      .catch(() => vivo && setBuscados({ companyId, destinos: null }));
    return () => {
      vivo = false;
    };
  }, [companyId, iniciais]);

  const destinos = iniciais !== undefined ? iniciais : buscados?.companyId === companyId ? buscados.destinos : null;
  if (!companyId || !destinos || destinos.length === 0) return null;

  return (
    <CampoForm
      label="Guardar também em Arquivos"
      htmlFor={id}
      helper="Uma cópia vai para a pasta escolhida da empresa. O anexo continua aqui."
    >
      <Select id={id} name={CAMPO_DA_PASTA} defaultValue="" key={companyId}>
        <option value="">Não guardar</option>
        {destinos.map((d) => (
          <option key={d.id} value={d.id}>
            {d.rotulo}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}
