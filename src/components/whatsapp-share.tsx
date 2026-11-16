import { useEffect, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Btn, Input, Panel } from "@/components/ui-kit";
import { whatsappUrl } from "@/lib/whatsapp";

export function WhatsAppShare({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(text);
  const [phone, setPhone] = useState("");
  useEffect(() => setMsg(text), [text]);
  if (!open)
    return (
      <Btn variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <MessageCircle className="size-4" /> {title}
      </Btn>
    );
  return (
    <Panel className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label-caps text-muted-foreground">{title}</span>
        <button className="text-xs font-semibold text-primary" onClick={() => setOpen(false)}>Chiudi</button>
      </div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={9}
        className="w-full rounded-lg border border-border bg-surface-container p-3 text-sm"
      />
      <Input placeholder="Telefono (opzionale, es. +39 333…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Btn
          variant="outline"
          onClick={() => navigator.clipboard.writeText(msg).then(() => toast.success("Messaggio copiato"))}
        >
          <Copy className="size-4" /> Copia
        </Btn>
        <Btn variant="primary" onClick={() => window.open(whatsappUrl(msg, phone), "_blank", "noopener")}>
          <MessageCircle className="size-4" /> WhatsApp
        </Btn>
      </div>
    </Panel>
  );
}
