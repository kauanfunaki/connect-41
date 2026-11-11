"""Gabarito do cruzamento razão × extrato e da composição SISPAG do Contábil Core (11/11/2026).

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) que exercitam `conciliar`,
`especie_de_aplicacao`, `compor_sispag`, `compor_por_valores_sispag` e `indicar_parcelas_iguais`, e
grava cada chamada com a entrada e a saída exatas. Depois gera MUITOS casos inventados, aleatórios
com semente fixa (mesmos dias e valores repetidos, lotes, sobras, valores próximos, janelas de dias,
históricos parecidos), porque o cruzamento é onde desempate errado passa despercebido. O porte em
TypeScript repete as chamadas (`src/lib/contabil-core/conciliacao/*.test.ts`).

Dados: nomes com cara de reais vêm da variável GABARITO_NOMES ("REAL=FICTICIO;Real=Ficticio"),
fora do git, e CNPJs viram fictícios; a chamada é REPETIDA com a entrada trocada, e o que vai para o
gabarito é a saída da entrada fictícia. Ids de UUID (os da transação no banco de teste) viram
"u1", "u2"… para o arquivo sair igual a cada execução.

Uso, a partir da raiz do contabil-core, com pytest e as dependências do projeto:
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/conciliacao/gabarito \
        python -W ignore -m pytest -q -p gabarito_cruzamento \
        tests/unit/test_conciliacao_bancaria_cruzamento.py tests/unit/test_conciliacao_bancaria_composicao.py \
        tests/unit/test_composicao_parcelas_iguais.py tests/unit/test_conciliacao_bancaria_sispag.py \
        tests/unit/test_sugestoes_financeiro.py tests/integration/test_conciliacao_bancaria.py \
        tests/integration/test_conciliacao_revisao.py tests/integration/test_conciliacao_financeiro.py
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import inspect
import json
import os
import random
import re
from datetime import date, timedelta
from decimal import Decimal

cruzamento_casos: dict[str, dict] = {}
composicao_casos: dict[str, dict] = {}
_gravando = {"ligado": True, "dentro": 0}

# ─── Sanitização (a mesma de gabarito_extrato.py) ─────────────────────────────

_CNPJ = re.compile(r"\b(\d{2})\.?(\d{3})\.?(\d{3})/?(\d{4})-?(\d{2})\b")
_EXEMPLOS = ("00000000", "11111111", "12345678", "99999999")


def _troca_cnpj(m: re.Match) -> str:
    original = m.group(0)
    digitos = re.sub(r"\D", "", original)
    if len(digitos) != 14 or digitos.startswith(_EXEMPLOS):
        return original
    novo = "".join(str(int(c, 16) % 10) for c in hashlib.sha256(digitos.encode()).hexdigest()[:14])
    novo = "9" + novo[1:]
    saida, i = [], 0
    for c in original:
        if c.isdigit():
            saida.append(novo[i])
            i += 1
        else:
            saida.append(c)
    return "".join(saida)


_NOMES = dict(
    par.split("=", 1) for par in os.environ.get("GABARITO_NOMES", "").split(";") if "=" in par
)


def sanitizar_texto(v: str) -> str:
    for real, ficticio in _NOMES.items():
        v = v.replace(real, ficticio)
    return _CNPJ.sub(_troca_cnpj, v)


_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


# ─── Codificação compacta ─────────────────────────────────────────────────────

def _item(i) -> list:
    return [i.id, i.data.isoformat(), str(i.valor), i.historico]


def _pag(p) -> list:
    return [p.data.isoformat(), str(p.valor), p.tipo, p.favorecido, p.efetuado]


def _grupo(g, sispag) -> list:
    faltando = [next(k for k, q in enumerate(sispag or []) if q is p) for p in g.sispag_faltando]
    return [g.tipo, [i.id for i in g.razao], [i.id for i in g.extrato], faltando, str(g.diferenca)]


def _chave(caso: dict) -> str:
    return json.dumps({k: v for k, v in caso.items() if k not in ("result", "error")}, sort_keys=True, ensure_ascii=False)


def _guardar(destino: dict, caso: dict) -> None:
    destino.setdefault(_chave(caso), caso)


def _executar(caso: dict, fn, *args, codificar, **kwargs) -> dict:
    _gravando["dentro"] += 1
    try:
        caso["result"] = codificar(fn(*args, **kwargs))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        caso["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    finally:
        _gravando["dentro"] -= 1
    return caso


# ─── Gravação de cada função ──────────────────────────────────────────────────

def gravar_conciliar(conciliar, razao, extrato, *, periodo_inicio=None, tolerancia_dias=3, sispag=None):
    from src.domain.conciliacao_bancaria.cruzamento import Item

    novos: dict[str, str] = {}

    def novo_id(i: str) -> str:
        if not _UUID.match(i):
            return i
        if i not in novos:
            novos[i] = f"u{len(novos) + 1}"
        return novos[i]

    def troca(i):
        return Item(novo_id(i.id), i.data, i.valor, sanitizar_texto(i.historico))

    razao = [troca(i) for i in razao]
    extrato = [troca(i) for i in extrato]
    if sispag is not None:
        sispag = [
            dataclasses.replace(p, favorecido=sanitizar_texto(p.favorecido), documento=sanitizar_texto(p.documento))
            for p in sispag
        ]
    caso = {
        "fn": "conciliar",
        "razao": [_item(i) for i in razao],
        "extrato": [_item(i) for i in extrato],
        "periodo_inicio": periodo_inicio.isoformat() if periodo_inicio else None,
        "tolerancia_dias": tolerancia_dias,
        "sispag": None if sispag is None else [_pag(p) for p in sispag],
    }

    def codificar(res):
        return {
            "conciliados": [_grupo(g, sispag) for g in res.conciliados],
            "pendencias": [_grupo(g, sispag) for g in res.pendencias],
            "abertura": [i.id for i in res.abertura],
            "aplicacao_sem_extrato": [i.id for i in res.aplicacao_sem_extrato],
        }

    _executar(caso, conciliar, razao, extrato, codificar=codificar, periodo_inicio=periodo_inicio,
              tolerancia_dias=tolerancia_dias, sispag=sispag)
    _guardar(cruzamento_casos, caso)
    return caso


def gravar_especie(especie_de_aplicacao, historico, valor):
    historico = sanitizar_texto(historico)
    caso = {"fn": "especie_de_aplicacao", "historico": historico, "valor": str(valor)}
    _executar(caso, especie_de_aplicacao, historico, valor, codificar=lambda r: r)
    _guardar(cruzamento_casos, caso)


def _composicoes(lista):
    return [
        [c.extrato_indice, list(c.razao_indices), list(c.sispag_faltando_indices), c.criterio, c.confianca]
        for c in lista
    ]


def gravar_compor(nome, fn, razao, extrato, sispag_faltando):
    caso = {
        "fn": nome,
        "razao": [[i.indice, str(i.valor), i.lote] for i in razao],
        "extrato": [[i.indice, str(i.valor)] for i in extrato],
        "sispag_faltando": [str(v) for v in sispag_faltando],
    }
    _executar(caso, fn, razao, extrato, sispag_faltando, codificar=_composicoes)
    _guardar(composicao_casos, caso)


def gravar_parcelas(fn, razao, extrato):
    caso = {
        "fn": "indicar_parcelas_iguais",
        "razao": [[i.indice, str(i.valor)] for i in razao],
        "extrato": [[getattr(i, "indice", k), str(i.valor)] for k, i in enumerate(extrato)],
    }
    _executar(caso, fn, razao, extrato, codificar=lambda r: r)
    _guardar(composicao_casos, caso)


def _envolver(modulos, nome_fn, gravar):
    original = getattr(modulos[0], nome_fn)
    if getattr(original, "__gabarito__", False):
        return
    assinatura = inspect.signature(original)

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        resultado = original(*args, **kwargs)
        if _gravando["ligado"] and not _gravando["dentro"]:
            ligados = assinatura.bind(*args, **kwargs)
            ligados.apply_defaults()
            gravar(original, ligados.arguments)
        return resultado

    gravador.__gabarito__ = True
    for m in modulos:
        if hasattr(m, nome_fn):
            setattr(m, nome_fn, gravador)


def pytest_configure(config):  # noqa: ARG001
    from src.domain.conciliacao_bancaria import composicao, cruzamento, service

    _envolver([cruzamento, service], "conciliar", lambda fn, a: gravar_conciliar(
        fn, a["razao"], a["extrato"], periodo_inicio=a["periodo_inicio"],
        tolerancia_dias=a["tolerancia_dias"], sispag=a["sispag"]))
    _envolver([cruzamento, service], "especie_de_aplicacao",
              lambda fn, a: gravar_especie(fn, a["historico"], a["valor"]))
    for nome in ("compor_sispag", "compor_por_valores_sispag"):
        _envolver([composicao, service], nome, lambda fn, a, nome=nome: gravar_compor(
            nome, fn, a["razao"], a["extrato"], a["sispag_faltando"]))
    _envolver([composicao], "indicar_parcelas_iguais", lambda fn, a: gravar_parcelas(fn, a["razao"], a["extrato"]))


# ─── Casos inventados ─────────────────────────────────────────────────────────

_PALAVRAS = [
    "PIX", "TED", "SISPAG", "FORNECEDORES", "PGTO", "PAGTO", "RECEBIMENTO", "CLIENTE", "TARIFA",
    "BANCARIA", "ALFA", "BETA", "GAMA", "DELTA", "EXEMPLO", "LTDA", "TRANSFERENCIA", "ENTRE",
    "CONTAS", "BOLETO", "ENERGIA", "Sispag", "Fornecedores", "Pix", "Recebido", "Enviado", "DOC",
    "IOF", "JUROS", "NF", "123", "4567", "LIQUIDAÇÃO", "Salários", "SALARIOS", "-", "/",
]
_ESPECIAIS = [
    "SALDO ANTERIOR", "RETORNO DE SALDO NEGATIVO - ITAU", "SALDO INICIAL", "saldo  anterior",
    "RESGATE DE APLICAÇÃO AUTOMÁTICA", "OPERAÇÃO DE APLICAÇÃO AUTOMÁTICA", "REND PAGO APLIC AUT MAIS",
    "RES APLIC AUT MAIS", "APL APLIC AUT MAIS", "PGTO FULANO BARENDA", "Res Aplic Aut Mais", "APLıC AUT",
    "XAPLIC", "Sispag Salários", "SISPAG FORNECEDORES", "Sispag Fornecedores", "", "   ", "!!!",
]
_NOMES_PESSOAS = [
    "ANTONELLA", "RICARDO", "MAICON", "GENTIL", "DAIANE", "ADRIANO", "PEDRO", "RODRIGO", "CLAUDIO",
    "MARIA", "JOSE", "ANA", "LUIZ", "PAULA", "SOUZA", "SILVA", "COMERCIO", "SERVICOS",
]
_SOBRENOMES = ["EXEMPLO", "DA SILVA", "SOUZA", "LTDA", "COMERCIO LTDA", "ME", "TRANSPORTES", "OLIVEIRA"]
_TIPOS_SISPAG = ["Conta Corrente", "TED", "Boleto outros bancos", "PIX Transferências"]


def _valor(rng: random.Random, centavos: int) -> Decimal:
    """Decimal de centavos, às vezes com outro expoente (100.0, 1E+2) para testar a igualdade."""
    d = Decimal(centavos).scaleb(-2)
    sorte = rng.random()
    if sorte < 0.04:
        return d.normalize()
    if sorte < 0.07 and centavos % 10 == 0:
        return d.quantize(Decimal("0.1"))
    if sorte < 0.09:
        return d.quantize(Decimal("0.001"))
    return d


def _historico(rng: random.Random, recentes: list[str]) -> str:
    sorte = rng.random()
    if recentes and sorte < 0.25:
        return rng.choice(recentes)
    if sorte < 0.32:
        return rng.choice(_ESPECIAIS)
    h = " ".join(rng.choice(_PALAVRAS) for _ in range(rng.randint(1, 4)))
    recentes.append(h)
    return h


def _nome(rng: random.Random) -> str:
    return f"{rng.choice(_NOMES_PESSOAS)} {rng.choice(_SOBRENOMES)}"


class _Ids:
    def __init__(self, rng: random.Random, prefixo: str):
        self.rng, self.prefixo, self.n = rng, prefixo, 0
        self.estilo = rng.choice(["simples", "zeros", "misto", "hex"])

    def __call__(self) -> str:
        self.n += 1
        if self.estilo == "zeros":
            return f"{self.prefixo}{self.n:04d}"
        if self.estilo == "hex":
            return f"{self.prefixo}{self.rng.getrandbits(32):08x}"
        if self.estilo == "misto" and self.rng.random() < 0.3:
            return f"{self.prefixo.upper()}{self.n}"
        return f"{self.prefixo}{self.n}"


def cenario_geral(rng: random.Random, eventos: int):
    from src.domain.conciliacao_bancaria.cruzamento import Item

    base = date(2025, rng.choice([1, 2, 3, 12]), rng.choice([1, 20, 26]))
    dias = rng.randint(1, 12)
    pool = [rng.choice([rng.randint(1, 500), rng.randint(500, 200000), rng.randint(1, 50) * 10000])
            for _ in range(rng.randint(2, 25))]
    id_r, id_e = _Ids(rng, "r"), _Ids(rng, "e")
    razao, extrato, recentes = [], [], []

    def dia():
        return base + timedelta(days=rng.randrange(dias))

    def cent():
        return rng.choice(pool) if rng.random() < 0.7 else rng.randint(1, 300000)

    def sinal():
        return -1 if rng.random() < 0.65 else 1

    def r(d, c, h=None):
        razao.append(Item(id_r(), d, _valor(rng, c), h if h is not None else _historico(rng, recentes)))

    def e(d, c, h=None):
        extrato.append(Item(id_e(), d, _valor(rng, c), h if h is not None else _historico(rng, recentes)))

    tipos = ["par", "par", "par", "deslocado", "dup_r", "dup_e", "grupo_r", "grupo_e", "proximo",
             "so_r", "so_e", "sinal", "abertura", "aplic", "lote_dia", "zero", "repetido"]
    for _ in range(eventos):
        t = rng.choice(tipos)
        d, c, s = dia(), cent(), sinal()
        if t == "par":
            r(d, s * c)
            e(d, s * c)
        elif t == "deslocado":
            r(d, s * c)
            e(d + timedelta(days=rng.choice([-5, -4, -3, -2, -1, 1, 1, 2, 3, 4, 6])), s * c)
        elif t == "dup_r":
            r(d, s * c)
            r(d, s * c)
            e(d, s * c)
        elif t == "dup_e":
            r(d, s * c)
            e(d, s * c)
            e(d, s * c)
        elif t in ("grupo_r", "grupo_e"):
            partes = [cent() for _ in range(rng.randint(2, 7))]
            total = sum(partes)
            for p in partes:
                (r if t == "grupo_r" else e)(d, s * p)
            outro = d if rng.random() < 0.8 else d + timedelta(days=1)
            (e if t == "grupo_r" else r)(outro, s * (total + (rng.choice([0, 0, 0, 1, -1]))))
        elif t == "proximo":
            r(d, s * c)
            e(d, s * max(1, c + rng.choice([1, -1, 7, 702, -5000, 4999, 5001, 100, -100, c // 100, c // 99])))
        elif t == "so_r":
            r(d, s * c)
        elif t == "so_e":
            e(d, s * c)
        elif t == "sinal":
            r(d, s * c)
            e(d, -s * c)
        elif t == "abertura":
            r(base if rng.random() < 0.7 else d, s * c, rng.choice(_ESPECIAIS[:4]))
        elif t == "aplic":
            h = rng.choice(_ESPECIAIS[4:12])
            r(d, s * c, h)
            if rng.random() < 0.5:
                e(d if rng.random() < 0.7 else d + timedelta(days=2), s * c, rng.choice(_ESPECIAIS[4:12]))
        elif t == "lote_dia":
            partes = [cent() for _ in range(rng.randint(3, 25))]
            for p in partes:
                r(d, s * p, f"PGTO {_nome(rng)}")
            if rng.random() < 0.6:
                e(d, s * sum(partes), "Sispag Fornecedores")
            else:
                corte = rng.randint(1, len(partes) - 1)
                e(d, s * sum(partes[:corte]), "Sispag Fornecedores")
                e(d, s * sum(partes[corte:]), rng.choice(["Sispag Fornecedores", "SISPAG TED", "PIX ENVIADO"]))
        elif t == "zero":
            r(d, 0)
            if rng.random() < 0.5:
                e(d, 0)
        elif t == "repetido":
            for _ in range(rng.randint(2, 5)):
                r(d, s * c)
            for _ in range(rng.randint(1, 5)):
                e(d + timedelta(days=rng.choice([0, 0, 1, 2])), s * c)
    if rng.random() < 0.5:
        rng.shuffle(razao)
    if rng.random() < 0.5:
        rng.shuffle(extrato)
    if rng.random() < 0.02 and len(razao) > 2:
        razao.append(dataclasses.replace(razao[0], historico="ID REPETIDO"))
    return razao, extrato, base, recentes


def cenario_sispag(rng: random.Random):
    from src.domain.conciliacao_bancaria.cruzamento import Item
    from src.domain.conciliacao_bancaria.sispag import PagamentoSispag

    razao, extrato, base, recentes = cenario_geral(rng, rng.randint(0, 8))
    id_r, id_e = _Ids(rng, "s"), _Ids(rng, "x")
    pagamentos = []
    for k in range(rng.randint(1, 3)):
        d = base + timedelta(days=k * rng.choice([0, 1, 2]))
        for tipo in rng.sample(_TIPOS_SISPAG, rng.randint(1, 3)):
            n = rng.randint(1, 14)
            valores = [rng.choice([rng.randint(100, 900000), rng.randint(1, 30) * 1000]) for _ in range(n)]
            if n > 2 and rng.random() < 0.3:
                valores[1] = valores[0]  # mesmo valor para dois favorecidos
            nomes = [_nome(rng) for _ in range(n)]
            lote = []
            for nome, v in zip(nomes, valores):
                efetuado = rng.random() > 0.05
                lote.append(PagamentoSispag(d, _valor(rng, v), tipo, nome, rng.choice(["", "12.345.678/0001-95"]), efetuado))
                destino = rng.random()
                if destino < 0.8:
                    hist = rng.choice([f"PGTO {nome}", f"SISPAG FORNECEDORES {nome}", f"PAGTO {nome.split()[0]} EXEMPLO",
                                       "SISPAG FORNECEDORES", f"PGTO {_nome(rng)}"])
                    razao.append(Item(id_r(), d, -_valor(rng, v), hist))
                elif destino < 0.88:
                    razao.append(Item(id_r(), d + timedelta(days=rng.choice([0, 1])), -_valor(rng, v + rng.choice([1, 100])), f"PGTO {nome}"))
                elif destino < 0.93:
                    razao.append(Item(id_r(), d, -_valor(rng, v), f"PGTO {nome}"))
                    razao.append(Item(id_r(), d, -_valor(rng, v), f"PGTO {_nome(rng)} OUTRO"))
            pagamentos.extend(lote)
            total = sum(v for p, v in zip(lote, valores) if p.efetuado)
            forma = rng.random()
            if forma < 0.5:
                extrato.append(Item(id_e(), d, -_valor(rng, total), rng.choice(["Sispag Fornecedores", "SISPAG TED", "Sispag Fornec"])))
            elif forma < 0.75 and total > 2:
                corte = rng.randint(1, total - 1)
                h2 = rng.choice(["Sispag Fornecedores", "Sispag Fornecedores", "TARIFA"])
                extrato.append(Item(id_e(), d, -_valor(rng, corte), "Sispag Fornecedores"))
                extrato.append(Item(id_e(), d, -_valor(rng, total - corte), h2))
            elif forma < 0.82 and total > 3:
                c1 = rng.randint(1, total - 2)
                c2 = rng.randint(1, total - c1 - 1)
                for parte in (c1, c2, total - c1 - c2):
                    extrato.append(Item(id_e(), d, -_valor(rng, parte), "Sispag Fornecedores"))
            elif forma < 0.9:
                extrato.append(Item(id_e(), d, -_valor(rng, total + rng.choice([60000, -1, 1])), "Sispag Fornecedores"))
            # senão: o lote não aparece no extrato
            if rng.random() < 0.3 and valores:
                # o pagamento do lote que a camada 1 casaria com outra linha de mesmo valor
                extrato.append(Item(id_e(), d, -_valor(rng, valores[-1]), rng.choice(["Sispag Salários", f"PIX {nomes[-1]}"])))
    if rng.random() < 0.5:
        rng.shuffle(pagamentos)
    if rng.random() < 0.5:
        rng.shuffle(razao)
    return razao, extrato, base, pagamentos


def casos_cruzamento(conciliar, especie_de_aplicacao) -> None:
    from src.domain.conciliacao_bancaria.cruzamento import Item

    rng = random.Random(20261111)
    for historico in _ESPECIAIS + ["APLİC", "REND APLIC", "aplicação", "_APLIC", "é APLIC", "1APLIC", "RENDA APLIC", "APLIC REND", "ʀEND APLIC"]:
        for valor in ("1.00", "-1.00", "0", "-0.00"):
            gravar_especie(especie_de_aplicacao, historico, Decimal(valor))

    # Bordas diretas
    d1 = date(2025, 2, 1)
    gravar_conciliar(conciliar, [], [])
    gravar_conciliar(conciliar, [Item("r1", d1, Decimal("10.00"), "X")], [Item("e1", d1 + timedelta(days=1), Decimal("10.0"), "X")], tolerancia_dias=0)
    gravar_conciliar(conciliar, [Item("r1", d1, Decimal("10.00"), "X")], [Item("e1", d1 + timedelta(days=1), Decimal("10.0"), "X")], tolerancia_dias=-1)
    gravar_conciliar(conciliar, [Item("r1", d1, Decimal("10.00"), "SALDO ANTERIOR")], [], periodo_inicio=d1 + timedelta(days=1))
    gravar_conciliar(conciliar, [Item("r1", d1, Decimal("10.00"), "SALDO ANTERIOR")], [], periodo_inicio=d1)
    gravar_conciliar(conciliar, [Item("r1", d1, Decimal("1E+1"), "A"), Item("r2", d1, Decimal("10.000"), "B")],
                     [Item("e1", d1, Decimal("10"), "B"), Item("e2", d1, Decimal("-0"), "C")])

    for n in range(300):
        razao, extrato, base, _ = cenario_geral(rng, rng.randint(1, 30))
        gravar_conciliar(conciliar, razao, extrato,
                         periodo_inicio=rng.choice([None, base, base + timedelta(days=1)]),
                         tolerancia_dias=rng.choice([0, 1, 2, 3, 3, 3, 5]))
    for n in range(300):
        razao, extrato, base, pagamentos = cenario_sispag(rng)
        gravar_conciliar(conciliar, razao, extrato, periodo_inicio=rng.choice([None, base]),
                         tolerancia_dias=rng.choice([0, 3, 3]), sispag=rng.choice([pagamentos, pagamentos, pagamentos, [], None]))
    for n in range(2):
        razao, extrato, base, _ = cenario_geral(rng, 160)
        gravar_conciliar(conciliar, razao, extrato, periodo_inicio=base)


def _particionar(rng: random.Random, valores: list[int], linhas: int) -> list[list[int]]:
    grupos = [[] for _ in range(linhas)]
    for i, _ in enumerate(valores):
        grupos[i % linhas if i < linhas else rng.randrange(linhas)].append(i)
    return grupos


def casos_composicao(compor_sispag, compor_por_valores, indicar) -> None:
    from src.domain.conciliacao_bancaria.composicao import LancamentoParaComposicao as R
    from src.domain.conciliacao_bancaria.composicao import LinhaExtratoParaComposicao as E

    rng = random.Random(1111)

    def lote_txt(n: int) -> str | None:
        sorte = rng.random()
        if sorte < 0.6:
            return str(n)
        if sorte < 0.75:
            return f"L{n:05d}"
        if sorte < 0.85:
            return f"lote {n} / 7"
        if sorte < 0.88:
            return "".join(chr(0x660 + int(c)) for c in str(n))
        if sorte < 0.92:
            return None
        if sorte < 0.95:
            return "sem número"
        return str(n + rng.choice([0, 1, 2]))

    for _ in range(2200):
        linhas = rng.choice([1, 2, 2, 2, 3, 3, 3, 4])
        qtd = rng.choice([rng.randint(0, 6), rng.randint(2, 14), rng.randint(2, 14), rng.randint(20, 40)])
        if rng.random() < 0.01:
            qtd = rng.randint(105, 112)
        # Valores à vontade só com poucas parcelas: com muitas, a busca do original (estados esparsos)
        # leva minutos por caso. Muitas parcelas usam poucos valores distintos, e o espaço fica pequeno.
        if qtd <= 9:
            pool = [rng.choice([rng.randint(1, 20) * 500, rng.randint(1, 900000)]) for _ in range(rng.randint(1, 8))]
            valores = [rng.choice(pool) if rng.random() < 0.6 else rng.randint(1, 300000) for _ in range(qtd)]
        else:
            pool = [rng.randint(1, 12) * 100 for _ in range(rng.randint(1, 4))]
            valores = [rng.choice(pool) for _ in range(qtd)]
        modo = rng.random()
        posicoes = list(range(qtd))
        if modo < 0.5 and qtd >= linhas:
            # blocos contíguos na ordem do lote: o caminho da sugestão
            cortes = sorted(rng.sample(range(1, qtd), linhas - 1)) if linhas > 1 and qtd > linhas else list(range(1, linhas))
            limites = [0, *cortes, qtd]
            grupos = [posicoes[a:b] for a, b in zip(limites, limites[1:])]
        else:
            grupos = _particionar(rng, valores, linhas)
        sinal = rng.choice([-1, -1, -1, 1])
        alvos = [sum(valores[i] for i in g) for g in grupos]
        if rng.random() < 0.1 and alvos:
            alvos[rng.randrange(len(alvos))] += rng.choice([1, -1, 100])
        faltando_pos = set()
        if rng.random() < 0.4 and qtd:
            faltando_pos = set(rng.sample(range(qtd), rng.randint(1, min(qtd, rng.choice([1, 2, 3, 9])))))
        primeiro = rng.randint(1, 3_000_000)
        razao = []
        for i in range(qtd):
            if i in faltando_pos:
                continue
            v = _valor(rng, valores[i]) * sinal
            if rng.random() < 0.01:
                v = Decimal("0.005") * sinal
            if rng.random() < 0.005:
                v = Decimal("0")
            razao.append(R(len(razao) if rng.random() < 0.9 else rng.randint(0, 99), v, lote_txt(primeiro + i)))
        faltando = [_valor(rng, valores[i]) for i in sorted(faltando_pos)]
        if rng.random() < 0.5:
            rng.shuffle(faltando)
        if rng.random() < 0.3:
            rng.shuffle(razao)
        extrato = [E(k, _valor(rng, a) * sinal) for k, a in enumerate(alvos) if a > 0 or rng.random() < 0.5]
        if rng.random() < 0.4:
            rng.shuffle(extrato)
        gravar_compor("compor_sispag", compor_sispag, razao, extrato, faltando)
        gravar_compor("compor_por_valores_sispag", compor_por_valores, razao, extrato, faltando)

    # Muitas parcelas, poucos valores distintos, três linhas.
    for qtd in (60, 90, 108):
        vals = [rng.choice([100, 200, 300, 301]) for _ in range(qtd)]
        g = _particionar(rng, vals, 3)
        razao = [R(i, -Decimal(v).scaleb(-2)) for i, v in enumerate(vals)]
        extrato = [E(k, -Decimal(sum(vals[i] for i in gr)).scaleb(-2)) for k, gr in enumerate(g)]
        gravar_compor("compor_por_valores_sispag", compor_por_valores, razao, extrato, [])

    for _ in range(900):
        m = rng.randint(0, 9) if rng.random() < 0.9 else rng.randint(100, 112)
        base = rng.choice([5000, 12345, 1, 99999, rng.randint(1, 100000)])
        parcelas = [base] * max(0, m - 1) + ([base + rng.choice([0, 0, 1, 5, 6, -1, 3])] if m else [])
        if m and rng.random() < 0.1:
            parcelas[rng.randrange(m)] += 1
        sinal = rng.choice([1, -1])
        extrato = [E(i, _valor(rng, p) * sinal) for i, p in enumerate(parcelas)]
        if extrato and rng.random() < 0.05:
            extrato[-1] = E(len(extrato) - 1, -extrato[-1].valor)
        total = sum(parcelas)
        razao = []
        for i in range(rng.randint(0, 4)):
            escolha = rng.random()
            v = total if escolha < 0.5 else total + rng.choice([1, -1, base])
            s = sinal if rng.random() < 0.85 else -sinal
            razao.append(R(rng.randint(0, 9), _valor(rng, v) * s))
        gravar_parcelas(indicar, razao, extrato)


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta:
        return
    from src.domain.conciliacao_bancaria import composicao, cruzamento

    def original(fn):
        return getattr(fn, "__wrapped__", fn)

    # Daqui em diante, só os casos inventados; as funções originais, sem gravação por dentro.
    _gravando["ligado"] = False
    for m, nome in ((cruzamento, "conciliar"), (cruzamento, "especie_de_aplicacao"), (composicao, "compor_sispag"),
                    (composicao, "compor_por_valores_sispag"), (composicao, "indicar_parcelas_iguais")):
        setattr(m, nome, original(getattr(m, nome)))
    import time

    da_suite = (len(cruzamento_casos), len(composicao_casos))
    inicio = time.perf_counter()
    casos_cruzamento(cruzamento.conciliar, cruzamento.especie_de_aplicacao)
    print(f"\ncruzamento inventado: {time.perf_counter() - inicio:.1f}s")
    inicio = time.perf_counter()
    casos_composicao(composicao.compor_sispag, composicao.compor_por_valores_sispag, composicao.indicar_parcelas_iguais)
    print(f"composição inventada: {time.perf_counter() - inicio:.1f}s")

    for nome, casos in (("cruzamento-casos.json", cruzamento_casos), ("composicao-casos.json", composicao_casos)):
        ordenados = sorted(casos.values(), key=lambda c: (c["fn"], _chave(c)))
        caminho = os.path.join(pasta, nome)
        with open(caminho, "w", encoding="utf-8", newline="\n") as f:
            f.write("[\n")
            f.write(",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in ordenados))
            f.write("\n]\n")
        por_fn: dict[str, int] = {}
        for c in ordenados:
            por_fn[c["fn"]] = por_fn.get(c["fn"], 0) + 1
        print(f"\ngabarito {nome}: {len(ordenados)} casos {por_fn} ({os.path.getsize(caminho)} bytes)")
    print(f"da suíte: cruzamento {da_suite[0]}, composição {da_suite[1]}")
