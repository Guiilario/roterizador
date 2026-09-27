# Sobre este script

`roteirizador_entregas.py` é o protótipo original em Python (OSRM + Google
OR-Tools) que deu origem a este projeto. Ele fica aqui só como **referência**
— o app que você vai usar de verdade é o da pasta principal (`index.html` +
`css/` + `js/`), que roda inteiro no navegador.

## Por que o app principal não usa este script diretamente

Este script precisa de Python rodando em algum servidor (`pip install
ortools requests`, depois executar `python roteirizador_entregas.py`). Isso
não funciona no GitHub Pages, que só serve arquivos estáticos (HTML/CSS/JS) —
não existe "servidor Python" por trás para rodar este código. Como o pedido
era testar pelo celular via link do GitHub, o app principal foi reescrito em
JavaScript puro, seguindo a mesma lógica deste script:

| Etapa                         | Este script (Python)              | App principal (JavaScript)                  |
|--------------------------------|------------------------------------|----------------------------------------------|
| Matriz de distância/tempo real | `OSRM /table`                      | `js/routing.js` → mesmo endpoint `OSRM /table` |
| Resolver o TSP (melhor ordem)  | Google OR-Tools (busca local guiada)| `js/routing.js` → nearest-neighbor + 2-opt   |
| Rota aberta ou fechada          | truque do nó-fantasma de custo zero| tratamento direto do caminho aberto/fechado no 2-opt |
| Geocodificar endereço em lat/long | (não fazia — endereços já vinham prontos) | `js/geocode.js` → Nominatim/OpenStreetMap |

O solver em JavaScript (nearest-neighbor + 2-opt) é mais simples que o
OR-Tools e pode achar rotas ligeiramente menos perfeitas em casos muito
grandes ou complexos, mas funciona 100% no navegador, sem custo e sem
precisar manter um servidor no ar.

## Quando usar este script em vez do app web

Se um dia a operação crescer e valer a pena ter um backend próprio (por
exemplo, para processar rotas ainda maiores, rodar seu próprio OSRM local, ou
integrar com outros sistemas), este script é um bom ponto de partida — é só
hospedá-lo em algum serviço que rode Python (Render, Railway, PythonAnywhere
etc., todos com planos gratuitos limitados) e adaptar o app web para chamar
esse backend em vez de fazer o cálculo no navegador.
