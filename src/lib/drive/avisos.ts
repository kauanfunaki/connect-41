// Os avisos dos Arquivos: para a equipe quando o cliente manda arquivo pelo
// portal, e para o cliente quando a equipe compartilha uma pasta e pede para
// avisar. Best-effort, como todo aviso: o arquivo já está gravado quando o
// aviso sai, e uma falha aqui não desfaz nada.

import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser, type NotifyInput } from "@/lib/notifications";
import { setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { nomeExibicao } from "@/lib/companyName";
import { usuariosDoPortalDaEmpresa } from "@/lib/financeiro/pendencias/avisos";
import { sendArquivosCompartilhadosEmail } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";
import { MODULO_ARQUIVOS, textoDoEnvioDoCliente } from "./regras";

/**
 * Avisa quem cuida da empresa que o cliente mandou arquivos: os responsáveis
 * de cada setor (CompanyService ativo) e o responsável da empresa. Sem nenhum
 * deles, o setor que opera o módulo.
 */
export async function avisarEquipeDoEnvio(input: {
  tenantId: string;
  companyId: string;
  quantidade: number;
  quem: string;
}): Promise<void> {
  try {
    const prisma = getPrisma();
    const [empresa, servicos] = await Promise.all([
      prisma.company.findFirst({
        where: { id: input.companyId, tenantId: input.tenantId },
        select: { name: true, displayName: true, responsibleUserId: true },
      }),
      prisma.companyService.findMany({
        where: { tenantId: input.tenantId, companyId: input.companyId, status: "ACTIVE", responsibleUserId: { not: null } },
        select: { responsibleUserId: true },
      }),
    ]);
    if (!empresa) return;
    const aviso: NotifyInput = {
      tenantId: input.tenantId,
      type: "ARQUIVO_DO_CLIENTE",
      message: textoDoEnvioDoCliente({ quem: input.quem, quantidade: input.quantidade, empresa: nomeExibicao(empresa) }),
      entityType: "COMPANY",
      entityId: input.companyId,
    };
    const ids = new Set(servicos.map((s) => s.responsibleUserId!).concat(empresa.responsibleUserId ?? []));
    if (ids.size > 0) {
      await Promise.all([...ids].map((id) => notifyUser(id, aviso)));
      return;
    }
    const setor =
      (await setorDoModulo(input.tenantId, MODULO_ARQUIVOS)) ?? getModuleDef(MODULO_ARQUIVOS)?.sectorCode ?? null;
    if (setor) await notifySector(setor, aviso);
  } catch (err) {
    console.error("[drive] aviso à equipe", input.companyId, err);
  }
}

/**
 * Avisa os usuários do portal da empresa que há arquivos numa pasta
 * compartilhada: e-mail com o nome da pasta, push só com a empresa. Devolve a
 * frase para a tela quando algo não saiu, ou `null` quando saiu tudo.
 */
export async function avisarClienteDaPasta(input: {
  tenantId: string;
  companyId: string;
  empresaNome: string;
  pastaId: string;
  pastaNome: string;
}): Promise<{ avisados: number; problema: string | null }> {
  try {
    const destinatarios = await usuariosDoPortalDaEmpresa(input.tenantId, input.companyId);
    if (destinatarios.length === 0) {
      return { avisados: 0, problema: "Ninguém desta empresa tem acesso ativo ao portal: a pasta fica compartilhada até alguém ter." };
    }
    const [envio] = await Promise.all([
      sendArquivosCompartilhadosEmail({
        tenantId: input.tenantId,
        destinatarios: destinatarios.map((u) => ({ email: u.email, nome: u.name })),
        companyId: input.companyId,
        empresaNome: input.empresaNome,
        pastaId: input.pastaId,
        pastaNome: input.pastaNome,
      }),
      avisarClientePorPush(input.tenantId, destinatarios.map((u) => u.id), {
        tipo: "arquivos",
        empresaNome: input.empresaNome,
        companyId: input.companyId,
        pastaId: input.pastaId,
      }),
    ]);
    if (envio.semSmtp) {
      return { avisados: destinatarios.length, problema: "O e-mail deste escritório não está configurado: o cliente só recebe o aviso no celular, se tiver ativado." };
    }
    if (envio.falhas > 0) return { avisados: destinatarios.length, problema: `${envio.falhas} e-mail(s) não saíram. O cliente vê ao entrar no portal.` };
    return { avisados: destinatarios.length, problema: null };
  } catch (err) {
    console.error("[drive] aviso ao cliente", input.pastaId, err);
    return { avisados: 0, problema: "O aviso ao cliente falhou. A pasta continua compartilhada e ele vê ao entrar no portal." };
  }
}
