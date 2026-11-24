# Radar Concursos

Mapa de concursos públicos e processos seletivos do Brasil, no visual "apuração ao vivo"
(fundo quase preto, título serifado, selo ● Ao vivo, mapa Brasil → estado → município).

## Rodar (dados reais)

```bash
python3 backend/server.py
```
Abra http://localhost:5173. Só precisa de Python 3.9+ (nenhuma dependência para instalar).
A primeira coleta leva uns 30 segundos. Os dados ficam em `backend/dados/radar.db` (SQLite).

Sem o servidor (abrindo o HTML de outro jeito), o site cai no **modo demonstração**, com dados fictícios.

## Publicar (Vercel + GitHub Actions)

A Vercel não mantém um servidor ligado, então em produção a coleta roda no GitHub:

1. `.github/workflows/coletar.yml` roda `backend/coletar_json.py` a cada ~15 min e publica
   `status.json`, `concursos.json` e `sinais.json` na branch **`dados`** (sempre 1 commit só, sem crescer o histórico).
2. O site (estático, na Vercel) lê esses arquivos de `raw.githubusercontent.com` e confere a cada minuto se há coleta nova;
   o que for novo vira notificação.
3. A branch `dados` não gera deploy (`vercel.json`), e só o site vai para a Vercel (`.vercelignore`).

Passo a passo:
1. Crie um repositório **público** no GitHub (o site lê os dados direto dele) e envie este projeto.
2. Em `js/config.js`, troque `USUARIO/REPOSITORIO` pelo seu repositório.
3. No GitHub, aba **Actions** → "Coletar concursos" → **Run workflow** (a primeira coleta cria a branch `dados`).
4. Na Vercel: **Add New → Project**, importe o repositório, Framework **Other**, sem comando de build. Deploy.

**Segredos:** nenhum. As fontes são públicas e o Actions usa o token automático do GitHub.
Se um dia precisar de chave (e-mail, push), ela vai em `.env` (ignorado pelo Git; modelo em `.env.example`)
ou nos *Secrets* do GitHub/Vercel, nunca em `js/`, que é público.

Observações: o GitHub pode atrasar o agendamento alguns minutos, e desliga agendamentos de repositórios
sem nenhum commit há 60 dias (basta reativar na aba Actions). Para acompanhar um órgão a mais no
Diário Oficial, adicione o nome em `backend/alvos.txt`.

## De onde vêm os dados

| Fonte | O que traz | Frequência |
|---|---|---|
| PCI Concursos `/concursos/` | todos os concursos com inscrições abertas, por UF: órgão, vagas, salário, cargo, escolaridade, prazo | 30 min |
| Diário Oficial da União (busca) | "edital de abertura", "realização de concurso público" e publicações **do próprio órgão-alvo** que falam de concurso | 10 min |
| FGV Conhecimento e Cesgranrio | concursos que cada banca organiza (sinal de "banca definida" e vínculo banca ↔ concurso) | 2 h |
| IBGE | malhas dos estados/municípios e nomes para casar "Prefeitura de X" com o município | ao iniciar |

Ficaram de fora: **FCC** (o robots.txt proíbe robôs em /concursos/), **Vunesp** (bloqueia robôs) e **Cebraspe** (a página é montada por JavaScript; precisa de outra abordagem).
Os intervalos mudam por variável de ambiente: `INTERVALO_PCI`, `INTERVALO_DOU`, `INTERVALO_BANCAS` (segundos).

## Como funciona o tempo real

1. O agendador (`backend/server.py`) roda os coletores e grava no SQLite.
2. Concurso ou sinal **novo** vira um evento enviado por SSE em `/api/stream`.
3. O site recebe e notifica:
   - **alvo**: algo do seu órgão-alvo (ex.: o DOU publicar algo da ABIN sobre concurso);
   - **parecido**: concurso novo de área, nível e salário próximos do alvo;
   - **novo**: concurso novo ou autorização no DOU.
4. Quando uma inscrição some da lista de abertas, ela é marcada como encerrada.

Ao trocar de alvo, o site registra o nome em `/api/alvos` e o servidor passa a procurá-lo no DOU (já busca o último ano na hora).

## API

```
GET  /api/concursos            concursos com inscrições abertas
GET  /api/sinais?termo=ABIN    sinais (DOU/bancas) que mencionam o termo   (&limite=N)
GET  /api/status               última coleta de cada fonte
GET  /api/stream               eventos em tempo real (SSE)
POST /api/alvos {"termo": ""}  passa a monitorar um órgão
POST /api/coletar              força uma coleta agora
```

## Limitações conhecidas

- **Classificação por heurística:** área, esfera e nível são inferidos por palavras-chave (`backend/classificar.py`) e podem errar.
- **Município não reconhecido:** cerca de 1 em 4 órgãos municipais não casa com um município do IBGE. Esses entram só na contagem do estado.
- **"Previstos":** só aparecem pelos sinais do DOU. Ainda não há uma fonte estruturada de concursos previstos.
- **Último edital dos alvos:** o ano do último edital de cada alvo (`js/data.js`, `ultimoEdital`) foi preenchido à mão e deve ser conferido.
- **Notificações:** são do navegador e só funcionam com a aba aberta. Para avisar com o site fechado falta Web Push com service worker, ou e-mail.
- **Favoritos e alvo:** ficam salvos só no navegador; ainda não há login.

## Arquivos
- `backend/server.py`: banco, agendador, API e SSE
- `backend/coletores.py`: PCI, DOU, FGV e Cesgranrio
- `backend/classificar.py`: área, esfera, nível e município
- `index.html`, `styles.css`, `js/app.js`: o site
- `js/data.js`, `js/municipais.js`: dados do modo demonstração e lista de alvos
