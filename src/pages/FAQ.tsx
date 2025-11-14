import { useState } from "react";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, HelpCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FAQArticle {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
}

export default function FAQ() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Mock FAQ data - will be replaced with backend data
  const articles: FAQArticle[] = [
    {
      id: 1,
      title: "Como faço para me inscrever em uma corrida?",
      content: "Para se inscrever em uma corrida, acesse a página de eventos, escolha a corrida desejada, selecione a categoria e preencha o formulário de inscrição com seus dados pessoais. Após a confirmação do pagamento, você receberá um e-mail de confirmação com todos os detalhes.",
      category: "Inscrições",
      tags: ["inscrição", "evento", "pagamento"],
    },
    {
      id: 2,
      title: "Quais são as formas de pagamento aceitas?",
      content: "Aceitamos pagamento via PIX, cartão de crédito (até 12x), cartão de débito e boleto bancário. O pagamento via PIX é confirmado instantaneamente, enquanto boleto pode levar até 2 dias úteis para compensação.",
      category: "Pagamento",
      tags: ["pagamento", "pix", "cartão", "boleto"],
    },
    {
      id: 3,
      title: "Como faço para retirar meu kit?",
      content: "A retirada do kit deve ser feita no local e horário especificados no regulamento do evento. É necessário apresentar um documento com foto e o QR Code da inscrição disponível no seu perfil. Não é permitida a retirada por terceiros sem procuração.",
      category: "Kit",
      tags: ["kit", "retirada", "documento"],
    },
    {
      id: 4,
      title: "Posso transferir minha inscrição para outra pessoa?",
      content: "Sim, é possível transferir sua inscrição. Entre em contato com o organizador do evento através do e-mail fornecido na página do evento, informando os dados completos da pessoa que receberá a inscrição. Pode haver cobrança de taxa administrativa.",
      category: "Inscrições",
      tags: ["transferência", "inscrição"],
    },
    {
      id: 5,
      title: "Quando saem os resultados da corrida?",
      content: "Os resultados preliminares são publicados em até 2 horas após o término da prova. Os resultados oficiais, após análise e validação, ficam disponíveis em até 48 horas. Você será notificado por e-mail quando os resultados estiverem disponíveis.",
      category: "Resultados",
      tags: ["resultados", "tempo", "classificação"],
    },
    {
      id: 6,
      title: "Como funciona o chip de cronometragem?",
      content: "O chip é um dispositivo eletrônico que registra seu tempo de prova. Ele deve ser fixado no tênis conforme as instruções fornecidas. O chip registra automaticamente sua passagem pela linha de largada, pontos intermediários e chegada. Não é necessário devolver o chip após a prova.",
      category: "Cronometragem",
      tags: ["chip", "cronometragem", "tempo"],
    },
    {
      id: 7,
      title: "Posso cancelar minha inscrição?",
      content: "O cancelamento está sujeito às políticas de cada evento. Geralmente, cancelamentos feitos com mais de 30 dias de antecedência têm reembolso de 50% do valor pago. Cancelamentos com menos de 30 dias não têm direito a reembolso. Consulte o regulamento específico do evento.",
      category: "Inscrições",
      tags: ["cancelamento", "reembolso"],
    },
    {
      id: 8,
      title: "Como posso comprovar minha participação?",
      content: "Após o término do evento, você pode acessar seu histórico de pagamentos no perfil e baixar o recibo da inscrição. O certificado de conclusão fica disponível para download após a publicação dos resultados oficiais, em até 48 horas.",
      category: "Documentos",
      tags: ["certificado", "comprovante", "recibo"],
    },
  ];

  const categories = ["all", ...Array.from(new Set(articles.map((a) => a.category)))];

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryLabel = (cat: string) => {
    return cat === "all" ? "Todas" : cat;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="bg-gradient-hero py-16">
        <div className="container mx-auto px-4 text-center">
          <HelpCircle className="h-16 w-16 mx-auto mb-4 text-white" />
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Central de Ajuda</h1>
          <p className="text-lg text-white/90 max-w-2xl mx-auto">
            Encontre respostas para suas dúvidas sobre inscrições, eventos e muito mais
          </p>
        </div>
      </section>

      {/* Search and Filters */}
      <div className="container mx-auto px-4 -mt-8">
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Buscar por palavra-chave..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => setSelectedCategory(category)}
                >
                  {getCategoryLabel(category)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FAQ Content */}
      <div className="container mx-auto px-4 py-12">
        {filteredArticles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                Nenhum artigo encontrado para "{searchTerm}"
              </p>
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Limpar busca
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">
                {selectedCategory === "all" 
                  ? "Perguntas Frequentes" 
                  : `${selectedCategory} (${filteredArticles.length})`}
              </h2>
              <p className="text-muted-foreground">
                {filteredArticles.length} {filteredArticles.length === 1 ? "artigo encontrado" : "artigos encontrados"}
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {filteredArticles.map((article) => (
                <Card key={article.id}>
                  <AccordionItem value={`item-${article.id}`} className="border-none">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <div className="flex items-start gap-3 text-left">
                        <HelpCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1">{article.title}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {article.category}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      <div className="pl-8">
                        <p className="text-muted-foreground leading-relaxed mb-4">
                          {article.content}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {article.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Card>
              ))}
            </Accordion>
          </div>
        )}
      </div>

      {/* Contact Section */}
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Não encontrou o que procurava?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Nossa equipe está pronta para ajudar. Entre em contato conosco pelo WhatsApp e
            responderemos o mais breve possível.
          </p>
          <Button size="lg" className="bg-green-600 hover:bg-green-700">
            <MessageCircle className="h-5 w-5 mr-2" />
            Falar com Suporte
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-white/70">
            © 2024 CRONOTEAM. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
