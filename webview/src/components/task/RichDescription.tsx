import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";
import { t } from "../../i18n";
import { normalizeRichTextHtml, sanitizeRichTextHtml } from "../../richText";

interface Props {
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
}

interface TextSelectionRange {
  from: number;
  to: number;
}

const HTTPS_URL_RE = /https:\/\/[^\s<>"']+/i;

function extractHttpsUrl(value: string): string | null {
  const match = value.match(HTTPS_URL_RE);
  return match ? match[0].replace(/[),.;!?]+$/, "") : null;
}

function ToolbarButton({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`bb-rich-toolbar-btn ${active ? "active" : ""}`}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export function RichDescription({ value, placeholder, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const initialHtml = useMemo(() => normalizeRichTextHtml(value), [value]);
  const [draftHtml, setDraftHtml] = useState(initialHtml);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkInputValue, setLinkInputValue] = useState("");
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const linkRangeRef = useRef<TextSelectionRange | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false,
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialHtml,
    editable: editing,
    editorProps: {
      attributes: {
        class: "bb-rich-description-editor",
      },
    },
    onUpdate: ({ editor }) => {
      setDraftHtml(sanitizeRichTextHtml(editor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editing) {
      setDraftHtml(initialHtml);
      editor?.commands.setContent(initialHtml, { emitUpdate: false });
    }
  }, [editor, editing, initialHtml]);

  useEffect(() => {
    editor?.setEditable(editing);
    if (editing) {
      window.setTimeout(() => editor?.commands.focus("end"), 0);
    }
  }, [editor, editing]);

  useEffect(() => {
    if (linkInputOpen) {
      window.setTimeout(() => linkInputRef.current?.focus(), 0);
    }
  }, [linkInputOpen]);

  const beginEdit = () => setEditing(true);

  const cancel = () => {
    setDraftHtml(initialHtml);
    editor?.commands.setContent(initialHtml, { emitUpdate: false });
    setEditing(false);
  };

  const save = () => {
    const next = sanitizeRichTextHtml(draftHtml);
    if (next !== value) {
      onSave(next);
    }
    setEditing(false);
  };

  const rememberLinkSelection = (activeEditor: Editor) => {
    const { from, to } = activeEditor.state.selection;
    linkRangeRef.current = { from, to };
  };

  const applyLink = (activeEditor: Editor, rawValue: string) => {
    const href = extractHttpsUrl(rawValue);
    if (!href) {
      setLinkInputOpen(true);
      return;
    }

    const range = linkRangeRef.current ?? activeEditor.state.selection;
    activeEditor
      .chain()
      .focus()
      .setTextSelection(range)
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    setLinkInputOpen(false);
    setLinkInputValue("");
  };

  const openManualLinkInput = (activeEditor: Editor) => {
    const current = activeEditor.getAttributes("link").href as string | undefined;
    const currentHttps = current ? extractHttpsUrl(current) : "";
    setLinkInputValue(currentHttps || "");
    setLinkInputOpen(true);
  };

  const handleLinkClick = async (activeEditor: Editor) => {
    rememberLinkSelection(activeEditor);

    try {
      const clipboardText = await navigator.clipboard?.readText();
      const clipboardHref = clipboardText ? extractHttpsUrl(clipboardText) : null;
      if (clipboardHref) {
        applyLink(activeEditor, clipboardHref);
        return;
      }
    } catch {
      // VS Code webviews can deny clipboard reads; the inline input is the fallback.
    }

    openManualLinkInput(activeEditor);
  };

  if (!editing) {
    const hasContent = initialHtml.trim().length > 0;

    return (
      <div
        className={`bb-rich-description-view ${hasContent ? "" : "empty"}`}
        role="button"
        tabIndex={0}
        onClick={beginEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            beginEdit();
          }
        }}
      >
        {hasContent ? (
          <div
            className="bb-rich-description-content"
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        ) : (
          <span>{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bb-rich-description-shell">
      {editor && (
        <BubbleMenu
          editor={editor}
          className="bb-rich-bubble-menu"
          shouldShow={({ editor }) => editor.isEditable && (linkInputOpen || !editor.state.selection.empty)}
        >
          {linkInputOpen ? (
            <form
              className="bb-rich-link-form"
              onSubmit={(event) => {
                event.preventDefault();
                applyLink(editor, linkInputValue);
              }}
            >
              <input
                ref={linkInputRef}
                className="bb-rich-link-input"
                value={linkInputValue}
                placeholder="https://..."
                aria-label="Adres linku"
                onChange={(event) => setLinkInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setLinkInputOpen(false);
                    editor.commands.focus();
                  }
                }}
              />
              <button className="bb-rich-link-action" type="submit">
                OK
              </button>
              <button
                className="bb-rich-link-action ghost"
                type="button"
                onClick={() => {
                  setLinkInputOpen(false);
                  editor.commands.focus();
                }}
              >
                ×
              </button>
            </form>
          ) : (
            <>
              <ToolbarButton label="B" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
              <ToolbarButton label="I" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
              <ToolbarButton label="S" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
              <ToolbarButton label="H1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
              <ToolbarButton label="H2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
              <ToolbarButton label="“”" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
              <ToolbarButton label="</>" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
              <ToolbarButton label="•" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
              <ToolbarButton label="1." active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
              <ToolbarButton label="Link" active={editor.isActive("link")} onClick={() => void handleLinkClick(editor)} />
            </>
          )}
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      <div className="bb-rich-description-actions">
        <button className="bb-btn ghost" type="button" onClick={cancel}>
          {t("common.cancel")}
        </button>
        <button className="bb-btn accent" type="button" onClick={save}>
          {t("settings.save")}
        </button>
      </div>
    </div>
  );
}
