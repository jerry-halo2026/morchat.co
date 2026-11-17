"use client";

/**
 * Standalone long-form document editor.
 *
 * `ContentEditor` owns the issue-draft pipeline: attachment uploads, @mentions,
 * slash commands, markdown source, workspace context. Reproducing a long form —
 * a content script, a job description, an operating review — needs none of
 * that: one controlled HTML string, a short toolbar, a character ceiling. This
 * component is that editor, and it deliberately shares nothing with the draft
 * flow, so a change here can never reach an issue composer.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactElement,
  type RefObject,
} from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { Extension, getText } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { Toggle } from "@morechat/ui/components/ui/toggle";
import { cn } from "@morechat/ui/lib/utils";
import {
  Bold,
  Check,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  type IconComponent,
} from "@morechat/ui/icons";
import { useT } from "../i18n";

// Types

export type DocToolbarItem =
  | "bold"
  | "italic"
  | "strike"
  | "h2"
  | "h3"
  | "bullet"
  | "ordered"
  | "quote"
  | "link"
  | "undo"
  | "redo";

export interface DocEditorProps {
  /** HTML or plain text, per `mode`. */
  value: string;
  onChange: (next: string) => void;
  mode?: "rich" | "plain";
  readOnly?: boolean;
  placeholder?: string;
  /** Content-area floor in px. */
  minHeight?: number;
  /** Plain-text character ceiling; input past it is refused. */
  maxLength?: number;
  /** Accessible name for the editing surface. */
  label: string;
  error?: string;
  toolbar?: readonly DocToolbarItem[];
}

type FormattingTool = Extract<
  DocToolbarItem,
  "bold" | "italic" | "strike" | "h2" | "h3" | "bullet" | "ordered" | "quote"
>;
type ActionTool = Extract<DocToolbarItem, "link" | "undo" | "redo">;

// Configuration

/** Typing quiet period before the host hears about an edit, in ms. */
const EMIT_DELAY_MS = 300;

const DEFAULT_MIN_HEIGHT = 220;

const DEFAULT_TOOLBAR: readonly DocToolbarItem[] = [
  "bold",
  "italic",
  "strike",
  "h2",
  "h3",
  "bullet",
  "ordered",
  "quote",
  "link",
  "undo",
  "redo",
];

/**
 * One entry per toolbar capability the installed extensions can actually
 * perform. `StarterKit` supplies bold/italic/strike/heading/blockquote/lists
 * and the undo history; `@tiptap/extension-link` supplies the link mark. Every
 * name here exists in `DocToolbarItem`, so the toolbar offers nothing the
 * schema would reject — that is the "drop the capability instead of adding a
 * dependency" rule, kept by construction.
 */
const FORMATTING: Record<
  FormattingTool,
  {
    icon: IconComponent;
    isActive: (editor: Editor) => boolean;
    run: (editor: Editor) => void;
  }
> = {
  bold: {
    icon: Bold,
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  italic: {
    icon: Italic,
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  strike: {
    icon: Strikethrough,
    isActive: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  h2: {
    icon: Heading2,
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  h3: {
    icon: Heading3,
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  bullet: {
    icon: List,
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  ordered: {
    icon: ListOrdered,
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  quote: {
    icon: Quote,
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
};

const ACTIONS: Record<ActionTool, { icon: IconComponent; run: (editor: Editor) => void }> = {
  link: { icon: Link2, run: () => {} },
  undo: { icon: Undo2, run: (editor) => editor.chain().focus().undo().run() },
  redo: { icon: Redo2, run: (editor) => editor.chain().focus().redo().run() },
};

/**
 * `.doc-editor` typography, injected once per document.
 *
 * There is no Tailwind `prose` utility in this repo (no `@tailwindcss/typography`)
 * and the write scope for this component is the two `.tsx` files, so the prose
 * block lives here rather than in a stylesheet. Every size comes from the
 * role-named `--text-*` scale; nothing leans on Tailwind's default size ramp.
 */
const DOC_EDITOR_CSS = `
.doc-editor {
  min-height: var(--doc-editor-min-height, ${DEFAULT_MIN_HEIGHT}px);
  padding: 0.5rem 0.625rem;
  color: var(--foreground);
  font-family: var(--font-content, var(--font-sans));
  font-size: var(--text-body);
  line-height: var(--text-body--line-height);
  outline: none;
  overflow-wrap: break-word;
}
.doc-editor p { margin: 0; }
.doc-editor > * + * { margin-top: 0.5rem; }
.doc-editor h2 {
  margin: 0.75rem 0 0.25rem;
  font-size: var(--text-title);
  line-height: var(--text-title--line-height);
  font-weight: 600;
}
.doc-editor h3 {
  margin: 0.5rem 0 0.25rem;
  font-size: var(--text-title-sm);
  line-height: var(--text-title-sm--line-height);
  font-weight: 600;
}
.doc-editor ul,
.doc-editor ol {
  margin: 0.25rem 0;
  padding-inline-start: 1.25rem;
}
.doc-editor ul { list-style: disc; }
.doc-editor ol { list-style: decimal; }
.doc-editor li { margin: 0.125rem 0; }
.doc-editor li > p { margin: 0; }
.doc-editor blockquote {
  margin: 0.5rem 0;
  padding-inline-start: 0.75rem;
  border-inline-start: 3px solid var(--border);
  color: var(--muted-foreground);
}
.doc-editor a {
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.doc-editor .is-empty::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--muted-foreground);
  pointer-events: none;
}
`;

const STYLE_ELEMENT_ID = "doc-editor-styles";

function useDocEditorStyles() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    style.textContent = DOC_EDITOR_CSS;
    document.head.appendChild(style);
  }, []);
}

// Helpers

/** Characters, counted exactly as `editor.getText().length` counts them. */
function plainTextLength(doc: PMNode): number {
  return getText(doc).length;
}

/**
 * Refuses a transaction that would push the plain-text count past the ceiling.
 *
 * The count uses the same serializer `editor.getText()` uses (top-level blocks
 * joined by a blank line), so the ceiling enforced while typing is the number
 * the host can reproduce afterwards. Shrinking always passes: a document that
 * arrives already over the ceiling has to stay editable downwards.
 */
function createTextLimit(options: {
  limitRef: RefObject<number | undefined>;
  onLimitRef: RefObject<(() => void) | undefined>;
}) {
  return Extension.create({
    name: "docTextLimit",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction: (transaction, state) => {
            const limit = options.limitRef.current;
            if (limit === undefined || !transaction.docChanged) return true;
            const after = plainTextLength(transaction.doc);
            if (after <= limit || after <= plainTextLength(state.doc)) return true;
            options.onLimitRef.current?.();
            return false;
          },
        }),
      ];
    },
  });
}

/**
 * Coalesces edits into one call.
 *
 * A controlled editor that reports every keystroke re-renders its host per
 * character; when the host feeds the value back in, the editor is rebuilt
 * mid-word and IME composition breaks. So a run of edits emits once after
 * {@link EMIT_DELAY_MS} of quiet, and blur emits immediately — a reader who
 * clicks save right after typing must not lose the last word to a pending
 * timer.
 */
function useDebouncedEmit() {
  const runRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    stop();
    const run = runRef.current;
    runRef.current = null;
    run?.();
  }, [stop]);

  const schedule = useCallback(
    (run: () => void) => {
      runRef.current = run;
      stop();
      timerRef.current = setTimeout(flush, EMIT_DELAY_MS);
    },
    [flush, stop],
  );

  // An edit still pending at unmount belongs to a host that is gone; drop it
  // rather than call into an unmounted tree.
  useEffect(() => stop, [stop]);

  return { schedule, flush };
}

/** Toolbar entries this editor can actually render. */
function resolveToolbar(
  toolbar: readonly DocToolbarItem[] | undefined,
): readonly DocToolbarItem[] {
  if (!toolbar) return DEFAULT_TOOLBAR;
  return toolbar.filter((item) => item in FORMATTING || item in ACTIONS);
}

/**
 * Normalise a reader-entered URL. Only script-bearing schemes are refused;
 * scheme-less input gets `https://`. (`bubble-menu.tsx` holds the fuller
 * version used by the issue composer — this editor never reaches the markdown
 * layer that version protects.)
 */
function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
  if (trimmed.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Toolbar

function DocToolbar({
  editor,
  items,
}: {
  editor: Editor;
  items: readonly DocToolbarItem[];
}) {
  const { t } = useT("blocks");
  // `null` = the URL row is closed. A string keeps the row open with its draft.
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

  // The editor is created with `shouldRerenderOnTransaction: false`, so the
  // pressed states are subscribed to here instead of re-rendering the whole
  // editor on every keystroke.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const label = (item: DocToolbarItem) => t(($) => $.doc_editor.tools[item]);

  const applyLink = () => {
    const href = normalizeHref(linkDraft ?? "");
    if (href) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkDraft(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="toolbar"
        aria-label={t(($) => $.doc_editor.toolbar)}
        className="flex flex-wrap items-center gap-0.5"
      >
        {items.map((item) => {
          if (item === "link") {
            return (
              <Toggle
                key={item}
                size="sm"
                aria-label={label(item)}
                pressed={linkDraft !== null || state.link}
                onPressedChange={(next) =>
                  setLinkDraft(next ? (editor.getAttributes("link").href ?? "") : null)
                }
                // The click must not steal the selection the link will wrap.
                onMouseDown={(event) => event.preventDefault()}
              >
                <Link2 className="size-3.5" />
              </Toggle>
            );
          }

          if (item === "undo" || item === "redo") {
            const Icon = ACTIONS[item].icon;
            return (
              <Button
                key={item}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={label(item)}
                disabled={item === "undo" ? !state.canUndo : !state.canRedo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => ACTIONS[item].run(editor)}
              >
                <Icon className="size-3.5" />
              </Button>
            );
          }

          const formatting = FORMATTING[item];
          const Icon = formatting.icon;
          return (
            <Toggle
              key={item}
              size="sm"
              aria-label={label(item)}
              pressed={state[item]}
              onPressedChange={() => formatting.run(editor)}
              onMouseDown={(event) => event.preventDefault()}
            >
              <Icon className="size-3.5" />
            </Toggle>
          );
        })}
      </div>
      {linkDraft !== null ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={linkDraft}
            aria-label={t(($) => $.doc_editor.link.url)}
            placeholder="https://..."
            className="h-7 flex-1 text-caption"
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setLinkDraft(null);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t(($) => $.doc_editor.link.apply)}
            onClick={applyLink}
          >
            <Check className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Shared chrome

function FieldMessages({
  id,
  error,
  limit,
}: {
  id: string;
  error?: string;
  limit?: string;
}) {
  return (
    <>
      {limit ? (
        // Announced politely: the ceiling refusing a keystroke is a status, not
        // an interruption of the text being written.
        <p aria-live="polite" className="text-caption text-muted-foreground">
          {limit}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

// Rich mode

function RichDocEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxLength,
  label,
  error,
  toolbar,
}: DocEditorProps) {
  const { t } = useT("blocks");
  const id = useId();
  useDocEditorStyles();

  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  const limitRef = useRef(maxLength);
  const labelRef = useRef(label);
  onChangeRef.current = onChange;
  placeholderRef.current = placeholder;
  limitRef.current = maxLength;
  labelRef.current = label;

  const [atLimit, setAtLimit] = useState(false);
  const onLimitRef = useRef<(() => void) | undefined>(() => setAtLimit(true));
  const { schedule, flush } = useDebouncedEmit();
  const items = useMemo(() => resolveToolbar(toolbar), [toolbar]);

  const editor = useEditor({
    immediatelyRender: false,
    // Re-renders on every keystroke are the toolbar's job, not the document's.
    shouldRerenderOnTransaction: false,
    editable: !readOnly,
    content: value,
    extensions: [
      // Only the marks and nodes the toolbar can author. Disabled entries are
      // the ones with no button: a code block, inline code, underline, and a
      // horizontal rule could otherwise arrive by paste and leave the document
      // in a format its own toolbar cannot reproduce or undo.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // The link mark is configured below, where its paste behaviour is
        // spelled out.
        link: false,
        codeBlock: false,
        code: false,
        underline: false,
        horizontalRule: false,
      }),
      /**
       * Paste sanitising needs no addon: every pasted fragment is parsed into
       * this schema through each extension's `parseHTML` rules, so inline
       * styles, class names, and `<script>` are unknown marks/nodes and are
       * dropped before a document is built. Paragraphs, headings, and list
       * structure are known nodes and survive with their shape. `linkOnPaste`
       * keeps a pasted URL as a link mark; `openOnClick: false` keeps a click
       * in the editing surface a caret move, not a navigation.
       */
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current ?? "",
      }),
      createTextLimit({ limitRef, onLimitRef }),
    ],
    editorProps: {
      attributes: {
        class: "doc-editor",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: current }) => {
      const limit = limitRef.current;
      if (limit !== undefined) setAtLimit(current.getText().length >= limit);
      schedule(() => {
        if (current.isDestroyed) return;
        // An empty document has no HTML worth storing; "" is what `value`
        // round-trips as.
        onChangeRef.current(current.isEmpty ? "" : current.getHTML());
      });
    },
    onBlur: () => {
      flush();
    },
  });

  // `useEditor` reads `editable` at mount; a host that flips `readOnly` later
  // needs the surface updated without a remount.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // The ARIA wiring follows the current error, not the mount-time one.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    dom.setAttribute("aria-label", labelRef.current);
    if (error) {
      dom.setAttribute("aria-invalid", "true");
      dom.setAttribute("aria-describedby", `${id}-error`);
    } else {
      dom.removeAttribute("aria-invalid");
      dom.removeAttribute("aria-describedby");
    }
  }, [editor, error, id]);

  // Adopt a value the reader did not type — a loaded record, a reset. The
  // common case, the host echoing our own HTML back, compares equal and exits
  // before the document is touched.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const limitMessage =
    maxLength !== undefined && atLimit
      ? t(($) => $.doc_editor.limit, { count: maxLength })
      : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {readOnly || !editor ? null : <DocToolbar editor={editor} items={items} />}
      <div
        style={{ "--doc-editor-min-height": `${minHeight}px` } as CSSProperties}
        className={cn(
          "rounded-input border border-input bg-transparent transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          error ? "border-destructive ring-3 ring-destructive/20" : null,
        )}
      >
        <EditorContent editor={editor} />
      </div>
      <FieldMessages id={id} error={error} limit={limitMessage} />
    </div>
  );
}

// Plain mode

function PlainDocEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxLength,
  label,
  error,
}: DocEditorProps) {
  const { t } = useT("blocks");
  const id = useId();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [draft, setDraft] = useState(value);
  // The value this surface last produced, so an echo of our own edit is not
  // mistaken for an external write.
  const emittedRef = useRef(value);
  const { schedule, flush } = useDebouncedEmit();

  useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    setDraft(value);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    // The ceiling counts characters, so a paste that would cross it is refused
    // whole rather than trimmed: what stays on screen is what the host gets.
    if (maxLength !== undefined && next.length > maxLength) return;
    emittedRef.current = next;
    setDraft(next);
    schedule(() => onChangeRef.current(next));
  };

  const atLimit = maxLength !== undefined && draft.length >= maxLength;
  const limitMessage = atLimit
    ? t(($) => $.doc_editor.limit, { count: maxLength })
    : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        id={id}
        value={draft}
        readOnly={readOnly}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("py-2", error ? "border-destructive" : null)}
        style={{ minHeight }}
        onChange={handleChange}
        onBlur={() => flush()}
      />
      <FieldMessages id={id} error={error} limit={limitMessage} />
    </div>
  );
}

/**
 * Editor for one long-form document.
 *
 * `mode` is fixed at mount: `"rich"` mounts Tiptap, `"plain"` mounts a
 * `<textarea>`. Switching modes remounts the component, which is the intended
 * behaviour — a document written as HTML is not a plain-text draft.
 */
export function DocEditor(props: DocEditorProps): ReactElement {
  return props.mode === "plain" ? (
    <PlainDocEditor {...props} />
  ) : (
    <RichDocEditor {...props} />
  );
}
