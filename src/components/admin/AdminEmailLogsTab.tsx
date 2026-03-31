import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Mail, Send, RefreshCw } from "lucide-react";
import { useEmailLog, useSendTestEmail } from "@/hooks/useEmailPreferences";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "secondary",
  pending: "outline",
  failed: "destructive",
  rate_limited: "destructive",
  suppressed: "outline",
  deduplicated: "outline",
};

const TEMPLATE_OPTIONS = [
  { value: "all", label: "All Templates" },
  { value: "booking_confirmed", label: "Booking Confirmed" },
  { value: "booking_cancelled", label: "Booking Cancelled" },
  { value: "points_earned", label: "Points Earned" },
  { value: "points_redeemed", label: "Points Redeemed" },
  { value: "league_update", label: "League Update" },
];

export function AdminEmailLogsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const { data: logs, isLoading } = useEmailLog({ status: statusFilter, template: templateFilter });
  const sendTest = useSendTestEmail();

  // Get profiles for test sender
  const { data: profiles } = useQuery({
    queryKey: ["admin_profiles_for_email"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name, email").not("user_id", "is", null);
      return data ?? [];
    },
  });

  const [testForm, setTestForm] = useState({ user_id: "", template: "booking_confirmed" });

  const TEST_DATA: Record<string, { subject: string; data: Record<string, any> }> = {
    booking_confirmed: {
      subject: "Bay Booking Confirmed ✅",
      data: { city: "Chennai", date: "Monday, March 17, 2026", time: "10:00 AM – 11:00 AM", duration: "1h", hours_remaining: 5 },
    },
    booking_cancelled: {
      subject: "Booking Cancelled",
      data: { city: "Bengaluru", date: "Tuesday, March 18, 2026", hours_refunded: 1 },
    },
    points_earned: {
      subject: "🎉 Points Awarded!",
      data: { points: 100, description: "Welcome bonus", total_points: 250 },
    },
    points_redeemed: {
      subject: "🎁 Reward Redeemed",
      data: { points: 50, reward_name: "Free Beverage", total_points: 200 },
    },
    league_update: {
      subject: "🏆 Leaderboard Update",
      data: { message: "You've moved up to rank #5 on the leaderboard!" },
    },
  };

  const handleSendTest = async () => {
    if (!testForm.user_id || !testForm.template) return;
    const testConfig = TEST_DATA[testForm.template];
    try {
      await sendTest.mutateAsync({
        user_id: testForm.user_id,
        template: testForm.template,
        subject: `[TEST] ${testConfig.subject}`,
        data: testConfig.data,
      });
      toast({ title: "Test email sent!", description: "Check the recipient's inbox." });
      setTestModalOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    }
  };

  // Stats
  const total = logs?.length ?? 0;
  const sent = logs?.filter((l) => l.status === "sent").length ?? 0;
  const failed = logs?.filter((l) => l.status === "failed" || l.status === "rate_limited").length ?? 0;
  const suppressed = logs?.filter((l) => l.status === "suppressed").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "text-foreground" },
          { label: "Sent", value: sent, color: "text-primary" },
          { label: "Failed", value: failed, color: "text-destructive" },
          { label: "Suppressed", value: suppressed, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="rate_limited">Rate Limited</SelectItem>
            <SelectItem value="suppressed">Suppressed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={templateFilter} onValueChange={setTemplateFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEMPLATE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["email_log"] })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="ml-auto">
          <Button onClick={() => setTestModalOpen(true)}>
            <Send className="mr-2 h-4 w-4" />Send Test Email
          </Button>
        </div>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Email Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No email logs found.</TableCell></TableRow>
                )}
                {(logs ?? []).map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">{log.recipient_email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {log.template.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{log.subject}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[log.status] || "outline"}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(log.created_at), "PP p")}
                    </TableCell>
                    <TableCell className="text-sm text-destructive max-w-[150px] truncate">
                      {log.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Test Email Modal */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Send Test Email</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Recipient</Label>
              <Select value={testForm.user_id} onValueChange={(v) => setTestForm({ ...testForm, user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).map((p: any) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={testForm.template} onValueChange={(v) => setTestForm({ ...testForm, template: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.filter((t) => t.value !== "all").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setTestModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSendTest} disabled={!testForm.user_id || sendTest.isPending}>
                {sendTest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send Test
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
