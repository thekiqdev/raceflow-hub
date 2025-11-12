import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy } from "lucide-react";

interface ResultEntry {
  position: number;
  bib_number: string;
  name: string;
  club: string;
  gender: string;
  category: string;
  category_position: number;
  final_time: string;
  interval: string;
  net_time: string;
  pace: string;
}

export function EventResults() {
  // Mock data baseado na imagem de referência
  const results: ResultEntry[] = [
    {
      position: 1,
      bib_number: "100001",
      name: "RONY GLAYSON DA SILVA FERREIRA",
      club: "",
      gender: "Masculino",
      category: "5KGEM",
      category_position: 1,
      final_time: "0:17:17.884",
      interval: "",
      net_time: "0:17:17.883",
      pace: "03:28",
    },
    {
      position: 2,
      bib_number: "100018",
      name: "JOAO BATISTA ARAUJO NETO",
      club: "",
      gender: "Masculino",
      category: "5KGEM",
      category_position: 2,
      final_time: "0:17:55.130",
      interval: "+37.246",
      net_time: "0:17:53.631",
      pace: "03:35",
    },
    {
      position: 3,
      bib_number: "100008",
      name: "JOSÉ LUCAS DOS SANTOS SILVA",
      club: "",
      gender: "Masculino",
      category: "5KGEM",
      category_position: 3,
      final_time: "0:18:06.629",
      interval: "+48.745",
      net_time: "0:18:05.878",
      pace: "03:37",
    },
    {
      position: 4,
      bib_number: "317",
      name: "LUCIO FERANDO DE JESUS",
      club: "",
      gender: "Masculino",
      category: "M3039",
      category_position: 1,
      final_time: "0:18:47.000",
      interval: "+1:29.116",
      net_time: "0:18:47.000",
      pace: "03:46",
    },
    {
      position: 5,
      bib_number: "100024",
      name: "RODRIGO DE SOUSA GOMES",
      club: "",
      gender: "Masculino",
      category: "F3039",
      category_position: 1,
      final_time: "0:18:58.372",
      interval: "+1:40.488",
      net_time: "0:18:56.871",
      pace: "03:47",
    },
    {
      position: 6,
      bib_number: "100029",
      name: "JOSÉ JERRE CASTRO BARROSO",
      club: "",
      gender: "Masculino",
      category: "F3039",
      category_position: 2,
      final_time: "0:19:52.117",
      interval: "+2:34.233",
      net_time: "0:19:49.864",
      pace: "03:58",
    },
    {
      position: 7,
      bib_number: "100006",
      name: "WILDNA SA PEREIRA",
      club: "",
      gender: "Feminino",
      category: "5KGEF",
      category_position: 1,
      final_time: "0:20:04.865",
      interval: "+2:46.981",
      net_time: "0:20:04.613",
      pace: "04:01",
    },
    {
      position: 8,
      bib_number: "100019",
      name: "PEDRO CESAR SOUSA GOMES",
      club: "",
      gender: "Masculino",
      category: "M1829",
      category_position: 1,
      final_time: "0:20:19.364",
      interval: "+3:01.480",
      net_time: "0:20:17.865",
      pace: "04:04",
    },
    {
      position: 9,
      bib_number: "100011",
      name: "FRANCISCO CLAILTON G PEREIRA",
      club: "",
      gender: "Masculino",
      category: "M4049",
      category_position: 1,
      final_time: "0:20:45.860",
      interval: "+3:27.976",
      net_time: "0:20:44.610",
      pace: "04:09",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Resultados Oficiais
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center w-20">Posição</TableHead>
                <TableHead className="text-center w-24">Número</TableHead>
                <TableHead className="min-w-[250px]">Nome</TableHead>
                <TableHead className="min-w-[150px]">Clube</TableHead>
                <TableHead className="text-center w-24">Sexo</TableHead>
                <TableHead className="text-center w-28">Categoria</TableHead>
                <TableHead className="text-center w-32">Posição na Categoria</TableHead>
                <TableHead className="text-center w-32">Tempo Final</TableHead>
                <TableHead className="text-center w-28">Intervalo</TableHead>
                <TableHead className="text-center w-32">Tempo líquido</TableHead>
                <TableHead className="text-center w-20">Ritmo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.position}>
                  <TableCell className="text-center font-medium">{result.position}.</TableCell>
                  <TableCell className="text-center">{result.bib_number}</TableCell>
                  <TableCell className="font-medium">{result.name}</TableCell>
                  <TableCell>{result.club || "-"}</TableCell>
                  <TableCell className="text-center">{result.gender}</TableCell>
                  <TableCell className="text-center">{result.category}</TableCell>
                  <TableCell className="text-center font-semibold">{result.category_position}</TableCell>
                  <TableCell className="text-center font-bold text-primary">
                    {result.final_time}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {result.interval || "-"}
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    {result.net_time}
                  </TableCell>
                  <TableCell className="text-center">{result.pace}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
