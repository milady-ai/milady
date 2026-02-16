import { useCallback, type RefObject } from "react";
import { NOTE_TOOLBAR, normalizeText } from "./WorkspaceNotesPanelData";
import type { WorkspaceNote } from "./WorkspaceNotesPanelData";

export interface WorkspaceNotesPanelEditorController {
  applyToolbarAction: (action: string) => void;
  createLink: () => void;
  insertAtCursor: (value: string) => void;
  insertTemplate: (template: string) => void;
  toolbarItems: typeof NOTE_TOOLBAR;
}

export interface WorkspaceNotesPanelEditorControllerParams {
  content: string;
  activeNote?: WorkspaceNote;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  handleContentChange: (value: string) => void;
  setTransientStatus: (value: string) => void;
}

export function useWorkspaceNotesPanelEditorController({
  content,
  activeNote,
  editorRef,
  handleContentChange,
  setTransientStatus,
}: WorkspaceNotesPanelEditorControllerParams): WorkspaceNotesPanelEditorController {
  const handleSelectionInsert = useCallback(
    (prefix: string, suffix = prefix) => {
      const el = editorRef.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = content.slice(start, end);
      const insertBefore = selected || "";
      const replacement = `${prefix}${insertBefore}${suffix}`;

      const next = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
      handleContentChange(next);

      requestAnimationFrame(() => {
        el.focus();
        if (selected) {
          el.setSelectionRange(
            start + prefix.length,
            start + prefix.length + selected.length,
          );
        } else {
          el.setSelectionRange(start + prefix.length, start + prefix.length);
        }
      });
    },
    [content, handleContentChange, editorRef],
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = editorRef.current;
      if (!el) {
        handleContentChange(`${content}${content.endsWith("\n") ? "" : "\n\n"}${text}`);
        return;
      }

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${content.slice(0, start)}${text}${content.slice(end)}`;
      handleContentChange(normalizeText(next));
      setTransientStatus("Template inserted");

      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + text.length;
        el.setSelectionRange(cursor, cursor);
      });
    },
    [content, handleContentChange, setTransientStatus, editorRef],
  );

  const prependLine = useCallback(
    (token: string) => {
      const el = editorRef.current;
      if (!el) return;
      const start = content.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const end = content.indexOf("\n", el.selectionStart);
      const lineEnd = end === -1 ? content.length : end;
      const line = content.slice(start, lineEnd);
      const already = line.startsWith(token);
      const nextLine = already ? line.slice(token.length) : `${token}${line}`;
      const next = `${content.slice(0, start)}${nextLine}${content.slice(lineEnd)}`;
      handleContentChange(next);

      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + nextLine.length;
        el.setSelectionRange(cursor, cursor);
      });
    },
    [content, editorRef, handleContentChange],
  );

  const insertCodeBlock = useCallback(() => {
    handleSelectionInsert("```\n", "\n```");
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      const start = el.selectionStart;
      el.setSelectionRange(start - 4, start - 4);
    });
  }, [editorRef, handleSelectionInsert]);

  const createHeader = useCallback(
    (level: number) => {
      const headingLevel = Math.max(1, Math.min(6, level));
      handleSelectionInsert(`${"#".repeat(headingLevel)} `, "");
    },
    [handleSelectionInsert],
  );

  const applyToolbarAction = useCallback(
    (action: string) => {
      if (!activeNote) return;

      if (action === "header-1") {
        createHeader(1);
      } else if (action === "header-2") {
        createHeader(2);
      } else if (action === "header-3") {
        createHeader(3);
      } else if (action === "bold") {
        handleSelectionInsert("**", "**");
      } else if (action === "italic") {
        handleSelectionInsert("_", "_");
      } else if (action === "code") {
        handleSelectionInsert("`", "`");
      } else if (action === "quote") {
        prependLine("> ");
      } else if (action === "bullet") {
        prependLine("- ");
      } else if (action === "number") {
        prependLine("1. ");
      } else if (action === "task") {
        prependLine("- [ ] ");
      } else if (action === "hr") {
        insertAtCursor("\n\n---\n\n");
      } else if (action === "codeblock") {
        insertCodeBlock();
      }
    },
    [
      activeNote,
      createHeader,
      handleSelectionInsert,
      prependLine,
      insertAtCursor,
      insertCodeBlock,
    ],
  );

  const insertTemplate = useCallback(
    (template: string) => {
      const normalizedTemplate = normalizeText(template).trim();
      if (!normalizedTemplate) return;

      insertAtCursor(`\n${normalizedTemplate}\n`);
    },
    [insertAtCursor],
  );

  const createLink = useCallback(() => {
    const url = window.prompt("Paste link URL", "https://");
    if (!url) return;
    handleSelectionInsert("[", `](${url})`);
  }, [handleSelectionInsert]);

  return {
    applyToolbarAction,
    createLink,
    insertAtCursor,
    insertTemplate,
    toolbarItems: NOTE_TOOLBAR,
  };
}

