# Plano 2: Cadastro de evento – popup em tela cheia

---

## 1. Contexto

O cadastro e a edição de eventos hoje utilizam um **popup/dialog** (modal) para criação e para visualização/edição. O dialog ocupa apenas uma **área central** da tela (janela de tamanho limitado no centro), o que pode dificultar a visualização de todas as abas e campos quando o formulário é extenso. O fluxo em si (abrir popup ao clicar em “Novo evento” ou “Editar”) será **mantido**; a mudança desejada é apenas no **tamanho do popup**: que ele **ocupe a tela toda** (tela cheia), em vez de um espaço pequeno no centro.

---

## 2. Objetivo

- **Manter** o uso de **popup/dialog** para a criação e para a edição de eventos (não migrar para página dedicada).
- Alterar o popup para que **ocupe a tela toda** (fullscreen / tela cheia), e não apenas um retângulo central pequeno.
- Garantir que o formulário (com todas as abas, incluindo as futuras Premiação e Cronograma) tenha espaço adequado para uso, mantendo o restante do sistema (menu, header) inalterado quando o popup estiver fechado.

---

## 3. Estado atual

| Aspecto | Comportamento atual |
|--------|----------------------|
| **Criação de evento** | Abre em popup/dialog (ex.: `EventFormDialog` no fluxo do organizador; admin com `EventViewEditDialog` ou equivalente). |
| **Edição / visualização** | Dialog com abas: Detalhes, Modalidades, Categorias, Kits, Retirada, Pagamentos, Publicação, Inscrições. |
| **Tamanho do popup** | Modal de tamanho limitado (ex.: `max-w-*`, centralizado), ocupando apenas parte da tela. |
| **Layout** | Menu e header permanecem visíveis atrás do overlay; o conteúdo do dialog fica contido numa janela central. |

---

## 4. Arquitetura alvo

- **Popup mantido:** Criação e edição de evento continuam a ser abertas via **dialog/modal** (não se cria rota dedicada nem formulário em página).
- **Popup em tela cheia:** O dialog deve **ocupar toda a área útil da tela** (ou toda a viewport):
  - Opção A: Dialog com classes que o fazem ocupar 100% da largura e altura da viewport (ex.: `w-screen h-screen max-w-none`, ou componente “fullscreen dialog”).
  - Opção B: Usar um componente de “drawer” ou “fullscreen modal” que cobre a tela inteira, com possível botão de fechar (X) no canto para voltar à lista.
- **Conteúdo:** O formulário (abas, campos) permanece o mesmo; apenas o container do dialog passa a ter tamanho tela cheia, com scroll interno se necessário.
- **Fechar:** Ao fechar o popup (X ou “Cancelar”), o usuário volta à lista de eventos; comportamento atual de fechamento preservado.

---

## 5. Plano por etapas

### Etapa 1 – Identificar componentes do dialog de evento

- Localizar o(s) componente(s) que renderizam o popup de **criação** de evento (ex.: `EventFormDialog`) e o de **edição** (ex.: `EventViewEditDialog`).
- Verificar qual componente de UI é usado (ex.: `Dialog` do Radix/shadcn) e como as classes de largura/altura são aplicadas (ex.: `DialogContent` com `className="max-w-..."`).

### Etapa 2 – Ajustar o dialog para tela cheia

- Alterar o **DialogContent** (ou equivalente) do popup de criação e do popup de edição para que ocupem **tela cheia**:
  - Ex.: `className="w-[100vw] h-[100vh] max-w-none max-h-none rounded-none"` ou variante que faça o modal ocupar 100% da viewport.
  - Garantir que o conteúdo interno (formulário com abas) tenha scroll próprio (ex.: `overflow-y-auto`) quando o conteúdo for maior que a altura da tela.
- Manter o overlay (fundo escuro) e o botão de fechar (X) visíveis e funcionando.
- Testar em diferentes resoluções para garantir que o popup realmente ocupe a tela toda e que não haja scroll duplo (body + conteúdo).

### Etapa 3 – Ajustes de UX (opcional)

- Se necessário, adicionar ou destacar um botão “Fechar” ou “Voltar” no topo do formulário (além do X) para deixar claro como sair do popup.
- Garantir que o foco e a acessibilidade (tecla Esc para fechar) continuem funcionando.

### Etapa 4 – Testes

- Testar abertura do popup de criação de evento: deve ocupar a tela toda.
- Testar abertura do popup de edição de evento: deve ocupar a tela toda.
- Testar fechamento (X, Cancelar, Esc): deve voltar à lista sem quebrar layout.
- Verificar que o formulário (todas as abas) permanece utilizável e que scroll interno funciona quando necessário.

---

## 6. Regras de implementação

- **Não alterar o fluxo:** Continua-se usando popup para criar e editar evento; não criar novas rotas nem páginas dedicadas para esse fim.
- **Apenas tamanho:** A única mudança de comportamento é o **tamanho** do popup (tela cheia em vez de janela central pequena).
- **Compatibilidade:** As abas e campos existentes (e as futuras Premiação e Cronograma) devem continuar funcionando dentro do mesmo dialog, apenas com mais espaço de exibição.

---

## 7. Entregáveis

| # | Entregável |
|---|------------|
| 1 | Popup de **criação** de evento configurado para **ocupar a tela toda** (fullscreen). |
| 2 | Popup de **edição** de evento configurado para **ocupar a tela toda** (fullscreen). |
| 3 | Conteúdo do formulário com scroll interno quando necessário; fechamento (X, Cancelar, Esc) preservado. |

---

## 8. Checklist final

- [ ] Dialog de criação de evento ocupa 100% da viewport (tela cheia).
- [ ] Dialog de edição de evento ocupa 100% da viewport (tela cheia).
- [ ] Conteúdo com muitas abas/campos tem scroll interno; não há quebra de layout.
- [ ] Fechar o popup (X, Cancelar ou Esc) retorna à lista de eventos normalmente.
- [ ] Menu e header do sistema permanecem inalterados (visíveis ou cobertos pelo overlay, conforme design atual).
