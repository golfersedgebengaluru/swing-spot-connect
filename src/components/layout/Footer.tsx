import { Link } from "react-router-dom";
import bannerLogo from "@/assets/golfers-edge-banner.jpg";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <img src={bannerLogo} alt="Golfer's Edge" className="h-7 w-auto" />
            <span className="font-display text-lg font-semibold text-foreground">
              EdgeCollective
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
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} EdgeCollective by TEETIME VENTURES. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
