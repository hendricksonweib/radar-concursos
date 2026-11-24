"""Coleta única que grava os dados como JSON estático (para hospedar o site sem servidor).

    python3 backend/coletar_json.py <pasta_saida>

Roda no GitHub Actions a cada ~15 min (.github/workflows/coletar.yml). A pasta de saída é ao mesmo tempo
o estado da coleta anterior (para saber o que é novo) e o que o site lê:
  status.json     quando cada fonte rodou, totais, alvos monitorados
  concursos.json  inscrições abertas (PCI + banca ligada)
  sinais.json     sinais do Diário Oficial e das bancas (último ano)
  bancas.json     listas das bancas (estado interno)
Não usa chave nem senha: todas as fontes são públicas.
"""
import json
import os
import sys
import traceback
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import coletores as co  # noqa: E402
from comum import ALVOS_PADRAO, CONSULTAS_DOU_GERAIS, banca_para, carregar_env, municipios  # noqa: E402

carregar_env(os.path.join(os.path.dirname(AQUI), ".env"))
BRT = timezone(timedelta(hours=-3))  # Brasília (sem horário de verão)
MIN = 60
INTERVALOS = {  # segundos; com o cron de 15 min, 0 = toda execução
    "pci": int(os.environ.get("INTERVALO_PCI", 30 * MIN)),
    "dou": int(os.environ.get("INTERVALO_DOU", 0)),
    "bancas": int(os.environ.get("INTERVALO_BANCAS", 120 * MIN)),
}
MAX_SINAIS = 3000


def agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ler(pasta, nome, padrao):
    try:
        return json.load(open(os.path.join(pasta, nome), encoding="utf-8"))
    except Exception:
        return padrao


def gravar(pasta, nome, obj):
    tmp = os.path.join(pasta, nome + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, os.path.join(pasta, nome))


def vencido(status, nome):
    q = (status.get(nome) or {}).get("quando")
    if not q or not (status.get(nome) or {}).get("ok"):
        return True
    return (datetime.now(timezone.utc) - datetime.fromisoformat(q)).total_seconds() >= INTERVALOS[nome] - 60


def alvos():
    extra = os.path.join(AQUI, "alvos.txt")
    lista = list(ALVOS_PADRAO)
    if os.path.exists(extra):
        for l in open(extra, encoding="utf-8"):
            l = l.strip()
            if l and not l.startswith("#") and l not in lista:
                lista.append(l)
    return lista


def main(saida):
    os.makedirs(saida, exist_ok=True)
    st = ler(saida, "status.json", {})
    status = st.get("status", {})
    concursos = {c["id"]: c for c in ler(saida, "concursos.json", {}).get("itens", [])}
    sinais = {s["id"]: s for s in ler(saida, "sinais.json", {}).get("itens", [])}
    bancas = ler(saida, "bancas.json", [])
    alvos_feitos = set(st.get("alvosBuscados", []))
    ts, hoje = agora(), datetime.now(BRT).date().isoformat()

    def registrar(nome, fn):
        if not vencido(status, nome):
            print(f"{nome}: ainda no intervalo, pulando")
            return
        try:
            n = fn()
            status[nome] = {"quando": agora(), "itens": n, "ok": True}
        except Exception as e:
            traceback.print_exc()
            status[nome] = {"quando": agora(), "ok": False, "erro": str(e)[:200],
                            "ultimoOk": (status.get(nome) or {}).get("ultimoOk") or (status.get(nome) or {}).get("quando")}

    def guardar_sinais(lista, tipo):
        novos = 0
        for s in lista:
            if s["id"] in sinais:
                continue
            s["tipo"], s["primeiroVisto"] = tipo, ts
            sinais[s["id"]] = s
            novos += 1
        return novos

    # --- PCI: inscrições abertas
    def pci():
        nonlocal concursos
        itens = co.pci(municipios(os.path.join(AQUI, "dados")))
        if not itens:
            raise RuntimeError("PCI voltou vazio (mudou o layout?)")
        novo = {}
        for c in itens:
            ant = concursos.get(c["id"])
            c["primeiroVisto"] = ant["primeiroVisto"] if ant else ts
            c["publicado"] = ant["publicado"] if ant else hoje
            novo[c["id"]] = c
        print(f"PCI: {len(itens)} abertos, {len(set(novo) - set(concursos))} novos")
        concursos = novo  # o que sumiu = inscrições encerradas
        return len(itens)

    # --- Diário Oficial
    def dou():
        n = 0
        for consulta, tipo in CONSULTAS_DOU_GERAIS:
            try:
                itens = [x for x in co.dou(consulta, "semana") if not co.RUIDO.search(x["titulo"] + " " + x["texto"])]
                if tipo == "autorizacao":
                    itens = [x for x in itens if "autoriz" in (x["titulo"] + x["texto"]).lower()]
                n += guardar_sinais(itens, tipo)
            except Exception as e:
                print("DOU erro", consulta, e)
            co.pausa()
        for t in alvos():
            try:
                achados = co.dou_sinais(t, "mes" if t in alvos_feitos else "ano")
                n += guardar_sinais(achados, "alvo")
                alvos_feitos.add(t)
            except Exception as e:
                print("DOU erro alvo", t, e)
            co.pausa()
        print(f"DOU: {n} sinais novos")
        return n

    # --- Bancas
    def bancas_fn():
        nonlocal bancas
        lista = []
        for f in (co.fgv, co.cesgranrio):
            try:
                lista += f()
            except Exception as e:
                print("banca erro", f.__name__, e)
            co.pausa()
        if lista:
            bancas = lista
        print(f"Bancas: {len(lista)} listados, {guardar_sinais(lista, 'banca')} novos")
        return len(lista)

    registrar("pci", pci)
    registrar("dou", dou)
    registrar("bancas", bancas_fn)

    # liga concurso ↔ banca
    for c in concursos.values():
        b, u = banca_para(c, bancas)
        c["banca"], c["bancaUrl"] = (b, u) if b else (None, None)

    limite = (datetime.now(BRT) - timedelta(days=400)).date().isoformat()
    lista_sinais = sorted((s for s in sinais.values() if (s.get("data") or hoje) >= limite),
                          key=lambda s: (s.get("data") or "", s.get("primeiroVisto") or ""), reverse=True)[:MAX_SINAIS]

    gravar(saida, "concursos.json", {"gerado": ts, "itens": list(concursos.values())})
    gravar(saida, "sinais.json", {"gerado": ts, "itens": lista_sinais})
    gravar(saida, "bancas.json", bancas)
    gravar(saida, "status.json", {
        "gerado": ts, "status": status, "concursos": len(concursos),
        "sinaisDou": sum(1 for s in lista_sinais if s.get("fonte") == "Diário Oficial da União"),
        "alvos": alvos(), "alvosBuscados": sorted(alvos_feitos), "intervaloMin": 15,
    })
    print("ok:", saida)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "dados", "publico"))
