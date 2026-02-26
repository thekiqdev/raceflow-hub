# 📍 Localização dos Campos de Controle de Inscrições

Este documento especifica exatamente onde os campos de controle de status de inscrições serão implementados na interface.

---

## 🎯 Componentes a Modificar

### 1. **EventFormDialog.tsx** (Organizador)
**Arquivo:** `src/components/organizer/EventFormDialog.tsx`

**Localização:** Aba "Publicação" (Tab 6), logo após o campo "Status do Evento"

**Estrutura Atual:**
```tsx
{/* Tab 6: Publicação */}
<TabsContent value="publish" className="space-y-4">
  <FormField
    control={form.control}
    name="status"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Status do Evento</FormLabel>
        {/* Botões de status: Rascunho, Publicado, Finalizado */}
      </FormItem>
    )}
  />
  
  {/* ⬇️ AQUI SERÁ ADICIONADO O CONTROLE DE INSCRIÇÕES ⬇️ */}
  
  <Card>
    <CardHeader>
      <CardTitle>Resumo do Evento</CardTitle>
    </CardHeader>
    {/* ... */}
  </Card>
</TabsContent>
```

**O que será adicionado:**
- Um novo `Card` ou `FormField` com a seção "Controle de Inscrições"
- Posicionado entre o campo "Status do Evento" e o "Resumo do Evento"
- Incluirá:
  - Checkbox "Modo Automático"
  - Campos de data/hora (quando modo automático ativado)
  - Select de status manual (quando modo automático desativado)

**Código Sugerido:**
```tsx
{/* Controle de Inscrições */}
<Card>
  <CardHeader>
    <CardTitle>Controle de Inscrições</CardTitle>
    <CardDescription>
      Configure quando as inscrições estarão abertas para este evento
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Checkbox Modo Automático */}
    <div className="flex items-center space-x-2">
      <Checkbox
        id="registration_auto_mode"
        checked={registrationAutoMode}
        onCheckedChange={(checked) => setRegistrationAutoMode(checked as boolean)}
      />
      <Label htmlFor="registration_auto_mode" className="cursor-pointer">
        Modo Automático (baseado em datas)
      </Label>
    </div>
    
    {registrationAutoMode ? (
      /* Campos de Data/Hora */
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="registration_start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data/Hora de Abertura</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="registration_end_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data/Hora de Encerramento</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    ) : (
      /* Select Manual */
      <FormField
        control={form.control}
        name="registration_status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Status das Inscrições</FormLabel>
            <Select
              value={field.value || ""}
              onValueChange={field.onChange}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="not_open">Inscrições em Breve</SelectItem>
                <SelectItem value="open">Inscrições Abertas</SelectItem>
                <SelectItem value="closed">Inscrições Encerradas</SelectItem>
                <SelectItem value="">Usar Status Padrão</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    )}
  </CardContent>
</Card>
```

---

### 2. **EventViewEditDialog.tsx** (Admin)
**Arquivo:** `src/components/admin/EventViewEditDialog.tsx`

**Localização:** Seção "Informações Básicas", logo após o campo "Status"

**Estrutura Atual:**
```tsx
<div className="grid grid-cols-2 gap-4">
  <div className="grid gap-2">
    <Label htmlFor="event_date">Data</Label>
    {/* Campo de data */}
  </div>
  
  <div className="grid gap-2">
    <Label htmlFor="status">Status</Label>
    {/* Select de status */}
  </div>
</div>

{/* ⬇️ AQUI SERÁ ADICIONADO O CONTROLE DE INSCRIÇÕES ⬇️ */}

<div className="grid gap-2">
  <Label htmlFor="location">Local</Label>
  {/* Campo de localização */}
</div>
```

**O que será adicionado:**
- Uma nova seção completa "Controle de Inscrições"
- Posicionada após o grid com "Data" e "Status"
- Mesma estrutura do EventFormDialog (Card com checkbox e campos condicionais)

**Código Sugerido:**
```tsx
{/* Controle de Inscrições */}
<div className="space-y-4 border-t pt-4">
  <div>
    <Label className="text-base font-semibold">Controle de Inscrições</Label>
    <p className="text-sm text-muted-foreground">
      Configure quando as inscrições estarão abertas
    </p>
  </div>
  
  <div className="flex items-center space-x-2">
    <input
      type="checkbox"
      id="registration_auto_mode"
      checked={formData.registration_auto_mode || false}
      onChange={(e) => setFormData({
        ...formData,
        registration_auto_mode: e.target.checked
      })}
    />
    <Label htmlFor="registration_auto_mode" className="cursor-pointer">
      Modo Automático (baseado em datas)
    </Label>
  </div>
  
  {formData.registration_auto_mode ? (
    <div className="grid grid-cols-2 gap-4">
      <div className="grid gap-2">
        <Label htmlFor="registration_start_date">Data/Hora de Abertura</Label>
        <Input
          id="registration_start_date"
          type="datetime-local"
          value={formData.registration_start_date || ""}
          onChange={(e) => setFormData({
            ...formData,
            registration_start_date: e.target.value
          })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="registration_end_date">Data/Hora de Encerramento</Label>
        <Input
          id="registration_end_date"
          type="datetime-local"
          value={formData.registration_end_date || ""}
          onChange={(e) => setFormData({
            ...formData,
            registration_end_date: e.target.value
          })}
        />
      </div>
    </div>
  ) : (
    <div className="grid gap-2">
      <Label htmlFor="registration_status">Status das Inscrições</Label>
      <Select
        value={formData.registration_status || ""}
        onValueChange={(value) => setFormData({
          ...formData,
          registration_status: value || null
        })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione o status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="not_open">Inscrições em Breve</SelectItem>
          <SelectItem value="open">Inscrições Abertas</SelectItem>
          <SelectItem value="closed">Inscrições Encerradas</SelectItem>
          <SelectItem value="">Usar Status Padrão</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )}
</div>
```

---

## 📋 Resumo Visual

### EventFormDialog (Organizador)
```
┌─────────────────────────────────────┐
│  Aba: Publicação                    │
├─────────────────────────────────────┤
│  [Status do Evento]                 │
│  📝 Rascunho | ✅ Publicado | 🏁 Finalizado │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │ 🆕 Controle de Inscrições       │ │
│  │ ☑ Modo Automático               │ │
│  │ [Data Abertura] [Data Fim]     │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │ Resumo do Evento                 │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### EventViewEditDialog (Admin)
```
┌─────────────────────────────────────┐
│  Informações Básicas                │
├─────────────────────────────────────┤
│  [Data]          [Status]           │
│                                      │
│  🆕 Controle de Inscrições           │
│  ☑ Modo Automático                  │
│  [Data Abertura] [Data Fim]         │
│                                      │
│  [Local]                            │
│  [Cidade] [Estado]                  │
└─────────────────────────────────────┘
```

---

## 🎨 Considerações de UX

1. **Visibilidade:** Os campos devem estar claramente visíveis e organizados
2. **Feedback Visual:** Mostrar preview do status calculado quando modo automático estiver ativo
3. **Validação:** Validar que data fim >= data início
4. **Tooltips:** Adicionar tooltips explicativos sobre cada opção
5. **Responsividade:** Garantir que funcione bem em mobile

---

## ✅ Checklist de Implementação

- [ ] Adicionar campos no schema do formulário
- [ ] Adicionar estado para `registration_auto_mode`
- [ ] Implementar lógica condicional (mostrar datas OU select)
- [ ] Adicionar validações
- [ ] Incluir campos no payload de salvamento
- [ ] Testar em ambos os componentes (organizador e admin)
- [ ] Adicionar estilos e feedback visual
- [ ] Testar responsividade

---

**Última Atualização:** 2025-01-27
