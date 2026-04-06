import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, User, UserX, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type UserEntry = { name: string; amount: number; count: number };
type GuestEntry = { name: string; email: string; amount: number; count: number };

interface Props {
  byUser: Record<string, UserEntry>;
  byGuest: Record<string, GuestEntry>;
  isLoading: boolean;
}

export function RevenueUserBreakdown({ byUser, byGuest, isLoading }: Props) {
  const [tab, setTab] = useState<"registered" | "guest">("registered");

  const sortedUsers = Object.entries(byUser)
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => b.amount - a.amount);

  const sortedGuests = Object.entries(byGuest)
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => b.amount - a.amount);

  const registeredTotal = sortedUsers.reduce((s, u) => s + u.amount, 0);
  const guestTotal = sortedGuests.reduce((s, g) => s + g.amount, 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-4 w-4" /> User Spend Breakdown
        </CardTitle>
        <div className="flex gap-1 mt-2">
          <Button
            variant={tab === "registered" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("registered")}
          >
            <User className="mr-1 h-3.5 w-3.5" />
            Registered ({sortedUsers.length})
          </Button>
          <Button
            variant={tab === "guest" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("guest")}
          >
            <UserX className="mr-1 h-3.5 w-3.5" />
            Guests ({sortedGuests.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "registered" ? (
          sortedUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No registered user transactions for this period.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{sortedUsers.length} users</span>
                <span className="font-semibold">Total: ₹{registeredTotal.toLocaleString()}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.map((u, i) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {u.name || "Unknown User"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          ₹{u.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <Badge variant="secondary" className="text-xs">{u.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )
        ) : (
          sortedGuests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No guest transactions for this period.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{sortedGuests.length} guests</span>
                <span className="font-semibold">Total: ₹{guestTotal.toLocaleString()}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedGuests.map((g, i) => (
                      <TableRow key={g.key}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{g.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{g.email || "—"}</TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          ₹{g.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <Badge variant="secondary" className="text-xs">{g.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
