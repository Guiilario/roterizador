# RotaFácil 🧭

Roteirizador de entregas gratuito, estilo Circuit/Route4Me, para uma dupla
**motorista + ajudante** com **80 ou mais endereços** por rota.

Roda inteiramente no navegador — **sem servidor próprio, sem chave de API,
sem custo** — e foi pensado para ser testado direto pelo celular, hospedado
de graça no GitHub Pages.

## Estrutura do projeto

```
rotafacil/
├── index.html                      ← página principal (estrutura da tela)
├── css/
│   └── styles.css                  ← todo o visual (tema, layout, abas mobile)
├── js/
│   ├── app.js                      ← inicializa tudo
│   ├── state.js                    ← dados da rota + salvar/carregar do navegador
│   ├── voice.js                    ← reconhecimento de voz (ditar endereço)
│   ├── geocode.js                  ← endereço em texto → latitude/longitude
│   ├── routing.js                  ← matriz de distâncias + otimização da ordem
│   ├── map.js                      ← mapa (Leaflet + OpenStreetMap)
│   └── ui.js                       ← liga tudo à tela: lista, formulários, exportação
├── referencia-python/
│   ├── roteirizador_entregas.py    ← protótipo original (Python + OR-Tools), mantido como referência
│   └── README.md                   ← explica a diferença entre os dois
└── README.md                       ← este arquivo
```

Cada parte fica isolada no seu próprio arquivo, então é fácil achar e
mexer só no que precisa (ex.: mudar uma cor → `css/styles.css`; mudar como a
rota é calculada → `js/routing.js`).

> O app usa módulos JavaScript (`import`/`export`), então **não abra o
> `index.html` com duplo clique** (`file://`) — o navegador bloqueia módulos
> nesse modo. Use sempre um servidor local (abaixo) ou o link do GitHub
> Pages.

## O que o app faz

- **Adicionar endereços por voz** 🎤 — toque no microfone, fale o endereço,
  veja o texto sendo preenchido ao vivo, confira/corrija e toque em
  "Adicionar parada". Ótimo para o motorista ou ajudante irem cadastrando
  paradas sem digitar.
- Ou cole uma lista de endereços de uma vez, ou importe um CSV
- Ponto de partida opcional (base/depósito), com opção de retornar a ele no fim
- Geocodificação gratuita via **Nominatim (OpenStreetMap)**
- Otimização da ordem de visita usando **distâncias reais de ruas** — o app
  monta uma matriz de distância/tempo no **OSRM** (o mesmo motor do script
  Python de referência) e resolve a melhor ordem com um algoritmo próprio em
  JavaScript (nearest-neighbor + 2-opt), sem precisar de servidor
- Mapa interativo com a rota traçada e paradas numeradas
- Lista da rota ("manifesto") com checkbox de "entregue" para o motorista e o
  ajudante irem marcando durante o dia — fica salvo automaticamente no
  navegador
- Reordenar paradas manualmente arrastando, se precisar ajustar na mão
- Exportar a rota otimizada em CSV, imprimir o manifesto
- Abrir a rota inteira no Google Maps para navegação (dividida em trechos,
  pois o Google Maps tem limite de paradas por link)
- **Interface adaptada para celular**: no computador aparece um painel lateral
  fixo; no celular vira três abas na parte de baixo da tela — **Endereços**,
  **Mapa** e **Rota** — para caber bem numa tela pequena.

Tudo fica salvo no `localStorage` do navegador, então dá para fechar o
aplicativo e continuar depois no mesmo celular/navegador.

## Como testar no localhost

Não precisa instalar nada além de ter Python (só para servir os arquivos, não
para rodar lógica nenhuma):

```bash
cd rotafacil
python3 -m http.server 8080
```

Depois abra `http://localhost:8080` no navegador do computador. Para testar
como vai ficar no celular durante o desenvolvimento, veja o IP da sua
máquina na rede local (ex. `192.168.0.10`) e acesse
`http://192.168.0.10:8080` pelo celular, estando na mesma rede Wi-Fi.

## Como publicar gratuitamente no GitHub Pages (para testar pelo celular)

1. Crie um repositório novo no GitHub (pode ser público, no plano gratuito) e
   suba **a pasta inteira** (`index.html`, `css/`, `js/`, `README.md`) para a
   raiz do repositório — mantendo essa mesma estrutura de pastas.
2. No repositório, vá em **Settings → Pages**.
3. Em **Source**, selecione a branch `main` e a pasta `/ (root)`.
4. Salve. Em alguns minutos o GitHub mostra a URL pública, algo como
   `https://seu-usuario.github.io/nome-do-repo/`.

Pronto — o motorista e o ajudante podem abrir esse link direto no celular no
dia da rota. É preciso internet para geocodificar e otimizar (essas duas
etapas usam serviços externos gratuitos), mas depois de calculada, a rota já
fica salva no navegador do celular.

## Sobre o ditado por voz

Usa a **Web Speech API**, nativa do navegador — não manda áudio para nenhum
servidor do app, quem processa a fala é o próprio navegador/sistema
operacional.

- **Funciona bem:** Chrome no Android, Chrome/Edge no computador.
- **Suporte limitado ou ausente:** Safari no iPhone, navegadores mais
  antigos. Nesses casos o app detecta automaticamente e desativa o botão do
  microfone, mostrando um aviso — mas as abas "Colar lista" e "CSV" continuam
  funcionando normalmente.

## Limites dos serviços gratuitos (e como contornar)

Este app usa os servidores públicos gratuitos do OpenStreetMap, que têm
regras de uso justo:

- **Nominatim (geocodificação):** limite de ~1 requisição por segundo. O app
  já respeita esse limite automaticamente (por isso geocodificar 80
  endereços leva cerca de 1 a 2 minutos). Os resultados ficam em cache no
  navegador, então você só paga esse tempo uma vez por endereço.
- **OSRM (matriz de distância e otimização):** o servidor de demonstração
  público (`router.project-osrm.org`) é gratuito mas não tem garantia de
  disponibilidade para uso pesado ou comercial contínuo. Para 80 paradas
  ocasionais costuma funcionar bem. Se ele ficar indisponível, o app cai
  automaticamente para um cálculo local mais simples, direto no navegador
  (menos preciso, porque usa distância em linha reta em vez de ruas reais,
  mas garante que a rota sempre é gerada).

**Se um dia isso virar operação diária/comercial**, o recomendado é subir sua
própria instância gratuita e open source do OSRM (Docker, com o mapa do
Brasil baixado do OpenStreetMap) em vez do servidor de demonstração — assim
não há limite de uso. As instruções para isso estão comentadas no final do
`referencia-python/roteirizador_entregas.py`, e o projeto oficial do OSRM tem
um guia completo em `https://github.com/Project-OSRM/osrm-backend`.

## Formato dos endereços

Na aba "Colar lista", uma parada por linha, nos formatos:

```
Nome do cliente; Rua Exemplo, 123, Bairro, Cidade - UF
Rua Exemplo, 123, Bairro, Cidade - UF
```

(Se não colocar um `;` com nome antes, a linha inteira vira o endereço e o
nome fica como "Parada".)

No CSV, use colunas `Nome` e `Endereço` (com ou sem cabeçalho — se não houver
cabeçalho e houver só uma coluna, ela é tratada como endereço).
