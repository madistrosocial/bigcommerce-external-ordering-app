import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";

interface Props {
  open: boolean;
  type: "staff" | "customer";
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
  isPending?: boolean;
  error?: string | null;
}

export default function OrderNoteEditorDialog({
  open, type, initialText, onSave, onClose, isPending, error,
}: Props) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            Edit {type === "staff" ? "Staff" : "Customer"} Notes
          </DialogTitle>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          className="text-sm resize-none"
          placeholder={type === "staff" ? "Internal staff notes…" : "Customer-facing notes…"}
        />

        {error && <p className="text-xs text-red-600">{error}</p>}

        <p className="text-[11px] text-slate-400">
          {type === "staff"
            ? "Staff notes sync to BigCommerce order staff_notes and are logged in CRM timeline."
            : "Customer notes sync to BigCommerce order customer_message and are logged in CRM timeline."}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onSave(text)} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
