import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, isPast } from "date-fns";

type Ticket = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  category: string;
  subject: string;
  body: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  response: string | null;
  created_at: string;
  due_at: string;
  resolved_at: string | null;
};

export function AdminGrievancesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [active, setActive] = useState<Ticket | null>(null);
  const [resp, setResp] = useState("");
  const [newStatus, setNewStatus] = useState<Ticket["status"]>("in_progress");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["grievance_tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grievance_tickets" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Ticket[];
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const patch: any = { status: newStatus, response: resp || active.response };
      if (newStatus === "resolved" || newStatus === "closed") patch.resolved_at = new Date().toISOString();
      const { error } = await supabase.from("grievance_tickets" as any).update(patch).eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grievance_tickets"] });
      toast({ title: "Grievance updated" });
      setActive(null); setResp("");
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const open = (t: Ticket) => {
    setActive(t);
    setResp(t.response || "");
    setNewStatus(t.status);
  };

  const statusVariant = (s: Ticket["status"]) =>
    s === "resolved" || s === "closed" ? "secondary" : "default";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold">Grievances</h2>
        <p className="text-sm text-muted-foreground">DPDP Act, 2023 — 30-day response SLA.</p>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> :
        tickets.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No grievances yet.</CardContent></Card> :
        <div className="grid gap-3">
          {tickets.map((t) => {
            const overdue = t.status !== "resolved" && t.status !== "closed" && isPast(new Date(t.due_at));
            return (
              <Card key={t.id} className={overdue ? "border-destructive" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{t.subject}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.name || t.email} · {t.category} · {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                      {overdue && <Badge variant="destructive">Overdue</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap line-clamp-3 text-muted-foreground">{t.body}</p>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => open(t)}>Manage</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{active?.subject}</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3 bg-muted/30">
                <p><strong>From:</strong> {active.name || "—"} ({active.email}){active.phone ? ` · ${active.phone}` : ""}</p>
                <p><strong>Category:</strong> {active.category}</p>
                <p><strong>Filed:</strong> {new Date(active.created_at).toLocaleString()}</p>
                <p><strong>Due:</strong> {new Date(active.due_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-medium mb-1">Message</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{active.body}</p>
              </div>
              <div>
                <label className="font-medium block mb-1">Status</label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Ticket["status"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-medium block mb-1">Response (internal/visible to user)</label>
                <Textarea rows={5} value={resp} onChange={(e) => setResp(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button>
                <Button onClick={() => update.mutate()} disabled={update.isPending}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
