import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const quoteFormSchema = z.object({
  fullName: z.string().min(3, "Nome completo é obrigatório"),
  phone: z.string().min(10, "Telefone é obrigatório"),
  email: z.string().email("E-mail inválido"),
  eventLocation: z.string().min(3, "Local da prova é obrigatório"),
  athletesCount: z.string().min(1, "Quantidade de atletas é obrigatória"),
  sameStartFinish: z.string().min(1, "Campo obrigatório"),
  electricPower: z.string().min(1, "Campo obrigatório"),
  additionalPoints: z.string(),
  chestNumbers: z.string().min(1, "Campo obrigatório"),
  distances: z.string().min(1, "Distâncias são obrigatórias"),
  timingGate: z.string().min(1, "Campo obrigatório"),
  cronoteamRegistration: z.string().min(1, "Campo obrigatório"),
  eventDate: z.string().min(1, "Data da prova é obrigatória"),
  description: z.string().min(10, "Descrição é obrigatória"),
});

type QuoteFormValues = z.infer<typeof quoteFormSchema>;

export default function Quote() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      eventLocation: "",
      athletesCount: "",
      sameStartFinish: "",
      electricPower: "",
      additionalPoints: "",
      chestNumbers: "",
      distances: "",
      timingGate: "",
      cronoteamRegistration: "",
      eventDate: "",
      description: "",
    },
  });

  const onSubmit = async (data: QuoteFormValues) => {
    setIsSubmitting(true);
    try {
      // Aqui você pode integrar com backend/email service
      console.log("Quote form data:", data);
      toast.success("Orçamento enviado com sucesso! Entraremos em contato em breve.");
      form.reset();
    } catch (error) {
      toast.error("Erro ao enviar orçamento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-black text-white py-4">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="border-2 border-white px-4 py-2">
              <span className="text-xl font-bold">CRONOTEAM</span>
              <div className="text-xs">CRONOMETRAGEM</div>
            </div>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="hover:text-primary transition-colors">HOME</Link>
            <Link to="/events" className="hover:text-primary transition-colors">INSCRIÇÕES</Link>
            <Link to="/" className="hover:text-primary transition-colors">SERVIÇOS</Link>
            <Link to="/orcamento" className="hover:text-primary transition-colors">ORÇAMENTO</Link>
            <Link to="/" className="hover:text-primary transition-colors">DÚVIDAS</Link>
            <Link to="/" className="hover:text-primary transition-colors">RESULTADOS</Link>
          </nav>

          <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            (85) 99108-4183
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold text-center mb-8">
          Formulário de orçamento de provas
        </h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Nome completo */}
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-muted" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Telefone */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone para contato (whatsapp)</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Telefone com DDD somente números"
                      className="bg-muted"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* E-mail */}
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
                      placeholder="Ex: seunome@gmail.com"
                      className="bg-muted"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Local da prova e Quantidade de atletas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="eventLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Local da prova</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="athletesCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade de atletas?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted">
                          <SelectValue placeholder="Quantos atletas" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="50-100">50-100</SelectItem>
                        <SelectItem value="100-200">100-200</SelectItem>
                        <SelectItem value="200-500">200-500</SelectItem>
                        <SelectItem value="500-1000">500-1000</SelectItem>
                        <SelectItem value="1000+">Mais de 1000</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Largada e Chegada / Energia elétrica */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sameStartFinish"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Largada e Chegada no mesmo lugar?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="electricPower"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Energia elétrica na largada?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Pontos eletrônicos adicionais */}
            <FormField
              control={form.control}
              name="additionalPoints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Pontos eletrônicos adicionais no percurso? Caso sim indique quantos.
                  </FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-muted" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Números de peito */}
            <FormField
              control={form.control}
              name="chestNumbers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precisará de Números de peito?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-muted">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Distâncias */}
            <FormField
              control={form.control}
              name="distances"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quais as distâncias que a prova terá?</FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-muted" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cronômetro de pórtico / Inscrições */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="timingGate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cronômetro de pórtico na largada / chegada?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cronoteamRegistration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>As inscrições serão no site da Cronoteam?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Data prevista */}
            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qual a data prevista para sua prova?</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="date"
                      className="bg-muted"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Descrição */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Descreva como será sua prova com o máximo de detalhes.
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field}
                      rows={6}
                      className="bg-muted resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Enviando..." : "Enviar"}
            </Button>
          </form>
        </Form>
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex justify-center gap-6 mb-4">
            <a href="#" className="hover:text-primary transition-colors">
              <Facebook className="h-6 w-6" />
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              <Instagram className="h-6 w-6" />
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              <MessageCircle className="h-6 w-6" />
            </a>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            AI Website Generator
          </p>
        </div>
      </footer>
    </div>
  );
}
