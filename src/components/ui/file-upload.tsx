import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, File } from "lucide-react";

interface FileUploadProps {
  value?: string | null; // URL do arquivo atual
  onChange: (url: string | null) => void;
  onDelete?: () => void;
  accept?: string;
  maxSize?: number; // em MB
  type: 'banner' | 'regulation';
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function FileUpload({
  value,
  onChange,
  onDelete,
  accept,
  maxSize = 10,
  type,
  label,
  description,
  disabled = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [oldUrl, setOldUrl] = useState<string | null>(value || null);

  // Update preview when value changes
  useEffect(() => {
    if (value !== oldUrl) {
      setPreview(value || null);
      setOldUrl(value || null);
    }
  }, [value]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      alert(`Arquivo muito grande. Tamanho máximo: ${maxSize}MB`);
      return;
    }

    // Validate file type
    if (type === 'banner') {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        alert('Apenas imagens são permitidas (JPEG, PNG, WEBP, GIF)');
        return;
      }
    } else if (type === 'regulation') {
      if (file.type !== 'application/pdf') {
        alert('Apenas arquivos PDF são permitidos');
        return;
      }
    }

    setUploading(true);

    try {
      // Import upload function dynamically
      const { uploadBanner, uploadRegulation, deleteUploadedFile } = await import('@/lib/api/upload');

      // Delete old file if exists (non-blocking)
      if (oldUrl && oldUrl.includes('/uploads/')) {
        // Only delete if it's a local file (not external URL)
        // Não aguardar a deleção, fazer em paralelo sem bloquear
        deleteUploadedFile(type, oldUrl).catch((error) => {
          // Não bloquear o upload se a deleção falhar
          console.warn('Aviso: Não foi possível deletar o arquivo antigo:', error);
        });
      }

      // Upload new file
      const uploadFunction = type === 'banner' ? uploadBanner : uploadRegulation;
      const response = await uploadFunction(file);

      console.log('📤 Upload response:', response);

      if (response.success && response.data && response.data.url) {
        let newUrl = response.data.url;
        
        // Corrigir URL se contiver template strings (fallback)
        if (newUrl.includes('${')) {
          const port = window.location.port || '3001';
          newUrl = newUrl.replace(/\$\{API_PORT\}/g, port);
          // Se ainda tiver template strings, usar localhost:3001 como padrão
          if (newUrl.includes('${')) {
            newUrl = newUrl.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
          }
        }
        
        console.log('✅ URL recebida (corrigida):', newUrl);
        setPreview(newUrl);
        setOldUrl(newUrl);
        onChange(newUrl);
      } else {
        console.error('❌ Erro na resposta do upload:', response);
        alert(response.error || 'Erro ao fazer upload do arquivo');
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload do arquivo. Tente novamente.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!value) return;

    // Only delete if it's a local file
    const isLocalFile = value.includes('/uploads/');
    if (isLocalFile) {
      try {
        const { deleteUploadedFile } = await import('@/lib/api/upload');
        await deleteUploadedFile(type, value);
      } catch (error) {
        console.warn('Erro ao deletar arquivo:', error);
      }
    }

    setPreview(null);
    setOldUrl(null);
    onChange(null);
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          accept={accept || (type === 'banner' ? 'image/*' : 'application/pdf')}
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
          id={`file-upload-${type}`}
        />
        <label htmlFor={`file-upload-${type}`}>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            className="cursor-pointer"
            asChild
          >
            <span>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Enviando...' : 'Fazer Upload'}
            </span>
          </Button>
        </label>
        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={disabled || uploading}
            className="text-destructive hover:text-destructive"
            title="Remover arquivo"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="mt-2">
          {type === 'banner' ? (
            <div className="relative w-full h-48 border rounded-md overflow-hidden bg-muted">
              <img
                src={preview}
                alt="Banner preview"
                className="w-full h-full object-cover"
                onLoad={() => {
                  console.log('✅ Imagem carregada com sucesso:', preview);
                }}
                onError={(e) => {
                  console.error('❌ Erro ao carregar imagem:', preview, e);
                  // If image fails to load, clear preview
                  setPreview(null);
                  setOldUrl(null);
                  onChange(null);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted">
              <File className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground truncate flex-1">
                {preview.split('/').pop() || 'Regulamento'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  if (preview) {
                    // Corrigir URL se contiver template strings
                    let urlToOpen = preview;
                    if (urlToOpen.includes('${')) {
                      const port = window.location.port || '3001';
                      urlToOpen = urlToOpen.replace(/\$\{API_PORT\}/g, port);
                      // Se ainda tiver template strings, usar localhost:3001 como padrão
                      if (urlToOpen.includes('${')) {
                        urlToOpen = urlToOpen.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
                      }
                    }
                    console.log('🔗 Abrindo PDF:', urlToOpen);
                    // Abrir PDF em nova aba
                    window.open(urlToOpen, '_blank');
                  }
                }}
                className="ml-auto text-sm text-primary hover:underline cursor-pointer"
              >
                Visualizar
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Debug info (remove in production) */}
      {preview && (
        <p className="text-xs text-muted-foreground">Preview URL: {preview}</p>
      )}

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

