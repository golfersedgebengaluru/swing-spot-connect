import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSiteAdminPermissions, useUpdateSiteAdminPermission } from "@/hooks/useSiteAdminPermissions";

const permissionItems = [
  {
    key: "site_admin_expense_reports_visible",
    label: "Expense Reports",
    description: "Allow site admins to view the Expense Reports under Reports",
  },
  {
    key: "site_admin_pnl_visible",
    label: "Profit & Loss",
    description: "Allow site admins to view the P&L report under Reports",
  },
  {
    key: "site_admin_product_profitability_visible",
    label: "Product Profitability",
    description: "Allow site admins to view the Product Profitability report under Reports",
  },
  {
    key: "site_admin_cost_price_visible",
    label: "Product Cost Price",
    description: "Allow site admins to see and edit cost prices in the Products module",
  },
];

export function SiteAdminPermissionsCard() {
  const { data: permissions, isLoading } = useSiteAdminPermissions();
  const updatePermission = useUpdateSiteAdminPermission();
  const { toast } = useToast();

  const handleToggle = (key: string, checked: boolean) => {
    updatePermission.mutate(
      { key, enabled: checked },
      {
        onSuccess: () =>
          toast({ title: "Updated", description: "Permission updated." }),
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err.message,
            variant: "destructive",
          }),
      }
    );
  };

  if (isLoading)
    return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Site Admin Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Control what site admins can access. These toggles only affect site
          admin users — master admins always have full access.
        </p>
        {permissionItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
            <Switch
              checked={permissions?.[item.key] ?? false}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
