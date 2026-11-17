import { describe, expect, it } from 'vitest';
import { caminhoEmExClientes, classificarExClientes, ehPastaDeExClientes, resumirForaDaAuditoria } from './auditExClientes';

describe('ehPastaDeExClientes', () => {
  it.each([
    'Ex Clientes',
    'EX CLIENTES',
    'Ex-Clientes',
    'Ex clientes',
    'ex_clientes',
    'Ex Cliente',
    'EXCLIENTES',
    '009_EMPRESAS EX CLIENTES',
    '009 - Empresas Ex-Clientes',
    '  Ex   Clientes  ',
    'Éx Clientes',
  ])('é a pasta de ex-clientes: "%s"', (nome) => {
    expect(ehPastaDeExClientes(nome)).toBe(true);
  });

  it.each([
    'ALFA TRANSPORTES LTDA',
    'REX CLIENTES LTDA',
    'CLIENTES EX',
    'EXPRESSO CLIENTES LTDA',
    'NOVOS CLIENTES',
    'EXTRA',
  ])('não é: "%s"', (nome) => {
    expect(ehPastaDeExClientes(nome)).toBe(false);
  });
});

describe('caminhoEmExClientes', () => {
  it('olha só as pastas do caminho, em qualquer nível', () => {
    expect(caminhoEmExClientes('CONTRATO DE SERVIÇOS/ex-clientes/termo.pdf')).toBe(true);
    expect(caminhoEmExClientes('Ex Clientes\\BETA LTDA\\contrato.pdf')).toBe(true);
    expect(caminhoEmExClientes('CONTRATO DE SERVIÇOS/termo.pdf')).toBe(false);
    expect(caminhoEmExClientes('CONTRATO DE SERVIÇOS/Ex Clientes.pdf')).toBe(false);
  });
});

const empresas = [
  { id: 'alfa',  razaoSocial: 'ALFA TRANSPORTES LTDA',          cnpj: '11.111.111/0001-11' },
  { id: 'beta',  razaoSocial: 'BETA COMERCIO DE PECAS LTDA',    cnpj: '22.222.222/0001-22' },
  { id: 'gama',  razaoSocial: 'GAMA MANUTENCOES LTDA',          cnpj: '33.333.333/0001-33' },
  { id: 'del1',  razaoSocial: 'DELTA LOGISTICA LTDA',           cnpj: '44.444.444/0001-44' },
  { id: 'del12', razaoSocial: 'DELTA LOGISTICA LTDA',           cnpj: '44.444.444/0012-44' },
  { id: 'eps',   razaoSocial: 'EPSILON TRANSPORTES LTDA',       cnpj: '55.555.555/0001-55' },
];
const comPastaAtiva = new Set(['gama']);
const classificar = (pastas: string[]) => classificarExClientes(pastas, empresas, (id) => comPastaAtiva.has(id));

describe('classificarExClientes', () => {
  it('pasta só em Ex Clientes tira a empresa; com pasta ativa também, fica com aviso', () => {
    const r = classificar(['ALFA TRANSPORTES LTDA', 'GAMA MANUTENCOES LTDA']);
    expect([...r.fora]).toEqual([['alfa', 'ALFA TRANSPORTES LTDA']]);
    expect([...r.aviso]).toEqual([['gama', 'GAMA MANUTENCOES LTDA']]);
  });

  it('casa como o vínculo automático: acento, "LTDA" e "- 1 MATRIZ"', () => {
    const r = classificar(['ALFA TRANSPORTES', 'BETA COMÉRCIO DE PEÇAS LTDA - 1 MATRIZ']);
    expect([...r.fora.keys()].sort()).toEqual(['alfa', 'beta']);
  });

  it('filial pela ordem do CNPJ; nome repetido sem filial não tira ninguém', () => {
    expect([...classificar(['DELTA LOGISTICA LTDA - 12 FILIAL']).fora.keys()]).toEqual(['del12']);
    expect(classificar(['DELTA LOGISTICA LTDA']).fora.size).toBe(0);
  });

  it('nome só parecido não tira ninguém (sem falso positivo)', () => {
    expect(classificar(['NEOEPSILON TRANSPORTES LTDA', 'PASTA QUALQUER']).fora.size).toBe(0);
  });

  it('lista vazia não tira ninguém', () => {
    const r = classificar([]);
    expect(r.fora.size + r.aviso.size).toBe(0);
  });

  it('o resumo lista quem saiu, em ordem de nome', () => {
    const r = classificar(['BETA COMERCIO DE PECAS', 'ALFA TRANSPORTES LTDA']);
    const linhas = empresas.map((e) => ({ id: e.id, razao_social: e.razaoSocial, cnpj: e.cnpj }));
    expect(resumirForaDaAuditoria(r, linhas).map((e) => e.id)).toEqual(['alfa', 'beta']);
  });
});
