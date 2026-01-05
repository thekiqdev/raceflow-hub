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
import { PublicFormFieldConfiguration } from "@/lib/api/formConfigurations";
import { Control, FieldValues, Path } from "react-hook-form";

interface DynamicFormFieldProps<T extends FieldValues> {
  field: PublicFormFieldConfiguration;
  control: Control<T>;
  name: Path<T>;
  className?: string;
}

export function DynamicFormField<T extends FieldValues>({
  field,
  control,
  name,
  className = "",
}: DynamicFormFieldProps<T>) {
  const widthClass = field.field_width === '50%' ? 'w-full md:w-1/2' : 
                     field.field_width === '33%' ? 'w-full md:w-1/3' : 
                     'w-full';

  const renderField = () => {
    switch (field.field_type) {
      case 'textarea':
        return (
          <Textarea
            placeholder={field.field_placeholder}
            className={`bg-muted ${className}`}
            {...control.register(name as any, {
              required: field.field_required,
            })}
          />
        );

      case 'select':
        const options = Array.isArray(field.field_options) 
          ? field.field_options 
          : field.field_options 
            ? String(field.field_options).split('\n').filter(o => o.trim())
            : [];
        
        return (
          <Select
            {...control.register(name as any, {
              required: field.field_required,
            })}
          >
            <SelectTrigger className={`bg-muted ${className}`}>
              <SelectValue placeholder={field.field_placeholder || "Selecione"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option: string, index: number) => (
                <SelectItem key={index} value={option.trim()}>
                  {option.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <Input
            type="date"
            placeholder={field.field_placeholder}
            className={`bg-muted ${className}`}
            {...control.register(name as any, {
              required: field.field_required,
            })}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            placeholder={field.field_placeholder}
            className={`bg-muted ${className}`}
            {...control.register(name as any, {
              required: field.field_required,
              valueAsNumber: true,
            })}
          />
        );

      case 'email':
        return (
          <Input
            type="email"
            placeholder={field.field_placeholder}
            className={`bg-muted ${className}`}
            {...control.register(name as any, {
              required: field.field_required,
            })}
          />
        );

      case 'tel':
        return (
          <Input
            type="tel"
            placeholder={field.field_placeholder}
            className={`bg-muted ${className}`}
            {...control.register(name as any, {
              required: field.field_required,
            })}
          />
        );

      default: // text
        return (
          <Input
            type="text"
            placeholder={field.field_placeholder}
            className={`bg-muted ${className}`}
            {...control.register(name as any, {
              required: field.field_required,
            })}
          />
        );
    }
  };

  return (
    <div className={`${widthClass} space-y-2`}>
      <Label htmlFor={field.field_key}>
        {field.field_label}
        {field.field_required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {renderField()}
    </div>
  );
}

