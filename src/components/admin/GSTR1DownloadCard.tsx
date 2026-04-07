import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { generateGSTR1Excel } from "@/lib/gstr1-export";

interface Props {
  city: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function GSTR1DownloadCard({ city }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth())); // prev month default
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const handleDownload = async () => {
    setLoading(true);
    try {
      await generateGSTR1Excel(city, Number(year), Number(month) + 1);
      toast.success("GSTR-1 Excel downloaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate GSTR-1");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          GSTR-1 Monthly Export
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Download GSTR-1 report with B2B, B2CS, Credit Notes, HSN Summary &amp; Document Summary sheets.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[90px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleDownload} disabled={loading} className="h-8 text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            Download GSTR-1
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
