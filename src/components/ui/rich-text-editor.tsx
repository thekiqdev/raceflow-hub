import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  /** HTML string (TipTap output). */
  value?: string | null;
  /** Called when content changes, with HTML string. */
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Optional key to remount editor when source changes (e.g. event id). */
  editorKey?: string;
  /** Min height in pixels. */
  minHeight?: number;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Escreva aqui…",
  className,
  editorKey,
  minHeight = 160,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    key: editorKey ?? undefined,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value ?? "",
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[var(--min-h)] px-3 py-2",
        style: `--min-h: ${minHeight}px`,
      },
    },
  });

  // Sync external value into editor when it changes (e.g. loading event for edit)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value ?? "";
    if (next !== current) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  useEffect(() => {
    if (editor === null) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
