import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, File, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { uploadBanner, uploadRegulation, deleteFile, UploadResponse } from "@/lib/api/upload";

interface FileUploadProps {
  value?: string;
  onChange: (url: string | null) => void;
  accept?: string;
  type: "banner" | "regulation";
  label?: string;
  description?: string;
  onDelete?: () => void;
}

export function FileUpload({
  value,
  onChange,
  accept,
  type,
  label,
  description,
  onDelete,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update preview when value changes externally
  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (type === "banner") {
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (!validTypes.includes(file.type)) {
        toast.error("Apenas imagens são permitidas (JPEG, PNG, WEBP, GIF)");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("A imagem deve ter no máximo 5MB");
        return;
      }
    } else if (type === "regulation") {
      if (file.type !== "application/pdf") {
        toast.error("Apenas arquivos PDF são permitidos");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("O PDF deve ter no máximo 10MB");
        return;
      }
    }

    setIsUploading(true);

    try {
      // Delete old file if exists
      if (value && value.startsWith("http")) {
        // Only delete if it's an uploaded file (not external URL)
        const filename = value.split("/").pop();
        if (filename && (filename.startsWith("banner-") || filename.startsWith("regulation-"))) {
          try {
            await deleteFile(value);
          } catch (error) {
            console.warn("Erro ao remover arquivo antigo:", error);
            // Continue even if deletion fails
          }
        }
      }

      // Upload new file
      let response: UploadResponse;
      if (type === "banner") {
        response = await uploadBanner(file);
      } else {
        response = await uploadRegulation(file);
      }

      if (response.success && response.data) {
        onChange(response.data.url);
        setPreview(response.data.url);
        toast.success(type === "banner" ? "Banner enviado com sucesso!" : "Regulamento enviado com sucesso!");
      } else {
        throw new Error(response.error || "Erro ao fazer upload");
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Erro ao fazer upload do arquivo");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      // Only delete if it's an uploaded file (not external URL)
      const filename = value.split("/").pop();
      if (filename && (filename.startsWith("banner-") || filename.startsWith("regulation-"))) {
        await deleteFile(value);
      }
      onChange(null);
      setPreview(null);
      if (onDelete) onDelete();
      toast.success("Arquivo removido com sucesso!");
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Erro ao remover arquivo");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    onChange(url || null);
    setPreview(url || null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder={type === "banner" ? "https://exemplo.com/banner.jpg" : "https://exemplo.com/regulamento.pdf"}
          value={value || ""}
          onChange={handleInputChange}
          className="flex-1"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={accept || (type === "banner" ? "image/*" : "application/pdf")}
          onChange={handleFileSelect}
          className="hidden"
          id={`file-upload-${type}`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleRemove}
            disabled={isUploading}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="mt-2">
          {type === "banner" ? (
            <div className="relative w-full h-32 border rounded-md overflow-hidden">
              <img
                src={preview}
                alt="Banner preview"
                className="w-full h-full object-cover"
                onError={() => setPreview(null)}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted">
              <File className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground truncate flex-1">
                {preview.split("/").pop() || "Regulamento"}
              </span>
              <a
                href={preview}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Visualizar
              </a>
            </div>
          )}
        </div>
      )}

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

