import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MapPin, Filter, X, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface EventFiltersState {
  city: string;
  month: string;
  category: string;
  search: string;
  order_by_date?: 'asc' | 'desc';
}

interface EventFiltersProps {
  filters: EventFiltersState;
  onFiltersChange: (filters: EventFiltersState) => void;
  cities: string[];
  categories?: string[];
}

export function EventFilters({ filters, onFiltersChange, cities, categories = [] }: EventFiltersProps) {
  const months = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const activeFiltersCount = [filters.city, filters.month, filters.category].filter(Boolean).length;

  const clearFilters = () => {
    onFiltersChange({ city: "", month: "", category: "", search: filters.search });
  };

  return (
    <div className="w-full">
      {/* Mobile: Grid layout */}
      <div className="grid grid-cols-1 md:hidden gap-3 mb-4">
        <Select
          value={filters.city}
          onValueChange={(value) => onFiltersChange({ ...filters, city: value })}
        >
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Todas as cidades" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.month}
          onValueChange={(value) => onFiltersChange({ ...filters, month: value })}
        >
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Todos os meses" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {categories.length > 0 && (
          <Select
            value={filters.category}
            onValueChange={(value) => onFiltersChange({ ...filters, category: value })}
          >
            <SelectTrigger>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Todas as modalidades" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as modalidades</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.order_by_date || 'asc'}
          onValueChange={(value) => onFiltersChange({ ...filters, order_by_date: value as 'asc' | 'desc' })}
        >
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Ordenar por data" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Mais próximo primeiro</SelectItem>
            <SelectItem value="desc">Mais longe primeiro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Flex layout em uma única linha */}
      <div className="hidden md:flex items-center gap-3 flex-1 min-w-0">
        <Select
          value={filters.city}
          onValueChange={(value) => onFiltersChange({ ...filters, city: value })}
        >
          <SelectTrigger className="whitespace-nowrap min-w-[180px]">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Todas as cidades" className="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.month}
          onValueChange={(value) => onFiltersChange({ ...filters, month: value })}
        >
          <SelectTrigger className="whitespace-nowrap min-w-[180px]">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Todos os meses" className="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {categories.length > 0 && (
          <Select
            value={filters.category}
            onValueChange={(value) => onFiltersChange({ ...filters, category: value })}
          >
            <SelectTrigger className="whitespace-nowrap min-w-[180px]">
              <div className="flex items-center gap-2 min-w-0">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Todas as modalidades" className="truncate" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as modalidades</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.order_by_date || 'asc'}
          onValueChange={(value) => onFiltersChange({ ...filters, order_by_date: value as 'asc' | 'desc' })}
        >
          <SelectTrigger className="whitespace-nowrap min-w-[200px]">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Ordenar por data" className="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Mais próximo primeiro</SelectItem>
            <SelectItem value="desc">Mais longe primeiro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-sm text-muted-foreground">Filtros ativos:</span>
          {filters.city && filters.city !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {filters.city}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, city: "" })}
              />
            </Badge>
          )}
          {filters.month && filters.month !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {months.find((m) => m.value === filters.month)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, month: "" })}
              />
            </Badge>
          )}
          {filters.category && filters.category !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {filters.category}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, category: "" })}
              />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
