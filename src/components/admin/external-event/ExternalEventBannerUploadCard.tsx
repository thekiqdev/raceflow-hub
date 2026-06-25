import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalEventBannerUploadCardProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function ExternalEventBannerUploadCard({
  value,
  onChange,
  disabled = false,
}: ExternalEventBannerUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMb = 10;
    if (file.size > maxSizeMb * 1024 * 1024) {
      alert(`Arquivo muito grande. Tamanho máximo: ${maxSizeMb}MB`);
      return;
    }

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      alert("Apenas imagens são permitidas (JPEG, PNG, WEBP, GIF)");
      return;
    }

    setUploading(true);
    try {
      const { uploadBanner, deleteUploadedFile } = await import("@/lib/api/upload");

      if (value?.includes("/uploads/")) {
        deleteUploadedFile("banner", value).catch(() => undefined);
      }

      const response = await uploadBanner(file);
      if (response.success && response.data?.url) {
        let newUrl = response.data.url;
        if (newUrl.includes("${")) {
          const port = window.location.port || "3001";
          newUrl = newUrl.replace(/\$\{API_PORT\}/g, port);
          if (newUrl.includes("${")) {
            newUrl = newUrl.replace(/http:\/\/localhost:\$\{API_PORT\}/g, "http://localhost:3001");
          }
        }
        onChange(newUrl);
      } else {
        alert(response.error || "Erro ao fazer upload do banner");
      }
    } catch {
      alert("Erro ao fazer upload do banner. Tente novamente.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    if (value.includes("/uploads/")) {
      try {
        const { deleteUploadedFile } = await import("@/lib/api/upload");
        await deleteUploadedFile("banner", value);
      } catch {
        // non-blocking
      }
    }
    onChange(null);
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
        className="hidden"
        id="external-event-banner-upload"
        disabled={disabled || uploading}
        onChange={handleFileSelect}
      />

      {!value ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "w-full rounded-xl border-2 border-dashed border-muted-foreground/25",
            "bg-muted/30 hover:bg-muted/50 transition-colors",
            "flex flex-col items-center justify-center gap-3 py-16 px-6",
            "text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {uploading ? (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          ) : (
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium text-base">
              {uploading ? "Enviando banner..." : "Clique para enviar banner"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">1920×800 recomendado</p>
            <p className="text-xs text-muted-foreground mt-0.5">JPEG · PNG · WEBP · GIF</p>
          </div>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="relative w-full overflow-hidden rounded-xl border bg-muted/20 aspect-[1920/800] max-h-72">
            <img
              src={value}
              alt="Preview do banner"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Trocar Banner
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || uploading}
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
            >
              <X className="mr-2 h-4 w-4" />
              Remover Banner
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
