import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, X } from "lucide-react";
import { getOrganizers } from "@/lib/api/userManagement";
import { cn } from "@/lib/utils";

export interface SelectedOrganizer {
  id: string;
  name: string;
  email: string;
  phone: string;
  organizationName?: string | null;
}

interface OrganizerSearchPickerProps {
  value: SelectedOrganizer | null;
  onChange: (organizer: SelectedOrganizer | null) => void;
  disabled?: boolean;
}

export function OrganizerSearchPicker({
  value,
  onChange,
  disabled = false,
}: OrganizerSearchPickerProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SelectedOrganizer[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (disabled || value) return;

    const load = async () => {
      setLoading(true);
      try {
        const response = await getOrganizers(debouncedSearch || undefined);
        if (response.success && response.data) {
          const list = Array.isArray(response.data) ? response.data : response.data.items;
          setResults(
            list.map((org) => ({
              id: org.id,
              name: org.name || org.email,
              email: org.email,
              phone: org.phone || "",
              organizationName: null,
            }))
          );
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [debouncedSearch, disabled, value]);

  const handleClear = () => {
    onChange(null);
    setSearch("");
    setResults([]);
  };

  if (value) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 text-sm flex-1 min-w-0">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="font-medium truncate">{value.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Organização</p>
                <p className="font-medium truncate">{value.organizationName || "Não informado"}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="font-medium">{value.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="font-medium truncate">{value.email}</p>
                </div>
              </div>
            </div>
            {!disabled && (
              <Button type="button" variant="ghost" size="icon" onClick={handleClear} title="Limpar seleção">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, e-mail ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            {debouncedSearch ? "Nenhum organizador encontrado." : "Digite para buscar organizadores."}
          </p>
        ) : (
          <ul className="divide-y">
            {results.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(org)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <p className="font-medium text-sm">{org.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{org.email}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
