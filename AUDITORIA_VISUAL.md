# AUDITORIA VISUAL DETALHADA — MEDREVIEW (v0.0.125)

**Data:** Auditoria Estética e Estrutural Completa da Interface (Snapshot + Injeções DOM)
**Arquivos Auditados:** `src/pages/Index.tsx`, `src/main.css`

---

## SUMÁRIO EXECUTIVO DOS PROBLEMAS ENCONTRADOS

O MedReview opera sobre uma arquitetura híbrida: um snapshot HTML nativo pré-compilado que é interceptado e redecorado por funções injetadas em `src/pages/Index.tsx` (`injectHierarchySupport`, `_executeDecorateCardElementImmediately`, `_executeEnhanceViews`, `renderSubfoldersPicker`, `renderSubfolderView`, `autonomousActionsScript`) complementadas por regras em `src/main.css`.

A causa raiz dos "bugs estéticos" reportados pelo usuário divide-se em:

1. **Guerra de CSS e redundâncias:** O arquivo `src/main.css` possui 814 linhas (com 500+ linhas dedicadas a `.mr-folder-card`), enquanto o script dentro de `src/pages/Index.tsx` cria dinamicamente um segundo bloco `<style>` injetado no `<head>` com regras idênticas ou ligeiramente divergentes (ex.: `padding-right: 42px` vs `88px`, `gap: 0.6rem` vs `0.65rem`, `box-shadow` divergentes).
2. **Quebra dos 3 botões do rodapé em colunas estreitas:** A grade principal impõe 3 colunas fixas (`repeat(3, minmax(0, 1fr))`) em telas acima de 900px. Em viewports de 920px a 1150px, cada cartão tem apenas ~260px–280px de largura útil; com três botões de `min-width: 80px` + gaps, o botão `📁 Subpasta` sofre wrap e quebra para a 3ª linha, desregulando a altura dos cartões.
3. **Botão ✏️ (editar) sendo deletado pelo próprio limpador de DOM:** Em `_executeEnhanceViews`, a rotina de purga de filhos do cartão protege `directHeader`, `directFooter` e `directDel`, mas **esqueceu de proteger `directEdit` (`.mr-folder-card-top-rename`)**, fazendo com que o botão ✏️ seja removido ou pisque intermitentemente nas re-renderizações.
4. **Desconexão estética do cartão de Subpasta:** O cartão de subpasta tem apenas 1 botão ("Abrir ➜") com `flex: 1 1 0%` que estica sozinho, background que muda para verde claro (`#f0fdf4`) no hover (enquanto pastas normais permanecem brancas), e tracejado diferente (`1px dashed #e2e8f0` vs `1.5px dashed #cbd5e1`).
5. **Colisão de Z-Index e backdrops duplicados nos Modais:** Modais de criação (z-index: 180, 190, 194, 195) possuem z-indexes inferiores aos de exclusão/renomeação (210, 215) e, quando o fluxo de importação abre um modal secundário sobre o primeiro sem fechá-lo, dois filtros `backdrop-filter: blur(4px)` e fundos `rgba(15,23,42,0.55)` se somam, escurecendo a tela quase a 100%.

---

## LISTA NUMERADA DE ACHADOS (ORDENADOS POR IMPACTO VISUAL)

---

### 1. Quebra da 2ª linha do rodapé dos cartões de pasta (Truncamento e Wrap de "📁 Subpasta")

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 751–756 e 1093–1125: classes `.mr-folder-card-actions`, `.mr-folder-card-btn-action`)
  - `src/main.css` (linhas 683–725: `.mr-folder-card-actions`, `.mr-folder-card-btn-action`)
  - `src/pages/Index.tsx` (linha 948: regra da grid de pastas)
- **(b) Sintoma visual:**
  Em telas de notebook e desktop intermediário (900px a 1180px), a grid força 3 colunas (`repeat(3, minmax(0, 1fr))`), fazendo com que o cartão tenha menos de 280px de largura total (restando cerca de 248px de área líquida interna). Com 3 botões exigindo `min-width: 80px` cada (240px) + dois gaps de `0.45rem` (~15px) + padding horizontal dos botões, o espaço necessário ultrapassa 260px. O botão `📁 Subpasta` é quebrado para uma 3ª linha sozinho (`flex-wrap: wrap`), desalinhando a altura vertical em relação aos cartões vizinhos. Em cartões com títulos curtos, o rodapé fica deformado com 1 botão isolado embaixo de outros 2.
- **(c) Correção proposta:**
  Reduzir `min-width` de `.mr-folder-card-btn-action` de `80px` para `64px`, reduzir fonte para `0.72rem` (11.5px) com padding `0 0.35rem`, e ajustar a grid de pastas para `repeat(auto-fill, minmax(290px, 1fr))` para que nunca haja cartões com largura inferior a 290px.

---

### 2. Botão ✏️ (Renomear) desaparece ou pisca na home por purga acidental no decorador

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 4844–4853 em `_executeEnhanceViews`)
- **(b) Sintoma visual:**
  Na primeira carga ou ao navegar e retornar à home, o botão de lápis azul `✏️` no canto superior direito do cartão de pasta é deletado de forma intermitente, deixando apenas a lixeira `🗑`. Quando o mouse se move ou um timer de rAF roda, o botão às vezes reaparece ou fica ausente em alguns cartões.
- **(c) Correção proposta:**
  Em `Index.tsx:4844-4853`, adicionar a referência e guarda do botão de renomear na lista de filhos permitidos do root do cartão:
  `const directRename = card.querySelector('.mr-folder-card-top-rename');` e incluir `child !== directRename` na cláusula `if` que expurga nós não decorados.

---

### 3. Conflito de `padding-right` no cabeçalho do cartão (42px vs 88px) causando sobreposição do título com ✏️ e 🗑

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linha 701: `padding-right: 42px !important;`)
  - `src/pages/Index.tsx` (linha 962: `padding-right: 88px !important;`)
  - `src/main.css` (linha 442: `padding-right: 88px !important;`)
- **(b) Sintoma visual:**
  O botão 🗑 fica em `right: 12px` (largura 34px) e o botão ✏️ em `right: 52px` (largura 34px), ocupando juntos 86px a partir da margem direita do cartão. Como o bloco `<style>` injetado possui uma regra com `padding-right: 42px !important;`, quando essa regra é aplicada antes do enriquecimento ou tem precedência de seletor, o título do cartão avança até 42px da borda direita, ficando visualmente atropelado e ilegível por baixo do botão azul ✏️.
- **(c) Correção proposta:**
  Remover a regra conflitante de `padding-right: 42px` em `Index.tsx:701`, unificando em `padding-right: 92px !important;` em todos os cabeçalhos (`.mr-folder-card-header`) tanto no CSS quanto nos scripts injetados.

---

### 4. Cartão de Subpasta com estética e hover inconsistentes em relação aos cartões de pasta

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 836–846 e linhas 3863–3882)
  - `src/pages/Index.tsx` (linhas 4032–4051)
  - `src/main.css` (linhas 632–646 e 702–728)
- **(b) Sintoma visual:**
  - **Hover discordante:** Passar o cursor sobre uma pasta comum mantém o fundo `#ffffff` e eleva o cartão com sombra verde. Passar o cursor sobre uma subpasta pinta o fundo inteiro do cartão de verde claro `#f0fdf4` (`background: #f0fdf4` na linha 845), criando uma experiência visual totalmente desconectada.
  - **Botão do rodapé esticado:** O rodapé da subpasta possui apenas 1 botão ("Abrir ➜"). Como herda `flex: 1 1 0%`, o botão ocupa sozinho 100% da largura da 2ª linha, enquanto nos cartões de pasta os botões são compactos e divididos em 3.
  - **Divisor do rodapé:** A subpasta usa `border-top: 1px dashed #e2e8f0`, enquanto a pasta usa `border-top: 1.5px dashed #cbd5e1`.
- **(c) Correção proposta:**
  Remover `background: #f0fdf4` do hover de `.mr-subfolder-card`, padronizar o divisor para `border-top: 1.5px dashed #cbd5e1 !important;`, e no rodapé da subpasta fixar o botão "Abrir ➜" com `flex: 0 0 auto; width: 100%;` ou alinhado à direita com `margin-left: auto; width: auto; padding: 0 1rem;` para manter harmonia com a grade.

---

### 5. Resíduos de lixeira antiga no rodapé (.mr-folder-card-btn-delete) competindo com o rodapé novo

- **(a) Onde no código:**
  - `src/main.css` (linhas 784–814: `.mr-folder-card-actions .mr-folder-card-btn-delete`)
  - `src/pages/Index.tsx` (linhas 1126–1155: `.mr-folder-card-actions .mr-folder-card-btn-delete`)
- **(b) Sintoma visual:**
  Se qualquer cartão do snapshot ou subpasta ainda possuir elementos residuais com a classe `.mr-folder-card-btn-delete` no rodapé (herança da versão 0.0.38-0.0.42), um quarto botão vermelho de 34x34px é exibido ao lado do botão `📁 Subpasta`, empurrando a linha e gerando quebra de layout grotesca com duas lixeiras (uma no canto superior direito e outra no rodapé).
- **(c) Correção proposta:**
  Expurgar incondicionalmente qualquer elemento `.mr-folder-card-btn-delete` dentro do rodapé em `_executeDecorateCardElementImmediately` e declarar no CSS: `.mr-folder-card-footer .mr-folder-card-btn-delete { display: none !important; }`.

---

### 6. Empilhamento e escuridão excessiva de Modais (Backdrops Duplicados)

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 1161, 1207, 1258: modais `create-choice-modal`, `import-target-modal`, `csv-import-modal`)
- **(b) Sintoma visual:**
  Quando o usuário clica em `➕ Criar (Pasta ou Carta)` ou `📥 Importar CSV`, abre-se o modal de escolha (`z-index: 180`). Ao clicar em "Importar Flashcards via CSV", abre-se o `#import-target-modal` (`z-index: 194`). Se o modal anterior não for fechado explicitamente, ambos os fundos translúcidos (`rgba(15,23,42,0.55)` e `rgba(15,23,42,0.6)`) com `backdrop-filter: blur(4px)` ficam ativos simultaneamente, deixando o fundo da tela 100% preto opaco e o app com aspecto travado.
- **(c) Correção proposta:**
  Garantir que a função `handleChoiceImportCsv()` chame `closeCreateChoiceModal()` antes de abrir `openImportTargetModal()`, e padronizar os z-indexes dos modais em escala consistente: Modais base `z-index: 200`, Modais secundários/diálogos `z-index: 210`, Modais de confirmação/delete `z-index: 220`.

---

### 7. Espaçamentos e salto de layout no `#mr-subfolder-wrapper` e Seletor de Subpastas

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 612–621 vs linhas 3823 e 3979)
- **(b) Sintoma visual:**
  No HTML inline injetado de `renderSubfoldersPicker` e `renderSubfolderView`, o container `.mr-subfolder-content-container` define `padding: 0.25rem 1rem 1.25rem 1rem`. No bloco `<style>` injetado em Index.tsx (linha 613), define-se `padding-top: 1.25rem !important; padding-bottom: 2rem !important;`. Esse conflito entre atributos inline e regras `!important` causa um salto perceptível (layout shift) na tela ao entrar em uma subpasta ou no seletor de subpastas.
- **(c) Correção proposta:**
  Remover os estilos inline conflitantes de padding no template HTML de `renderSubfoldersPicker` e `renderSubfolderView`, confiando unicamente na classe CSS `.mr-subfolder-content-container { max-width: 1280px; margin: 0 auto; padding: 1rem 1.25rem 2rem 1.25rem !important; }`.

---

### 8. Hero Card de Subpasta com quebra desordenada de botões em telas menores

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 3982–4005 em `renderSubfolderView`)
- **(b) Sintoma visual:**
  O cabeçalho herói da subpasta coloca o título à esquerda e quatro botões (`📥 Importar CSV`, `➕ Criar`, `⚡ Revisar (N)`, `🗑 Excluir`) à direita em um bloco com `display: flex; gap: 0.6rem; flex-wrap: wrap;`. Em telas de resolução inferior a 1024px ou com nomes de subpasta mais longos, os botões quebram em duas linhas desalinhadas, com botões de alturas e pesos visuais desiguais (o botão Excluir possui borda e fundo vermelho claro, mas botões verdes têm alturas de 32px e 36px misturadas).
- **(c) Correção proposta:**
  Definir altura fixa de `36px`, padding homogêneo `padding: 0 0.85rem; font-size: 0.82rem; font-weight: 700; border-radius: 8px;` para todos os botões do hero, e em telas menores (< 768px) empilhar a área de botões em uma barra com scroll horizontal suave ou grid 2x2.

---

### 9. Faixa verde superior decorativa (`::before`) muito próxima dos botões ✏️ e 🗑

- **(a) Onde no código:**
  - `src/main.css` (linhas 325–336)
  - `src/pages/Index.tsx` (linhas 672–682 e 960)
- **(b) Sintoma visual:**
  A faixa verde superior decorativa tem `height: 5px; position: absolute; top: 0; left: 0; right: 0;`. Os botões ✏️ e 🗑 estão posicionados em `top: 12px;`. A distância entre a barra decorativa de 5px e o topo do botão é de apenas `7px`, criando uma sensação de aperto e falta de "respiro" no topo direito do cartão.
- **(c) Correção proposta:**
  Ajustar os botões do canto superior para `top: 14px; right: 14px;` (lixeira) e `right: 54px;` (renomear), ou reduzir a espessura da faixa para `height: 4px;` e aumentar o padding top do cartão de `1.15rem` para `1.25rem`.

---

### 10. Botão "📊 Estatística" na topbar com duplicação ou espaçamento assimétrico

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 6130–6134 e 5080)
- **(b) Sintoma visual:**
  O botão de estatística é injetado via substituição estática de string (`html.replace(importBtnMarker, statsBtnHtml + importBtnMarker)`) e depois reforçado dinamicamente no DOM por `ensureGlobalStatsButton()` em `enhanceViews()`. Se o snapshot renderizar com algum atraso ou recarregar as rotas internas, o botão pode ser duplicado ou inserido com classes que causam quebra na barra superior verde.
- **(c) Correção proposta:**
  Adicionar verificação estrita de id único (`id="mr-topbar-stats-btn"`) e no replace estático garantir que, se o id já existir no DOM, nenhuma injeção adicional ocorra; padronizar sua classe para `.med-nav-btn` idêntica aos botões vizinhos.

---

### 11. Flash de conteúdo nativo e banners de estatísticas durante transições de rota

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linhas 4875–4889, 4955–4990, 569–610)
- **(b) Sintoma visual:**
  Quatro blocos independentes tentam remover `.deck-stats`, `.stats-overview`, `.folder-stats` e `.deck-performance`. Como o snapshot original injeta esses blocos de estatísticas via scripts próprios vinculados ao localStorage, ao alternar entre pastas há um "piscar" (FOUC) desses painéis cinzas antes de serem capturados e removidos pelo `enhanceViews`.
- **(c) Correção proposta:**
  Injetar no topo do `<head>` uma regra global de CSS estrita com especificidade máxima:
  `body .deck-stats:not(#global-stats-modal *), body .stats-overview:not(#global-stats-modal *), body .folder-stats:not(#global-stats-modal *), body .deck-performance:not(#global-stats-modal *) { display: none !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; }`, impedindo que eles apareçam sequer por 1 frame.

---

### 12. Botão "🔄 Resetar" com hover vermelho confuso no rodapé do cartão

- **(a) Onde no código:**
  - `src/pages/Index.tsx` (linha 753)
  - `src/main.css` (linhas 741–747)
- **(b) Sintoma visual:**
  O botão "🔄 Resetar" tem aspecto verde suave (`background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;`). Porém, ao passar o mouse (`:hover`), ele vira repentinamente vermelho forte (`background: #fee2e2 !important; color: #b91c1c !important; border-color: #fca5a5 !important;`). Para um usuário que apenas repousa o cursor, a cor vermelha transmite sensação de perigo ou exclusão imediata (parece que vai apagar a pasta), gerando receio injustificado antes do clique.
- **(c) Correção proposta:**
  Alterar o hover para um tom âmbar/laranja suave de aviso ou manter verde com tom mais contrastante: `background: #fef3c7 !important; color: #b45309 !important; border-color: #fcd34d !important;` (ou verde escuro `#dcfce7; color: #14532d; border-color: #86efac;`), reservando o vermelho exclusivamente para ações de exclusão definitiva (`🗑`).

---

## PLANO DE AÇÃO RECOMENDADO PARA CORREÇÃO

Quando a ordem de implementação for disparada, as correções devem ser agrupadas e aplicadas cirurgicamente da seguinte forma:

1. **Unificação do CSS:**
   - Remover duplicações de classes entre `src/main.css` e o `<style>` injetado em `src/pages/Index.tsx`. Centralizar as regras em `src/main.css` ou manter no `<style>` injetado apenas overrides dinâmicos sem conflitos de `padding-right` e `gap`.
2. **Harmonização do Rodapé e Grid:**
   - Alterar `min-width: 80px` para `64px` nos 3 botões do rodapé, reduzindo padding para `0 0.4rem` e fonte para `0.72rem`.
   - Ajustar a grid para `repeat(auto-fill, minmax(290px, 1fr))` garantindo que a linha de 3 botões nunca quebre para uma 3ª linha.
3. **Consolidação do Decorador de Cartões:**
   - Proteger o botão de renomear `✏️` no loop de purga de nós filhos em `_executeEnhanceViews`.
   - Expurgar qualquer resíduo de `.mr-folder-card-btn-delete` no rodapé.
4. **Padronização da Subpasta:**
   - Remover hover verde do cartão de subpasta e harmonizar o tracejado e o botão "Abrir ➜".
5. **Modais e Z-Index:**
   - Fechar o modal anterior ao transicionar fluxos e consolidar a escala de z-index (200, 210, 220).
