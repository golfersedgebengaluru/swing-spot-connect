import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoyaltyRulesTab } from "./loyalty/LoyaltyRulesTab";
import { LoyaltyMultipliersTab } from "./loyalty/LoyaltyMultipliersTab";
import { LoyaltyMilestonesTab } from "./loyalty/LoyaltyMilestonesTab";
import { LoyaltyBonusesTab } from "./loyalty/LoyaltyBonusesTab";
import { LoyaltyCatalogueTab } from "./loyalty/LoyaltyCatalogueTab";
import { LoyaltyConfigTab } from "./loyalty/LoyaltyConfigTab";
import { LoyaltyTransactionsTab } from "./loyalty/LoyaltyTransactionsTab";
import { GiftsTab } from "./loyalty/GiftsTab";

export function AdminEdgeRewardsTab() {
  const [tab, setTab] = useState("rules");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="rules">Rules Engine</TabsTrigger>
          <TabsTrigger value="multipliers">Multipliers</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
          <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          <TabsTrigger value="gifts">Gifts</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="rules"><LoyaltyRulesTab /></TabsContent>
        <TabsContent value="multipliers"><LoyaltyMultipliersTab /></TabsContent>
        <TabsContent value="milestones"><LoyaltyMilestonesTab /></TabsContent>
        <TabsContent value="bonuses"><LoyaltyBonusesTab /></TabsContent>
        <TabsContent value="catalogue"><LoyaltyCatalogueTab /></TabsContent>
        <TabsContent value="gifts"><GiftsTab /></TabsContent>
        <TabsContent value="config"><LoyaltyConfigTab /></TabsContent>
        <TabsContent value="transactions"><LoyaltyTransactionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
