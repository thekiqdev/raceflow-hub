import { useVisualEditor } from "@/contexts/VisualEditorContext";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Save, X } from "lucide-react";
import { toast } from "sonner";

export const EditorToolbar = () => {
  const { isEditing, setIsEditing, saveChanges, isSaving } = useVisualEditor();

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
    if (!isEditing) {
      toast.info("Modo de edição ativado. Clique nos textos para editar.");
    }
  };

  const handleSave = async () => {
    try {
      await saveChanges();
      toast.success("Alterações salvas com sucesso!");
      setIsEditing(false);
    } catch (error) {
      toast.error("Erro ao salvar alterações");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    window.location.reload(); // Recarrega para descartar alterações
  };

  if (!isEditing) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button onClick={handleToggleEdit} className="gap-2 shadow-lg">
          <Edit className="h-4 w-4" />
          Editar Página
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex gap-2 bg-background border rounded-lg p-2 shadow-lg">
      <Button 
        onClick={handleSave} 
        disabled={isSaving}
        className="gap-2"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Salvando..." : "Salvar"}
      </Button>
      <Button 
        onClick={handleCancel}
        variant="outline"
        className="gap-2"
      >
        <X className="h-4 w-4" />
        Cancelar
      </Button>
    </div>
  );
};
