import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";
import { t } from "../../i18n";
import { normalizeRichTextHtml, sanitizeRichTextHtml } from "../../richText";
import { FILE_MENTION_RE, shouldLinkFileMention } from "../../fileMentionDisplay";
import { FileIcon, FolderIcon } from "../Icons";
import type { FileMentionEntry } from "../../types";

interface Props {
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  fileSuggestions: FileMentionEntry[];
  onSearchFiles: (query: string) => void;
  onOpenFile: (path: string) => void;
}

interface TextSelectionRange {
  from: number;
  to: number;
}

const HTTPS_URL_RE = /https:\/\/[^\s<>"']+/i;
const FILE_MENTION_SCHEME = "branchboard-file:";

function extractHttpsUrl(value: string): string | null {
  const match = value.match(HTTPS_URL_RE);
  return match ? match[0].replace(/[),.;!?]+$/, "") : null;
}

function fileMentionHref(path: string): string {
  return `${FILE_MENTION_SCHEME}${encodeURIComponent(path)}`;
}

function filePathFromHref(href: string): string | null {
  if (!href.startsWith(FILE_MENTION_SCHEME)) {
    return null;
  }
  try {
    return decodeURIComponent(href.slice(FILE_MENTION_SCHEME.length));
  } catch {
    return href.slice(FILE_MENTION_SCHEME.length);
  }
}

function linkifyFileMentions(html: string): string {
  if (!html.trim() || typeof document === "undefined") {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (parent?.closest("a, code, pre")) {
      continue;
    }
    if (node.nodeValue?.includes("@")) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    FILE_MENTION_RE.lastIndex = 0;
    let last = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    for (const match of text.matchAll(FILE_MENTION_RE)) {
      const index = match.index ?? 0;
      const prefix = match[1] ?? "";
      const filePath = (match[2] ?? "").replace(/[),.;!?]+$/, "");
      if (!shouldLinkFileMention(filePath)) {
        continue;
      }
      changed = true;
      fragment.append(document.createTextNode(text.slice(last, index + prefix.length)));
      const link = document.createElement("a");
      link.href = fileMentionHref(filePath);
      link.textContent = `@${filePath}`;
      fragment.append(link);
      last = index + prefix.length + 1 + filePath.length;
    }
    if (changed) {
      fragment.append(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    }
  }

  return container.innerHTML;
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

export function RichDescription({ value, placeholder, onSave, fileSuggestions, onSearchFiles, onOpenFile }: Props) {
  const [editing, setEditing] = useState(false);
  const initialHtml = useMemo(() => normalizeRichTextHtml(value), [value]);
  const displayHtml = useMemo(() => sanitizeRichTextHtml(linkifyFileMentions(initialHtml)), [initialHtml]);
  const [draftHtml, setDraftHtml] = useState(initialHtml);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkInputValue, setLinkInputValue] = useState("");
  const [fileMentionQuery, setFileMentionQuery] = useState("");
  const [fileMentionActive, setFileMentionActive] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const linkRangeRef = useRef<TextSelectionRange | null>(null);
  const fileMentionRangeRef = useRef<TextSelectionRange | null>(null);
  const fileMentionActiveRef = useRef(false);
  const fileSuggestionsRef = useRef<FileMentionEntry[]>([]);
  const selectedFileIndexRef = useRef(0);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    fileSuggestionsRef.current = fileSuggestions;
    selectedFileIndexRef.current = Math.min(selectedFileIndexRef.current, Math.max(0, fileSuggestions.length - 1));
  }, [fileSuggestions]);

  useEffect(() => {
    selectedFileIndexRef.current = selectedFileIndex;
  }, [selectedFileIndex]);

  useEffect(() => {
    fileMentionActiveRef.current = fileMentionActive;
  }, [fileMentionActive]);

  useEffect(() => {
    if (!editing || !fileMentionActive) {
      return undefined;
    }
    const timer = window.setTimeout(() => onSearchFiles(fileMentionQuery), 90);
    return () => window.clearTimeout(timer);
  }, [editing, fileMentionActive, fileMentionQuery, onSearchFiles]);

  const updateFileMentionState = (activeEditor: Editor) => {
    const selection = activeEditor.state.selection;
    if (!selection.empty) {
      fileMentionRangeRef.current = null;
      setFileMentionActive(false);
      setFileMentionQuery("");
      return;
    }

    const from = selection.from;
    const lookBehind = activeEditor.state.doc.textBetween(Math.max(0, from - 240), from, "\n", "\n");
    const match = lookBehind.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      fileMentionRangeRef.current = null;
      setFileMentionActive(false);
      setFileMentionQuery("");
      return;
    }

    const query = match[1] ?? "";
    fileMentionRangeRef.current = { from: from - query.length - 1, to: from };
    setFileMentionActive(true);
    setFileMentionQuery(query);
    setSelectedFileIndex(0);
  };

  const moveFileSelection = (delta: number) => {
    const total = fileSuggestionsRef.current.length;
    if (total === 0) {
      return;
    }
    setSelectedFileIndex((current) => {
      const next = (current + delta + total) % total;
      selectedFileIndexRef.current = next;
      return next;
    });
  };

  const insertFileMention = (entry: FileMentionEntry) => {
    const range = fileMentionRangeRef.current;
    const activeEditor = editorRef.current;
    if (!activeEditor || !range) {
      return;
    }

    if (entry.type === "dir") {
      // Drill into the directory: insert plain "<path>/" text and keep the
      // mention active, scoped to that directory, instead of closing it.
      const text = `@${entry.path}/`;
      activeEditor.chain().focus().deleteRange(range).insertContent([{ type: "text", text }]).run();
      fileMentionRangeRef.current = { from: range.from, to: range.from + text.length };
      setSelectedFileIndex(0);
      setFileMentionActive(true);
      setFileMentionQuery(`${entry.path}/`);
      return;
    }

    activeEditor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([
        {
          type: "text",
          text: `@${entry.path}`,
          marks: [{ type: "link", attrs: { href: fileMentionHref(entry.path), target: null, rel: null } }],
        },
        { type: "text", text: " " },
      ])
      .run();
    setFileMentionQuery("");
    setFileMentionActive(false);
    fileMentionRangeRef.current = null;
  };

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
        protocols: ["http", "https", "mailto", "branchboard-file"],
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
      handleKeyDown: (_view, event) => {
        const suggestions = fileSuggestionsRef.current;
        if (!fileMentionActiveRef.current || suggestions.length === 0) {
          return false;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveFileSelection(1);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveFileSelection(-1);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          insertFileMention(suggestions[selectedFileIndexRef.current] ?? suggestions[0]);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setFileMentionQuery("");
          setFileMentionActive(false);
          fileMentionRangeRef.current = null;
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setDraftHtml(sanitizeRichTextHtml(editor.getHTML()));
      updateFileMentionState(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      updateFileMentionState(editor);
    },
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

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
    const next = sanitizeRichTextHtml(linkifyFileMentions(draftHtml));
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
    const hasContent = displayHtml.trim().length > 0;

    const handleViewClick = (event: MouseEvent<HTMLDivElement>) => {
      const link = (event.target as HTMLElement).closest("a");
      if (link) {
        const filePath = filePathFromHref(link.getAttribute("href") ?? "");
        if (filePath) {
          event.preventDefault();
          event.stopPropagation();
          onOpenFile(filePath);
          return;
        }
        event.stopPropagation();
        return;
      }
      beginEdit();
    };

    return (
      <div
        className={`bb-rich-description-view ${hasContent ? "" : "empty"}`}
        role="button"
        tabIndex={0}
        onClick={handleViewClick}
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
            dangerouslySetInnerHTML={{ __html: displayHtml }}
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
      {editing && fileMentionActive && fileSuggestions.length > 0 && (
        <div className="bb-file-mention-menu" role="listbox" aria-label={t("task.fileMentionSuggestions")}>
          {fileSuggestions.slice(0, 8).map((entry, index) => (
            <button
              key={`${entry.type}:${entry.path}`}
              type="button"
              className={`bb-file-mention-item ${entry.type === "dir" ? "is-dir" : "is-file"} ${
                index === selectedFileIndex ? "active" : ""
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                insertFileMention(entry);
              }}
            >
              {entry.type === "dir" ? (
                <FolderIcon size={12} style={{ flexShrink: 0, opacity: 0.85 }} />
              ) : (
                <FileIcon size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
              )}
              <span className="bb-file-mention-name">
                {entry.path.slice(entry.path.lastIndexOf("/") + 1)}
                {entry.type === "dir" ? "/" : ""}
              </span>
              <span className="bb-file-mention-path">{entry.path}</span>
            </button>
          ))}
        </div>
      )}
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
