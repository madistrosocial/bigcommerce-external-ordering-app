/**
 * RichTextEditor — Tiptap-based WYSIWYG editor with a formatting toolbar.
 * Supports: Bold · Italic · Underline · Font Family · Font Size · Images · Alignment
 */
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { Underline as UnderlineExt } from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Underline, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert plain text to HTML if content doesn't appear to be HTML already. */
export function ensureHtml(content: string): string {
  if (!content) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(content)) return content;       // already HTML
  return content
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Strip HTML tags to produce a plain-text fallback for multipart emails. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: "Default (sans-serif)",  value: "" },
  { label: "Arial",                 value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia",               value: "Georgia, serif" },
  { label: "Times New Roman",       value: "'Times New Roman', Times, serif" },
  { label: "Courier New",           value: "'Courier New', Courier, monospace" },
  { label: "Verdana",               value: "Verdana, Geneva, sans-serif" },
  { label: "Helvetica",             value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: "Trebuchet MS",          value: "'Trebuchet MS', sans-serif" },
];

const FONT_SIZES = [
  "8px","9px","10px","11px","12px","13px","14px","16px",
  "18px","20px","24px","28px","32px","36px","48px",
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// ── Toolbar helpers ────────────────────────────────────────────────────────────

function ToolbarBtn({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={[
        "h-7 w-7 rounded flex items-center justify-center transition-colors text-sm font-medium",
        active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  value: string;        // HTML string
  onChange: (html: string) => void;
  minHeight?: number;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RichTextEditor({ value, onChange, minHeight = 300 }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const [imageError, setImageError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      FontSize,
      UnderlineExt,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-md",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
      }),
    ],
    content: ensureHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-4 py-3",
        style: `min-height: ${minHeight}px;`,
      },
    },
  });

  // Sync external value changes (e.g. on template reset)
  useEffect(() => {
    if (!editor) return;
    const incoming = ensureHtml(value);
    if (editor.getHTML() !== incoming) {
      // Tiptap 3 expects an options object here. Preventing an update while
      // syncing external content avoids an onChange/render loop for markup
      // inserted by campaign product blocks.
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  const attrs = editor.getAttributes("textStyle");
  const currentFamily = (attrs.fontFamily as string | undefined) || "";
  const currentSize   = (attrs.fontSize   as string | undefined) || "";
  const currentFamilyLabel = FONT_FAMILIES.find(f => f.value === currentFamily)?.label ?? "Font";
  const currentAlignment = (editor.getAttributes("paragraph").textAlign
    || editor.getAttributes("heading").textAlign
    || "left") as string;

  const openImagePicker = () => {
    imageSelectionRef.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    setImageError("");
    fileInputRef.current?.click();
  };

  const insertImage = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError("Use a PNG, JPEG, GIF, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Images must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(src)) {
        setImageError("That image could not be inserted.");
        return;
      }
      const selection = imageSelectionRef.current;
      const chain = editor.chain().focus();
      if (selection) chain.setTextSelection(selection);
      chain.setImage({ src, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 120) }).run();
      setImageError("");
    };
    reader.onerror = () => setImageError("That image could not be read.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">

        {/* Inline marks */}
        <ToolbarBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <ToolbarBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <ToolbarBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Divider />

        {/* Font Family */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 h-7 px-2 rounded text-xs text-slate-700 hover:bg-slate-100 transition-colors max-w-[160px]"
            >
              <span className="truncate">{currentFamilyLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {FONT_FAMILIES.map(f => (
              <DropdownMenuItem
                key={f.label}
                className={`text-sm cursor-pointer ${currentFamily === f.value ? "bg-blue-50 text-blue-700 font-medium" : ""}`}
                style={f.value ? { fontFamily: f.value } : undefined}
                onSelect={() => {
                  if (f.value) editor.chain().focus().setFontFamily(f.value).run();
                  else editor.chain().focus().unsetFontFamily().run();
                }}
              >
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Divider />

        {/* Font Size */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 h-7 px-2 rounded text-xs text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span>{currentSize || "Size"}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-24 max-h-64 overflow-y-auto">
            <DropdownMenuItem
              className={`text-sm cursor-pointer ${!currentSize ? "bg-blue-50 text-blue-700 font-medium" : ""}`}
              onSelect={() => editor.chain().focus().unsetFontSize().run()}
            >
              Default
            </DropdownMenuItem>
            {FONT_SIZES.map(size => (
              <DropdownMenuItem
                key={size}
                className={`text-sm cursor-pointer ${currentSize === size ? "bg-blue-50 text-blue-700 font-medium" : ""}`}
                onSelect={() => editor.chain().focus().setFontSize(size).run()}
              >
                {size}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Divider />

        {/* Headings */}
        <ToolbarBtn
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <span className="text-[11px] font-bold leading-none">H1</span>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <span className="text-[11px] font-bold leading-none">H2</span>
        </ToolbarBtn>

        <Divider />

        {/* Lists */}
        <ToolbarBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <span className="text-[13px] leading-none select-none">≡</span>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <span className="text-[11px] font-mono leading-none">1.</span>
        </ToolbarBtn>

        <Divider />

        {/* Image insertion */}
        <ToolbarBtn
          onClick={openImagePicker}
          title="Attach image (PNG, JPEG, GIF, or WebP; 2 MB max)"
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) insertImage(file);
          }}
        />

        <Divider />

        {/* Paragraph/image alignment */}
        <ToolbarBtn
          active={currentAlignment === "left"}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          active={currentAlignment === "center"}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          active={currentAlignment === "right"}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarBtn>

      </div>

      {/* ── Editor area ─────────────────────────────────────────────────────── */}
      <EditorContent editor={editor} />
      {imageError && <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{imageError}</p>}

    </div>
  );
}
