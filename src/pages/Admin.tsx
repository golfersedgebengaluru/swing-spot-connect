import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, ShoppingBag, Gift, Users, Clock, UserCheck, FileText, MapPin, ClipboardList, Mail, Settings, CreditCard } from "lucide-react";
import { AdminEventsTab } from "@/components/admin/AdminEventsTab";
import { AdminProductsTab } from "@/components/admin/AdminProductsTab";
import { AdminRewardsTab } from "@/components/admin/AdminRewardsTab";
import { AdminMembersTab } from "@/components/admin/AdminMembersTab";
import { AdminAllUsersTab } from "@/components/admin/AdminAllUsersTab";
import { AdminPagesTab } from "@/components/admin/AdminPagesTab";
import { AdminBookingLogsTab } from "@/components/admin/AdminBookingLogsTab";
import { AdminSettingsTab } from "@/components/admin/AdminSettingsTab";
import { AdminOrdersTab } from "@/components/admin/AdminOrdersTab";
import { AdminEmailLogsTab } from "@/components/admin/AdminEmailLogsTab";
import { BayConfigTab } from "@/components/admin/BayConfigTab";

export default function Admin() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Manage events, products, rewards, and member hours</p>
          </div>

          <Tabs defaultValue="events" className="space-y-6">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="events" className="gap-2"><Calendar className="h-4 w-4" />Events</TabsTrigger>
              <TabsTrigger value="products" className="gap-2"><ShoppingBag className="h-4 w-4" />Products</TabsTrigger>
              <TabsTrigger value="orders" className="gap-2"><ShoppingBag className="h-4 w-4" />Orders</TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2"><Gift className="h-4 w-4" />Rewards</TabsTrigger>
              <TabsTrigger value="members" className="gap-2"><Users className="h-4 w-4" />Members</TabsTrigger>
              <TabsTrigger value="allusers" className="gap-2"><UserCheck className="h-4 w-4" />All Users</TabsTrigger>
              <TabsTrigger value="pages" className="gap-2"><FileText className="h-4 w-4" />Pages</TabsTrigger>
              <TabsTrigger value="bayconfig" className="gap-2"><MapPin className="h-4 w-4" />Bay Config</TabsTrigger>
              <TabsTrigger value="bookinglogs" className="gap-2"><ClipboardList className="h-4 w-4" />Booking Logs</TabsTrigger>
              <TabsTrigger value="emails" className="gap-2"><Mail className="h-4 w-4" />Emails</TabsTrigger>
              <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" />Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="space-y-4"><AdminEventsTab /></TabsContent>
            <TabsContent value="products" className="space-y-4"><AdminProductsTab /></TabsContent>
            <TabsContent value="orders" className="space-y-4"><AdminOrdersTab /></TabsContent>
            <TabsContent value="rewards" className="space-y-4"><AdminRewardsTab /></TabsContent>
            <TabsContent value="members" className="space-y-4"><AdminMembersTab /></TabsContent>
            <TabsContent value="allusers" className="space-y-4"><AdminAllUsersTab /></TabsContent>
            <TabsContent value="pages" className="space-y-4"><AdminPagesTab /></TabsContent>
            <TabsContent value="bayconfig" className="space-y-4"><BayConfigTab /></TabsContent>
            <TabsContent value="bookinglogs" className="space-y-4"><AdminBookingLogsTab /></TabsContent>
            <TabsContent value="emails" className="space-y-4"><AdminEmailLogsTab /></TabsContent>
            <TabsContent value="settings" className="space-y-6"><AdminSettingsTab /></TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
