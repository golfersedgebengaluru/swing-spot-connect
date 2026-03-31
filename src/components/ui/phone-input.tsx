import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CountryCode {
  code: string;
  dial: string;
  name: string;
  flag: string;
}

const COUNTRY_CODES: CountryCode[] = [
  { code: "IN", dial: "+91", name: "India", flag: "🇮🇳" },
  { code: "US", dial: "+1", name: "United States", flag: "🇺🇸" },
  { code: "GB", dial: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AE", dial: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "SA", dial: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "SG", dial: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "AU", dial: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "CA", dial: "+1", name: "Canada", flag: "🇨🇦" },
  { code: "DE", dial: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "FR", dial: "+33", name: "France", flag: "🇫🇷" },
  { code: "JP", dial: "+81", name: "Japan", flag: "🇯🇵" },
  { code: "CN", dial: "+86", name: "China", flag: "🇨🇳" },
  { code: "KR", dial: "+82", name: "South Korea", flag: "🇰🇷" },
  { code: "BR", dial: "+55", name: "Brazil", flag: "🇧🇷" },
  { code: "MX", dial: "+52", name: "Mexico", flag: "🇲🇽" },
  { code: "ZA", dial: "+27", name: "South Africa", flag: "🇿🇦" },
  { code: "NG", dial: "+234", name: "Nigeria", flag: "🇳🇬" },
  { code: "KE", dial: "+254", name: "Kenya", flag: "🇰🇪" },
  { code: "EG", dial: "+20", name: "Egypt", flag: "🇪🇬" },
  { code: "PK", dial: "+92", name: "Pakistan", flag: "🇵🇰" },
  { code: "BD", dial: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "LK", dial: "+94", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "NP", dial: "+977", name: "Nepal", flag: "🇳🇵" },
  { code: "MY", dial: "+60", name: "Malaysia", flag: "🇲🇾" },
  { code: "TH", dial: "+66", name: "Thailand", flag: "🇹🇭" },
  { code: "PH", dial: "+63", name: "Philippines", flag: "🇵🇭" },
  { code: "ID", dial: "+62", name: "Indonesia", flag: "🇮🇩" },
  { code: "VN", dial: "+84", name: "Vietnam", flag: "🇻🇳" },
  { code: "NZ", dial: "+64", name: "New Zealand", flag: "🇳🇿" },
  { code: "IT", dial: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "ES", dial: "+34", name: "Spain", flag: "🇪🇸" },
  { code: "PT", dial: "+351", name: "Portugal", flag: "🇵🇹" },
  { code: "NL", dial: "+31", name: "Netherlands", flag: "🇳🇱" },
  { code: "BE", dial: "+32", name: "Belgium", flag: "🇧🇪" },
  { code: "CH", dial: "+41", name: "Switzerland", flag: "🇨🇭" },
  { code: "AT", dial: "+43", name: "Austria", flag: "🇦🇹" },
  { code: "SE", dial: "+46", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", dial: "+47", name: "Norway", flag: "🇳🇴" },
  { code: "DK", dial: "+45", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", dial: "+358", name: "Finland", flag: "🇫🇮" },
  { code: "IE", dial: "+353", name: "Ireland", flag: "🇮🇪" },
  { code: "PL", dial: "+48", name: "Poland", flag: "🇵🇱" },
  { code: "CZ", dial: "+420", name: "Czech Republic", flag: "🇨🇿" },
  { code: "HU", dial: "+36", name: "Hungary", flag: "🇭🇺" },
  { code: "RO", dial: "+40", name: "Romania", flag: "🇷🇴" },
  { code: "GR", dial: "+30", name: "Greece", flag: "🇬🇷" },
  { code: "TR", dial: "+90", name: "Turkey", flag: "🇹🇷" },
  { code: "RU", dial: "+7", name: "Russia", flag: "🇷🇺" },
  { code: "UA", dial: "+380", name: "Ukraine", flag: "🇺🇦" },
  { code: "IL", dial: "+972", name: "Israel", flag: "🇮🇱" },
  { code: "QA", dial: "+974", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", dial: "+965", name: "Kuwait", flag: "🇰🇼" },
  { code: "BH", dial: "+973", name: "Bahrain", flag: "🇧🇭" },
  { code: "OM", dial: "+968", name: "Oman", flag: "🇴🇲" },
  { code: "JO", dial: "+962", name: "Jordan", flag: "🇯🇴" },
  { code: "LB", dial: "+961", name: "Lebanon", flag: "🇱🇧" },
  { code: "AR", dial: "+54", name: "Argentina", flag: "🇦🇷" },
  { code: "CL", dial: "+56", name: "Chile", flag: "🇨🇱" },
  { code: "CO", dial: "+57", name: "Colombia", flag: "🇨🇴" },
  { code: "PE", dial: "+51", name: "Peru", flag: "🇵🇪" },
  { code: "HK", dial: "+852", name: "Hong Kong", flag: "🇭🇰" },
  { code: "TW", dial: "+886", name: "Taiwan", flag: "🇹🇼" },
  { code: "MM", dial: "+95", name: "Myanmar", flag: "🇲🇲" },
  { code: "KH", dial: "+855", name: "Cambodia", flag: "🇰🇭" },
  { code: "GH", dial: "+233", name: "Ghana", flag: "🇬🇭" },
  { code: "TZ", dial: "+255", name: "Tanzania", flag: "🇹🇿" },
  { code: "UG", dial: "+256", name: "Uganda", flag: "🇺🇬" },
  { code: "ET", dial: "+251", name: "Ethiopia", flag: "🇪🇹" },
  { code: "MA", dial: "+212", name: "Morocco", flag: "🇲🇦" },
  { code: "TN", dial: "+216", name: "Tunisia", flag: "🇹🇳" },
  { code: "MU", dial: "+230", name: "Mauritius", flag: "🇲🇺" },
];

interface PhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  defaultCountry?: string;
}

/**
 * Parses an existing phone value into country code and local number.
 */
function parsePhone(value: string, countries: CountryCode[]): { countryCode: string; localNumber: string } {
  if (!value) return { countryCode: "IN", localNumber: "" };

  // Try to match the longest dial code first
  const sorted = [...countries].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (value.startsWith(c.dial)) {
      return { countryCode: c.code, localNumber: value.slice(c.dial.length).trim() };
    }
  }
  return { countryCode: "IN", localNumber: value.replace(/^\+/, "").trim() };
}

export function PhoneInput({ value, onChange, placeholder, className, id, defaultCountry = "IN" }: PhoneInputProps) {
  const parsed = useMemo(() => parsePhone(value, COUNTRY_CODES), [value]);
  const [selectedCountry, setSelectedCountry] = useState(parsed.countryCode || defaultCountry);
  const [localNumber, setLocalNumber] = useState(parsed.localNumber);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const country = COUNTRY_CODES.find((c) => c.code === selectedCountry) || COUNTRY_CODES[0];

  const handleCountrySelect = (code: string) => {
    setSelectedCountry(code);
    setPopoverOpen(false);
    const c = COUNTRY_CODES.find((cc) => cc.code === code);
    if (c) {
      onChange(`${c.dial} ${localNumber}`.trim());
    }
  };

  const handleNumberChange = (num: string) => {
    // Only allow digits and spaces
    const cleaned = num.replace(/[^\d\s]/g, "");
    setLocalNumber(cleaned);
    onChange(`${country.dial} ${cleaned}`.trim());
  };

  return (
    <div className={cn("flex gap-1.5", className)}>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            type="button"
            className="w-[110px] shrink-0 justify-between px-2.5 font-normal"
          >
            <span className="flex items-center gap-1.5 text-sm">
              <span>{country.flag}</span>
              <span className="text-muted-foreground">{country.dial}</span>
            </span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRY_CODES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} ${c.dial} ${c.code}`}
                    onSelect={() => handleCountrySelect(c.code)}
                    className="flex items-center gap-2"
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.dial}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        type="tel"
        value={localNumber}
        onChange={(e) => handleNumberChange(e.target.value)}
        placeholder={placeholder || "98765 43210"}
        className="flex-1"
      />
    </div>
  );
}
