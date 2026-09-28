import { useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OrderFormPreview {
  customer_name: string | null;
  customer_email: string | null;
  completed_item_count: number;
}

interface BulkOrderUploadCardProps {
  fileName: string;
  fileSizeBytes: number | null;
  preview: OrderFormPreview | null;
  previewing: boolean;
  disabled: boolean;
  onFileSelected: (file: File) => void | Promise<void>;
  onRemoveFile: () => void;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BulkOrderUploadCard({
  fileName,
  fileSizeBytes,
  preview,
  previewing,
  disabled,
  onFileSelected,
  onRemoveFile,
}: BulkOrderUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectFile = (file?: File | null) => {
    if (!file || disabled) return;
    void onFileSelected(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      event.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) selectFile(event.dataTransfer.files.item(0));
  };

  return (
    <Card className="h-full min-w-0">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Upload Order Form</CardTitle>
              <div className="flex gap-1.5" aria-label="Supported formats">
                <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">CSV</span>
                <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">XLSX</span>
              </div>
            </div>
            <CardDescription className="mt-1">
              Add a completed Order Form to start a POS draft.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a CSV or XLSX Order Form"
          onChange={event => selectFile(event.currentTarget.files?.[0])}
        />

        <div
          role="region"
          aria-label="Order Form file drop area"
          aria-disabled={disabled}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            "rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors sm:px-6",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 bg-muted/15 hover:border-primary/50",
            disabled ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
        >
          <div className="mx-auto flex max-w-sm flex-col items-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
              {previewing
                ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                : <Upload className="h-5 w-5 text-primary" aria-hidden="true" />}
            </div>
            <p className="font-medium">
              {isDragging ? "Drop your Order Form here" : "Drag and drop your file here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">or choose a file from your device</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-10"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">CSV or XLSX · Maximum file size 4 MB</p>
          </div>
        </div>

        {fileName && (
          <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={fileName}>{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {previewing ? "Reading workbook details…" : fileSizeBytes === null ? "Ready to process" : formatFileSize(fileSizeBytes)}
              </p>
            </div>
            {previewing && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Reading file" />}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={`Remove ${fileName}`}
              disabled={disabled}
              onClick={onRemoveFile}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {preview && (
          <div className="rounded-lg border bg-muted/30 p-3.5 text-sm" aria-live="polite">
            <div className="font-medium">
              Order Form customer: {preview.customer_name || "Name not found"}
            </div>
            <div className="break-all text-muted-foreground">
              {preview.customer_email || "Email not found"}
            </div>
            {!preview.completed_item_count && (
              <div className="mt-2 text-amber-700">
                No quantities are filled in yet. Complete at least one Qty cell before creating a draft.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}