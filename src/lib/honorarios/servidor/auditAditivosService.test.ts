import { describe, expect, it } from 'vitest';
import { filtrarEmpresas, type EmpresaAditivo } from './auditAditivosService';
import type { StatusAditivo } from '../regras/auditAditivosStatus';

function empresa(
  razaoSocial: string,
  status: StatusAditivo,
  extra: { responsavel?: string | null; cnpj?: string; pasta?: string; alerta?: boolean } = {},
): EmpresaAditivo {
  return {
    empresa: { id: razaoSocial, razaoSocial, cnpj: extra.cnpj ?? '11.111.111/0001-11', responsavel: extra.responsavel ?? null },
    status,
    emDia: status === 'ASSINADO_DIGITAL' || status === 'ASSINADO_PELO_NOME',
    pastas: extra.pasta ? [{ nomePasta: extra.pasta, subpastasContrato: [] }] : [],
    aditivosDoAno: [], outrosAditivos: [], ultimoAnoComAditivo: null, decimoTerceiro: null,
    geradosNoApp: 0, ultimoGeradoNoApp: null,
    alertas: extra.alerta ? ['gerado_no_app_sem_arquivo'] : [],
    distrato: null,
  };
}

const lista = [
  empresa('BRIOFLEX LTDA', 'ASSINADO_DIGITAL', { responsavel: 'Ana', pasta: 'BRIOFLEX LTDA' }),
  empresa('XPT LOGÍSTICA LTDA', 'PDF_SEM_ASSINATURA', { responsavel: 'Bia', cnpj: '49.306.158/0012-36', pasta: 'XPT LOGÍSTICA LTDA - 12 FILIAL' }),
  empresa('GOVAL LOGISTICA', 'ASSINADO_PELO_NOME'),
  empresa('41 CONSULTORIA LTDA', 'SEM_ADITIVO', { alerta: true }),
];
const nomes = (r: EmpresaAditivo[]) => r.map((e) => e.empresa.razaoSocial);

describe('filtrarEmpresas', () => {
  it('sem filtro devolve tudo', () => {
    expect(filtrarEmpresas(lista, {})).toHaveLength(4);
  });

  it('em dia e pendente seguem a decisão 4 (pelo nome conta como em dia)', () => {
    expect(nomes(filtrarEmpresas(lista, { status: 'em_dia' }))).toEqual(['BRIOFLEX LTDA', 'GOVAL LOGISTICA']);
    expect(nomes(filtrarEmpresas(lista, { status: 'pendente' }))).toEqual(['XPT LOGÍSTICA LTDA', '41 CONSULTORIA LTDA']);
  });

  it('status exato', () => {
    expect(nomes(filtrarEmpresas(lista, { status: 'SEM_ADITIVO' }))).toEqual(['41 CONSULTORIA LTDA']);
  });

  it('responsável, inclusive "sem responsável"', () => {
    expect(nomes(filtrarEmpresas(lista, { responsavel: 'Bia' }))).toEqual(['XPT LOGÍSTICA LTDA']);
    expect(nomes(filtrarEmpresas(lista, { responsavel: '__none__' }))).toEqual(['GOVAL LOGISTICA', '41 CONSULTORIA LTDA']);
  });

  it('busca sem acento por nome, por pasta e por CNPJ', () => {
    expect(nomes(filtrarEmpresas(lista, { busca: 'logistica' }))).toEqual(['XPT LOGÍSTICA LTDA', 'GOVAL LOGISTICA']);
    expect(nomes(filtrarEmpresas(lista, { busca: '12 filial' }))).toEqual(['XPT LOGÍSTICA LTDA']);
    expect(nomes(filtrarEmpresas(lista, { busca: '49.306.158' }))).toEqual(['XPT LOGÍSTICA LTDA']);
  });

  it('só com alerta', () => {
    expect(nomes(filtrarEmpresas(lista, { soAlerta: true }))).toEqual(['41 CONSULTORIA LTDA']);
  });
});

describe('filtrarEmpresas — 13º', () => {
  const com13 = (nome: string, assinado: boolean): EmpresaAditivo => ({
    ...empresa(nome, 'ASSINADO_DIGITAL'),
    decimoTerceiro: { situacao: assinado ? 'ASSINADO_DIGITAL' : 'PDF_SEM_ASSINATURA', assinado, arquivos: [] },
  });
  const l = [com13('A', true), com13('B', false), empresa('C', 'ASSINADO_DIGITAL')];

  it('"com" traz só quem tem 13º no ano; quem não tem não é pendência', () => {
    expect(nomes(filtrarEmpresas(l, { decimo: 'com' }))).toEqual(['A', 'B']);
  });

  it('"pendente" traz só quem tem 13º ainda sem assinatura', () => {
    expect(nomes(filtrarEmpresas(l, { decimo: 'pendente' }))).toEqual(['B']);
  });
});
