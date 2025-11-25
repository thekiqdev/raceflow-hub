import { useState, useRef, useEffect } from "react";
import { useVisualEditor } from "@/contexts/VisualEditorContext";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  contentKey: string;
  defaultValue: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  multiline?: boolean;
}

export const EditableText = ({ 
  contentKey, 
  defaultValue, 
  className,
  as: Component = "div",
  multiline = false
}: EditableTextProps) => {
  const { isEditing, editedContent, updateContent } = useVisualEditor();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentValue = editedContent[contentKey] ?? defaultValue;

  useEffect(() => {
    if (contentRef.current && !editedContent[contentKey]) {
      updateContent(contentKey, defaultValue);
    }
  }, [contentKey, defaultValue]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const value = e.currentTarget.textContent || "";
    updateContent(contentKey, value);
  };

  if (!isEditing) {
    return <Component className={className}>{currentValue}</Component>;
  }

  return (
    <div
      ref={contentRef}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onInput={handleInput}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={cn(
        className,
        isEditing && "cursor-text outline-none transition-all",
        isEditing && isHovered && "ring-2 ring-primary/50",
        isEditing && isFocused && "ring-2 ring-primary"
      )}
    >
      {currentValue}
    </div>
  );
};
