import { useParams } from "react-router-dom";
import { Trophy, Target, Loader2, Download } from "lucide-react";
import {
  useQuickCompetition, useQCPlayers, useQCAttempts, useQCCategories, useQCRealtime,
  buildLeaderboards, buildLeaderboardsByCategory,
  type QCCategoryWinners, type QCRunnersUp,
} from "@/hooks/useQuickCompetitions";

async function downloadCard(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const svgEl = parser.parseFromString(text, "image/svg+xml").documentElement as unknown as SVGSVGElement;

    // Render off-screen so layout/measurement works
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.appendChild(svgEl);
    document.body.appendChild(container);

    const [{ jsPDF }, { svg2pdf }] = await Promise.all([
      import("jspdf"),
      import("svg2pdf.js"),
    ]);

    const width = parseFloat(svgEl.getAttribute("width") || "1100");
    const height = parseFloat(svgEl.getAttribute("height") || "1100");
    const pdf = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "pt",
      format: [width, height],
    });
    await svg2pdf(svgEl, pdf, { x: 0, y: 0, width, height });
    container.remove();

    const pdfName = filename.toLowerCase().endsWith(".pdf") ? filename : filename.replace(/\.[a-z0-9]+$/i, "") + ".pdf";
    pdf.save(pdfName);
  } catch {
    window.open(url, "_blank");
  }
}

function CertificateCard({ url, label, filename }: { url: string; label: string; filename: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <img src={url} alt={label} className="w-full rounded-xl shadow-2xl bg-white" />
      <button
        onClick={() => downloadCard(url, filename)}
        className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 transition-colors"
      >
        <Download className="h-4 w-4" /> Download {label}
      </button>
    </div>
  );
}

export default function QuickCompetitionPublic() {
  const { id } = useParams<{ id: string }>();
  const competitionId = id ?? null;
  const { data: comp, isLoading } = useQuickCompetition(competitionId);
  const { data: players = [] } = useQCPlayers(competitionId);
  const { data: attempts = [] } = useQCAttempts(competitionId);
  const { data: categories = [] } = useQCCategories(competitionId);
  useQCRealtime(competitionId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-stone-700">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!comp) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-stone-700">
        <p>Competition not found.</p>
      </div>
    );
  }

  const unitLabel = comp.unit === "yd" ? "yd" : "m";
  const isCompleted = comp.status === "completed";
  const useCats = comp.categories_enabled && categories.length > 0;
  const groups = useCats
    ? buildLeaderboardsByCategory(players, attempts, categories)
    : [{ id: null as string | null, name: "", ...buildLeaderboards(players, attempts) }];

  return (
    <div className="min-h-screen bg-white text-stone-900 p-6 sm:p-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl sm:text-6xl font-serif italic text-stone-900">{comp.name}</h1>
        <p className="mt-2 text-sm sm:text-base text-stone-500 uppercase tracking-[0.3em]">
          {isCompleted ? "Final Results" : "Live Leaderboard"}
        </p>
      </header>

      {comp.entry_type === "paid" && !isCompleted && (
        <div className="flex flex-col items-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Join the competition</p>
          <a
            href={`/qc/${comp.id}/join`}
            className="px-6 py-3 rounded-full bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 transition-colors shadow-md"
          >
            Pay ₹{Number(comp.entry_fee ?? 0).toFixed(0)} & Enter
          </a>
          <p className="mt-2 text-xs text-stone-500">Scan or visit /qc/{comp.id.slice(0, 8)}/join</p>
        </div>
      )}

      {comp.sponsor_enabled && comp.sponsor_logo_url && (
        <div className="flex flex-col items-center mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-3">Brought to you by</p>
          <img src={comp.sponsor_logo_url} alt="Sponsor" className="h-20 sm:h-24 object-contain" />
        </div>
      )}

      <div className="space-y-10 max-w-7xl mx-auto">
        {groups.map((g) => (
          <section key={g.id ?? "all"}>
            {useCats && (
              <h2 className="text-center text-xs uppercase tracking-[0.3em] text-stone-500 mb-4">
                {g.name}
              </h2>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Board
                icon={<Trophy className="h-7 w-7 text-amber-600" />}
                title="Longest Drive"
                accent="amber"
                rows={g.longest}
                unit={unitLabel}
                highlight={!useCats ? comp.longest_winner_player_id : null}
                completed={isCompleted}
              />
              <Board
                icon={<Target className="h-7 w-7 text-sky-600" />}
                title="Straightest Drive"
                accent="sky"
                rows={g.straightest}
                unit={unitLabel}
                highlight={!useCats ? comp.straightest_winner_player_id : null}
                completed={isCompleted}
              />
            </div>
          </section>
        ))}
      </div>

      {isCompleted && (() => {
        const certs: { url: string; label: string; filename: string }[] = [];
        if (useCats) {
          const winners = (comp.category_winners as QCCategoryWinners | null) ?? [];
          for (const w of winners) {
            if (w.longest?.card_url) certs.push({
              url: w.longest.card_url,
              label: `${w.name} — Longest Drive (1st)`,
              filename: `${comp.name}-${w.name}-longest-1st.svg`,
            });
            if (w.longest_runner_up?.card_url) certs.push({
              url: w.longest_runner_up.card_url,
              label: `${w.name} — Longest Drive (2nd)`,
              filename: `${comp.name}-${w.name}-longest-2nd.svg`,
            });
            if (w.straightest?.card_url) certs.push({
              url: w.straightest.card_url,
              label: `${w.name} — Straightest Drive (1st)`,
              filename: `${comp.name}-${w.name}-straightest-1st.svg`,
            });
            if (w.straightest_runner_up?.card_url) certs.push({
              url: w.straightest_runner_up.card_url,
              label: `${w.name} — Straightest Drive (2nd)`,
              filename: `${comp.name}-${w.name}-straightest-2nd.svg`,
            });
          }
        } else {
          if (comp.longest_card_url) certs.push({
            url: comp.longest_card_url,
            label: "Longest Drive (1st)",
            filename: `${comp.name}-longest-1st.svg`,
          });
          const runners = (comp.runners_up as QCRunnersUp | null) ?? null;
          if (runners?.longest?.card_url) certs.push({
            url: runners.longest.card_url,
            label: "Longest Drive (2nd)",
            filename: `${comp.name}-longest-2nd.svg`,
          });
          if (comp.straightest_card_url) certs.push({
            url: comp.straightest_card_url,
            label: "Straightest Drive (1st)",
            filename: `${comp.name}-straightest-1st.svg`,
          });
          if (runners?.straightest?.card_url) certs.push({
            url: runners.straightest.card_url,
            label: "Straightest Drive (2nd)",
            filename: `${comp.name}-straightest-2nd.svg`,
          });
        }
        if (certs.length === 0) return null;
        return (
          <div className="mt-12 max-w-6xl mx-auto">
            <h2 className="text-center text-xs uppercase tracking-[0.3em] text-stone-500 mb-6">Winner Certificates</h2>
            <div className="grid gap-8 sm:grid-cols-2">
              {certs.map((c) => (
                <CertificateCard key={c.url} url={c.url} label={c.label} filename={c.filename} />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Board({
  icon, title, accent, rows, unit, highlight, completed,
}: {
  icon: React.ReactNode;
  title: string;
  accent: "amber" | "sky";
  rows: { player_id: string; name: string; value: number }[];
  unit: string;
  highlight: string | null;
  completed: boolean;
}) {
  const accentText = accent === "amber" ? "text-amber-600" : "text-sky-600";
  const accentBg = accent === "amber" ? "bg-amber-50/60 border-amber-200" : "bg-sky-50/60 border-sky-200";
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h2 className={`text-2xl sm:text-3xl font-bold ${accentText}`}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-stone-400 text-center py-12">Awaiting first shot…</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const isLeader = i === 0;
            const isWinner = completed && highlight === r.player_id;
            return (
              <li
                key={r.player_id}
                className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-all ${
                  isWinner || isLeader ? accentBg : "bg-white border-stone-100"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${isLeader ? accentText : "text-stone-400"}`}>
                    {i + 1}
                  </span>
                  <span className="text-xl sm:text-2xl font-semibold text-stone-900">{r.name}</span>
                </div>
                <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${isLeader ? accentText : "text-stone-700"}`}>
                  {r.value.toFixed(1)} <span className="text-base text-stone-500 font-normal">{unit}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
