import { createContext, useContext, useState, ReactNode } from "react";

interface VisualEditorContextType {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editedContent: Record<string, any>;
  updateContent: (key: string, value: any) => void;
  saveChanges: () => Promise<void>;
  isSaving: boolean;
}

const VisualEditorContext = createContext<VisualEditorContextType | undefined>(undefined);

export const useVisualEditor = () => {
  const context = useContext(VisualEditorContext);
  if (!context) {
    throw new Error("useVisualEditor must be used within VisualEditorProvider");
  }
  return context;
};

interface VisualEditorProviderProps {
  children: ReactNode;
  initialContent?: Record<string, any>;
  onSave?: (content: Record<string, any>) => Promise<void>;
}

export const VisualEditorProvider = ({ 
  children, 
  initialContent = {},
  onSave 
}: VisualEditorProviderProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<Record<string, any>>(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const updateContent = (key: string, value: any) => {
    setEditedContent(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveChanges = async () => {
    if (onSave) {
      setIsSaving(true);
      try {
        await onSave(editedContent);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <VisualEditorContext.Provider 
      value={{ 
        isEditing, 
        setIsEditing, 
        editedContent, 
        updateContent, 
        saveChanges,
        isSaving 
      }}
    >
      {children}
    </VisualEditorContext.Provider>
  );
};
