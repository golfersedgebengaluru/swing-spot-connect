import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Run = {
  id: string;
  run_at: string;
  rows_anonymised: number;
  rows_purged_consent: number;
  rows_purged_guests: number;
  duration_ms: number | null;
  status: string;
  error: string | null;
};

export function AdminRetentionTab() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("retention_runs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(20);
    setRuns((data as Run[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("retention-purge");
      if (error) throw error;
      toast({ title: "Retention purge triggered" });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> Retention Purge
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Automated DPDP retention job. Anonymises old bookings (&gt;8 yrs), purges consent logs for closed accounts (&gt;7 yrs), and removes inactive guest profiles (&gt;2 yrs).
          </p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Run now
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Anonymised</TableHead>
                  <TableHead className="text-right">Consent purged</TableHead>
                  <TableHead className="text-right">Guests purged</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.run_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "default" : "destructive"}>{r.status}</Badge>
                      {r.error && <div className="text-xs text-destructive mt-1">{r.error}</div>}
                    </TableCell>
                    <TableCell className="text-right">{r.rows_anonymised}</TableCell>
                    <TableCell className="text-right">{r.rows_purged_consent}</TableCell>
                    <TableCell className="text-right">{r.rows_purged_guests}</TableCell>
                    <TableCell className="text-right text-xs">{r.duration_ms ?? 0} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
