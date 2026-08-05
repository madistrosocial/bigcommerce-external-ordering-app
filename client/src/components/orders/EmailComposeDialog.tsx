import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send } from "lucide-react";

interface Props {
  open: boolean;
  to: string;
  subject: string;
  body: string;
  onClose: () => void;
}

export default function EmailComposeDialog({ open, to, subject, body, onClose }: Props) {
  const [toField, setTo] = useState(to);
  const [subjectField, setSubject] = useState(subject);
  const [bodyField, setBody] = useState(body);

  // Sync when parent props change (new compose request)
  useEffect(() => {
    setTo(to);
    setSubject(subject);
    setBody(body);
  }, [to, subject, body]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/email/send-plain", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ to: toField, subject: subjectField, body: bodyField }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Send failed"); }
      return r.json();
    },
    onSuccess: () => onClose(),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Compose Email
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-1">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">To</label>
            <Input value={toField} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" className="text-sm" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Subject</label>
            <Input value={subjectField} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Message</label>
            <Textarea
              value={bodyField}
              onChange={e => setBody(e.target.value)}
              rows={14}
              className="text-sm font-mono resize-none"
            />
          </div>
          {sendMutation.isError && (
            <p className="text-sm text-red-600">{(sendMutation.error as Error).message}</p>
          )}
          {sendMutation.isSuccess && (
            <p className="text-sm text-green-600">Email sent successfully.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sendMutation.isPending}>Cancel</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !toField.trim() || !subjectField.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sendMutation.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
