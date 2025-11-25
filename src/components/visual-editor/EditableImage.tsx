import { useState } from "react";
import { useVisualEditor } from "@/contexts/VisualEditorContext";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";

interface EditableImageProps {
  contentKey: string;
  defaultValue: string;
  className?: string;
  alt?: string;
}

export const EditableImage = ({ 
  contentKey, 
  defaultValue, 
  className,
  alt = ""
}: EditableImageProps) => {
  const { isEditing, editedContent, updateContent } = useVisualEditor();
  const [isHovered, setIsHovered] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempUrl, setTempUrl] = useState("");

  const currentValue = editedContent[contentKey] ?? defaultValue;

  const handleUpdateImage = () => {
    if (tempUrl) {
      updateContent(contentKey, tempUrl);
      setShowUrlInput(false);
      setTempUrl("");
    }
  };

  if (!isEditing) {
    return <img src={currentValue} alt={alt} className={className} />;
  }

  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img 
        src={currentValue} 
        alt={alt} 
        className={cn(
          className,
          isEditing && "transition-all",
          isEditing && isHovered && "ring-2 ring-primary/50"
        )}
      />
      
      {isEditing && isHovered && !showUrlInput && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Button
            size="sm"
            onClick={() => setShowUrlInput(true)}
            className="gap-2"
          >
            <ImageIcon className="h-4 w-4" />
            Alterar Imagem
          </Button>
        </div>
      )}

      {showUrlInput && (
        <div className="absolute inset-0 bg-background/95 p-4 flex flex-col gap-2 justify-center">
          <Input
            placeholder="Cole a URL da nova imagem"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdateImage}>
              Aplicar
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setShowUrlInput(false);
                setTempUrl("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
