import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Event {
  id: string;
  title: string;
}

interface EventSelectProps {
  events: Event[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function EventSelect({
  events,
  value,
  onValueChange,
  placeholder = "Selecione o evento...",
  className,
}: EventSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedEvent = events.find((event) => event.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedEvent ? selectedEvent.title : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar evento..." />
          <CommandList>
            <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="todos os eventos"
                keywords={["todos", "all", "eventos"]}
                onSelect={() => {
                  onValueChange("all");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "all" ? "opacity-100" : "opacity-0"
                  )}
                />
                Todos os eventos
              </CommandItem>
              {events.map((event) => (
                <CommandItem
                  key={event.id}
                  value={event.title.toLowerCase()}
                  keywords={[event.title, event.id]}
                  onSelect={() => {
                    onValueChange(event.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === event.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {event.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
