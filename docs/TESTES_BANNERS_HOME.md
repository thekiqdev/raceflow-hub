# Testes manuais – Banners da Home

Checklist da **Etapa 6** do [PLANO_BANNERS_HOME.md](./PLANO_BANNERS_HOME.md). Use para validar o fluxo admin e a exibição na home.

---

## 1. Admin – Gestão de banners

| # | Cenário | Passos | Resultado esperado |
|---|--------|--------|--------------------|
| 1 | Criar banner | 1. Acessar Admin → Banners.<br>2. Clicar em "Novo banner".<br>3. Enviar imagem (upload ou URL), título opcional, link opcional, marcar ativo, ordem 0.<br>4. Salvar. | Banner criado e listado; aparece na home (slider). |
| 2 | Múltiplos banners | Criar 2 ou 3 banners com ordens diferentes (ex.: 0, 1, 2). | Todos listados na ordem configurada; na home o slider exibe na mesma ordem. |
| 3 | Ativar/desativar | 1. Na listagem, desativar um banner (Switch "Ativo" → Inativo).<br>2. Abrir a home em outra aba. | Banner some do slider; continua na listagem admin como "Inativo". Reativar: volta a aparecer na home. |
| 4 | Alterar ordem | Usar setas "Subir" / "Descer" na listagem ou editar o campo "Ordem" no formulário. Salvar. | Ordem na listagem e na home atualizada. |
| 5 | Editar banner | Abrir "Editar", alterar título, link ou imagem. Salvar. | Alterações persistidas; home reflete a nova imagem/título/link. |
| 6 | Excluir banner | Clicar em Excluir e confirmar. | Banner removido da listagem e da home. |

---

## 2. Home – Slider e links

| # | Cenário | Passos | Resultado esperado |
|---|--------|--------|--------------------|
| 7 | Sem banners ativos | Garantir que não há banners com "Ativo" (ou excluir todos). Acessar `/`. | Hero estático (imagem/título/subtítulo da personalização) é exibido; não há carrossel. |
| 8 | Com banners ativos | Ter pelo menos um banner ativo. Acessar `/`. | Slider no topo com os banners ativos na ordem configurada; setas e indicadores (bolinhas) funcionam. |
| 9 | Clique no banner com link | Banner com "Link de destino" preenchido. Clicar na imagem do slide na home. | Nova aba abre com a URL configurada. |
| 10 | Clique no banner sem link | Banner sem link. Clicar na imagem. | Nenhuma navegação (apenas troca de slide se houver mais de um). |
| 11 | Autoplay e acessibilidade | Deixar a home aberta com 2+ banners; usar apenas teclado/setas. | Slides trocam sozinhos após alguns segundos; setas do carrossel e indicadores acessíveis. |

---

## 3. Critérios de conclusão Etapa 6

- [ ] Fluxo admin (criar, editar, ativar/desativar, ordenar, excluir) executado sem erro.
- [ ] Home exibe apenas banners ativos, na ordem definida no admin.
- [ ] Link do banner (quando preenchido) redireciona corretamente.
- [ ] Sem banners ativos: hero estático da home é exibido.

Após executar os testes, marque os itens acima e considere a Etapa 6 concluída.
