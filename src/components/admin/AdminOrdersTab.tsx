import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingBag, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-300",
  preparing: "bg-blue-500/15 text-blue-600 border-blue-300",
  ready: "bg-green-500/15 text-green-600 border-green-300",
  delivered: "",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "🟡 Pending",
  preparing: "🔵 Preparing",
  ready: "🟢 Ready",
  delivered: "✅ Delivered",
};

export function AdminOrdersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, profiles:user_id(display_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_orders"] });
      toast({ title: "Order updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = (orders ?? []).filter((o: any) =>
    statusFilter === "all" || o.status === statusFilter
  );

  const pendingCount = (orders ?? []).filter((o: any) => o.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" /> Orders
          {pendingCount > 0 && (
            <Badge className="bg-amber-500/15 text-amber-600 border-amber-300">{pendingCount} new</Badge>
          )}
        </CardTitle>
        <div className="mt-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No orders found.</TableCell></TableRow>
              )}
              {filtered.map((o: any) => (
                <TableRow key={o.id} className={o.status === "pending" ? "bg-amber-500/5" : ""}>
                  <TableCell className="font-medium">
                    <div>{o.profiles?.display_name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{o.profiles?.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {(o.items as any[]).map((item, i) => (
                        <div key={i} className="text-sm">
                          {item.quantity}× {item.name}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">₹{Number(o.total_price).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.city || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(o.created_at), "PP p")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[o.status] ?? ""}
                    >
                      {STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Select
                      value={o.status}
                      onValueChange={(status) => updateStatus.mutate({ id: o.id, status })}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="preparing">Preparing</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
