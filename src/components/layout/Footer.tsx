import { Link } from "react-router-dom";
import { useBranding } from "@/hooks/useBranding";
import bannerLogo from "@/assets/golfers-edge-banner.jpg";

export function Footer() {
  const { data: branding } = useBranding();

  const footerText = (branding?.footer_text || "© {year} EdgeCollective by TEETIME VENTURES. All rights reserved.")
    .replace("{year}", String(new Date().getFullYear()));

  return (
    <footer className="border-t border-border bg-card py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <img src={branding?.logo_url || bannerLogo} alt={branding?.studio_name || "Golfer's Edge"} className="h-7 w-auto" />
            <span className="font-display text-lg font-semibold text-foreground">
              {branding?.studio_name || "EdgeCollective"}
            </span>
          </Link>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link to="/page/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/page/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link to="/page/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/page/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground text-center sm:text-right">
            {footerText}
          </p>
        </div>
      </div>
    </footer>
  );
}
