# Índice: Planos de evento (Premiação, Cronograma e Cadastro)

O plano original foi **dividido em dois planos independentes**:

---

## Plano 1 – Abas Premiação e Cronograma

**Arquivo:** [PLANO_EVENTO_ABAS_PREMIACAO_CRONOGRAMA.md](./PLANO_EVENTO_ABAS_PREMIACAO_CRONOGRAMA.md)

- Adicionar duas novas **abas** no cadastro/edição de eventos: **Premiação** e **Cronograma**.
- Usar o editor **TipTap** em cada aba para o organizador inserir texto formatado.
- Exibir Premiação e Cronograma na **página de inscrição** do evento (HTML sanitizado).
- Backend: novos campos `premiacao` e `cronograma` na tabela `events` (HTML).

---

## Plano 2 – Cadastro de evento em popup tela cheia

**Arquivo:** [PLANO_EVENTO_CADASTRO_POPUP_TELA_CHEIA.md](./PLANO_EVENTO_CADASTRO_POPUP_TELA_CHEIA.md)

- **Manter** o uso de **popup/dialog** para criação e edição de evento (não migrar para página dedicada).
- Alterar o popup para **ocupar a tela toda** (fullscreen), em vez de um espaço pequeno no centro.
- Formulário e abas permanecem iguais; apenas o tamanho do modal muda.

---

## Ordem sugerida

1. Implementar **Plano 1** (abas Premiação e Cronograma) — inclui backend, TipTap e exibição na página de inscrição.
2. Implementar **Plano 2** (popup tela cheia) — pode ser feito antes, depois ou em paralelo, pois não depende do Plano 1.
