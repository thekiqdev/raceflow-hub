import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";
import { maskCreditCard, maskCep, maskPhone, maskCpf, unmask } from "@/lib/utils/masks";
import { 
  validateCreditCardNumber, 
  getCreditCardBrand, 
  validateCreditCardExpiry,
  validateCVV,
  validateCpf 
} from "@/lib/utils/validators";
import { CreditCardData, CreditCardHolderInfo } from "@/lib/api/registrations";

// Credit card form schema
const creditCardFormSchema = z.object({
  // Card data
  holderName: z.string().min(3, 'Nome do titular é obrigatório'),
  number: z.string().min(13, 'Número do cartão inválido').refine(
    (val) => validateCreditCardNumber(val),
    'Número do cartão inválido'
  ),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês inválido'),
  expiryYear: z.string().regex(/^\d{4}$/, 'Ano inválido'),
  ccv: z.string().min(3, 'CVV inválido').max(4, 'CVV inválido').refine(
    (val) => validateCVV(val),
    'CVV inválido'
  ),
  // Holder info
  name: z.string().min(3, 'Nome completo é obrigatório'),
  email: z.string().email('E-mail inválido'),
  cpfCnpj: z.string().min(11, 'CPF inválido').refine(
    (val) => validateCpf(val),
    'CPF inválido'
  ),
  postalCode: z.string().min(8, 'CEP inválido').max(9, 'CEP inválido'),
  addressNumber: z.string().min(1, 'Número do endereço é obrigatório'),
  addressComplement: z.string().optional(),
  phone: z.string().min(10, 'Telefone é obrigatório'),
  mobilePhone: z.string().optional(),
}).refine(
  (data) => validateCreditCardExpiry(data.expiryMonth, data.expiryYear),
  {
    message: 'Data de validade inválida ou expirada',
    path: ['expiryMonth'],
  }
);

type CreditCardFormValues = z.infer<typeof creditCardFormSchema>;

interface CreditCardFormProps {
  onSubmit: (data: {
    credit_card: CreditCardData;
    credit_card_holder_info: CreditCardHolderInfo;
  }) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  defaultValues?: Partial<CreditCardFormValues>;
}

// Credit card brand icons mapping
const getCardBrandIcon = (brand: string) => {
  switch (brand) {
    case 'visa':
      return '💳'; // Could be replaced with actual icon component
    case 'mastercard':
      return '💳';
    case 'amex':
      return '💳';
    case 'elo':
      return '💳';
    case 'hipercard':
      return '💳';
    default:
      return '💳';
  }
};

export function CreditCardForm({
  onSubmit,
  onCancel,
  isLoading = false,
  defaultValues,
}: CreditCardFormProps) {
  const [cardBrand, setCardBrand] = useState<string>('unknown');
  const [expiryError, setExpiryError] = useState<string | null>(null);

  const form = useForm<CreditCardFormValues>({
    resolver: zodResolver(creditCardFormSchema),
    defaultValues: defaultValues || {
      holderName: '',
      number: '',
      expiryMonth: '',
      expiryYear: '',
      ccv: '',
      name: '',
      email: '',
      cpfCnpj: '',
      postalCode: '',
      addressNumber: '',
      addressComplement: '',
      phone: '',
      mobilePhone: '',
    },
  });

  // Watch card number to detect brand
  const cardNumber = form.watch('number');
  const expiryMonth = form.watch('expiryMonth');
  const expiryYear = form.watch('expiryYear');

  useEffect(() => {
    if (cardNumber) {
      const brand = getCreditCardBrand(cardNumber);
      setCardBrand(brand);
    } else {
      setCardBrand('unknown');
    }
  }, [cardNumber]);

  // Validate expiry date when month or year changes
  useEffect(() => {
    if (expiryMonth && expiryYear) {
      const isValid = validateCreditCardExpiry(expiryMonth, expiryYear);
      if (!isValid) {
        setExpiryError('Data de validade inválida ou expirada');
      } else {
        setExpiryError(null);
      }
    } else {
      setExpiryError(null);
    }
  }, [expiryMonth, expiryYear]);

  const handleSubmit = (data: CreditCardFormValues) => {
    // Prepare credit card data
    const creditCard: CreditCardData = {
      holderName: data.holderName.trim(),
      number: unmask(data.number),
      expiryMonth: data.expiryMonth,
      expiryYear: data.expiryYear,
      ccv: unmask(data.ccv),
    };

    // Prepare holder info
    const holderInfo: CreditCardHolderInfo = {
      name: data.name.trim(),
      email: data.email.trim(),
      cpfCnpj: unmask(data.cpfCnpj),
      postalCode: unmask(data.postalCode),
      addressNumber: data.addressNumber.trim(),
      addressComplement: data.addressComplement?.trim() || undefined,
      phone: unmask(data.phone),
      mobilePhone: data.mobilePhone ? unmask(data.mobilePhone) : undefined,
    };

    onSubmit({ credit_card: creditCard, credit_card_holder_info: holderInfo });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Card Information Section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Dados do Cartão</h3>
            </div>

            {/* Card Number */}
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do Cartão</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        placeholder="0000 0000 0000 0000"
                        maxLength={19}
                        onChange={(e) => {
                          const masked = maskCreditCard(e.target.value);
                          field.onChange(masked);
                        }}
                        className="pr-12"
                      />
                      {cardBrand !== 'unknown' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xl">
                          {getCardBrandIcon(cardBrand)}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Card Holder Name */}
            <FormField
              control={form.control}
              name="holderName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome no Cartão (exatamente como está no cartão)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="NOME COMPLETO"
                      className="uppercase"
                      onChange={(e) => {
                        field.onChange(e.target.value.toUpperCase());
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Digite o nome exatamente como aparece no cartão
                  </p>
                </FormItem>
              )}
            />

            {/* Expiry and CVV */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Validade</Label>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="expiryMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="MM"
                            maxLength={2}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                              if (value.length === 1 && parseInt(value) > 1) {
                                field.onChange('0' + value);
                              } else {
                                field.onChange(value);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiryYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="AAAA"
                            maxLength={4}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {expiryError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {expiryError}
                  </p>
                )}
              </div>

              <FormField
                control={form.control}
                name="ccv"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CVV</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="123"
                        maxLength={4}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          field.onChange(value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card Holder Information Section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Dados do Titular</h3>
            </div>

            {/* Full Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome completo do titular" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="email@exemplo.com"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* CPF */}
            <FormField
              control={form.control}
              name="cpfCnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      onChange={(e) => {
                        const masked = maskCpf(e.target.value);
                        field.onChange(masked);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Postal Code and Address Number */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="00000-000"
                        maxLength={9}
                        onChange={(e) => {
                          const masked = maskCep(e.target.value);
                          field.onChange(masked);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="addressNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="123" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Address Complement */}
            <FormField
              control={form.control}
              name="addressComplement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complemento (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Apto, Bloco, etc." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        onChange={(e) => {
                          const masked = maskPhone(e.target.value);
                          field.onChange(masked);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mobilePhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Celular (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        onChange={(e) => {
                          const masked = maskPhone(e.target.value);
                          field.onChange(masked);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={isLoading} className="ml-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              'Confirmar Pagamento'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

