// Fetches the same public contribution calendar GitHub shows on the profile
// (so totals match "contributions in the last year") and renders a stats SVG.

const fs = require("fs");
const path = require("path");

const GH_TOKEN = process.env.GH_TOKEN;
const GH_USERNAME = process.env.GH_USERNAME || "saimdinky";

function todayInKarachi() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function parseCount(tip) {
  if (!tip || tip.startsWith("No ")) return 0;
  return parseInt(tip.replace(/,/g, ""), 10) || 0;
}

async function daysFromContributionsPage() {
  const url = `https://github.com/users/${GH_USERNAME}/contributions`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; saimdinky-live-stats/1.0; +https://github.com/saimdinky)",
      Accept: "text/html",
    },
  });
  if (!res.ok) {
    throw new Error(`contributions page HTTP ${res.status}`);
  }
  const html = await res.text();
  const dates = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  const tips = [...html.matchAll(/>(No contributions on [^<]+|\d[\d,]* contributions? on [^<]+)</g)].map(
    (m) => m[1]
  );
  if (dates.length < 300 || dates.length !== tips.length) {
    throw new Error(`could not parse contribution calendar (${dates.length} dates, ${tips.length} tips)`);
  }
  return dates
    .map((date, i) => ({ date, contributionCount: parseCount(tips[i]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function daysFromGraphQL() {
  if (!GH_TOKEN) {
    throw new Error("Missing GH_TOKEN for GraphQL fallback.");
  }
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${GH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: GH_USERNAME } }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  const collection = json.data.user.contributionsCollection;
  const days = collection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return { days, restricted: collection.restrictedContributionsCount || 0 };
}

async function loadDays() {
  try {
    const days = await daysFromContributionsPage();
    console.log(`Loaded ${days.length} days from GitHub contributions page.`);
    return days;
  } catch (err) {
    console.warn(`Contributions page failed (${err.message}); falling back to GraphQL.`);
    const { days, restricted } = await daysFromGraphQL();
    if (restricted && days.length) {
      days[days.length - 1].contributionCount += restricted;
    }
    return days;
  }
}

async function main() {
  const days = await loadDays();
  const totalContributions = days.reduce((sum, d) => sum + d.contributionCount, 0);

  let currentStreak = 0;
  let currentStreakStart = null;
  const todayStr = todayInKarachi();

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date > todayStr) continue;
    if (day.contributionCount > 0) {
      currentStreak++;
      currentStreakStart = day.date;
    } else {
      if (day.date === todayStr) continue;
      break;
    }
  }

  let longestStreak = 0;
  let longestStreakRange = ["", ""];
  let run = 0;
  let runStart = null;

  for (const day of days) {
    if (day.contributionCount > 0) {
      if (run === 0) runStart = day.date;
      run++;
      if (run > longestStreak) {
        longestStreak = run;
        longestStreakRange = [runStart, day.date];
      }
    } else {
      run = 0;
    }
  }

  const fmt = (d) =>
    d
      ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

  const firstDay = days.find((d) => d.contributionCount > 0)?.date || days[0]?.date;

  const svg = `<svg width="700" height="210" viewBox="0 0 700 210" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="crtGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="crtGlowSoft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="#00ff41" fill-opacity="0.05"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <style>
      @keyframes blink { 0%, 45% { opacity: 1; } 50%, 100% { opacity: 0; } }
      .cursor { animation: blink 1s step-end infinite; }
    </style>
  </defs>

  <rect width="700" height="210" rx="6" fill="#02120a"/>
  <rect x="1" y="1" width="698" height="208" rx="6" fill="none" stroke="#00ff41" stroke-width="1.5" filter="url(#crtGlowSoft)"/>
  <rect x="6" y="6" width="688" height="198" rx="4" fill="none" stroke="#00ff41" stroke-opacity="0.25" stroke-width="0.75"/>

  <circle cx="24" cy="20" r="4" fill="#00ff41" fill-opacity="0.7"/>
  <circle cx="40" cy="20" r="4" fill="#00ff41" fill-opacity="0.4"/>
  <circle cx="56" cy="20" r="4" fill="#00ff41" fill-opacity="0.2"/>
  <text x="680" y="24" text-anchor="end" font-family="'Courier New', monospace" font-size="10" fill="#00ff41" opacity="0.5">stats.sh — bash — 80x24</text>

  <text x="24" y="46" font-family="'Courier New', monospace" font-size="13" fill="#00ff41" filter="url(#crtGlow)">root@${GH_USERNAME}:~$ ./fetch_stats.sh --live</text>
  <line x1="24" y1="56" x2="676" y2="56" stroke="#00ff41" stroke-opacity="0.25" stroke-width="1"/>

  <text x="175" y="106" text-anchor="middle" font-family="'Courier New', monospace" font-size="36" font-weight="700" fill="#00ff41" filter="url(#crtGlow)">${totalContributions}</text>
  <text x="175" y="130" text-anchor="middle" font-family="'Courier New', monospace" font-size="12" fill="#00ff41" opacity="0.85">&gt; total_contributions</text>
  <text x="175" y="150" text-anchor="middle" font-family="'Courier New', monospace" font-size="10.5" fill="#00cc66" opacity="0.7"># ${fmt(firstDay)} - Present</text>

  <line x1="290" y1="66" x2="290" y2="180" stroke="#00ff41" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="2 3"/>
  <line x1="410" y1="66" x2="410" y2="180" stroke="#00ff41" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="2 3"/>

  <text x="350" y="106" text-anchor="middle" font-family="'Courier New', monospace" font-size="36" font-weight="700" fill="#00ff41" filter="url(#crtGlow)">${currentStreak}</text>
  <text x="350" y="130" text-anchor="middle" font-family="'Courier New', monospace" font-size="12" fill="#00ff41" opacity="0.85">&gt; current_streak</text>
  <text x="350" y="150" text-anchor="middle" font-family="'Courier New', monospace" font-size="10.5" fill="#00cc66" opacity="0.7"># ${fmt(currentStreakStart)} - ${fmt(todayStr)}</text>

  <text x="525" y="106" text-anchor="middle" font-family="'Courier New', monospace" font-size="36" font-weight="700" fill="#00ff41" filter="url(#crtGlow)">${longestStreak}</text>
  <text x="525" y="130" text-anchor="middle" font-family="'Courier New', monospace" font-size="12" fill="#00ff41" opacity="0.85">&gt; longest_streak</text>
  <text x="525" y="150" text-anchor="middle" font-family="'Courier New', monospace" font-size="10.5" fill="#00cc66" opacity="0.7"># ${fmt(longestStreakRange[0])} - ${fmt(longestStreakRange[1])}</text>

  <line x1="24" y1="168" x2="676" y2="168" stroke="#00ff41" stroke-opacity="0.25" stroke-width="1"/>
  <text x="24" y="192" font-family="'Courier New', monospace" font-size="12" fill="#00ff41" filter="url(#crtGlow)">root@${GH_USERNAME}:~$ <tspan class="cursor">█</tspan></text>

  <rect width="700" height="210" fill="url(#scanlines)"/>
  <rect width="700" height="210" rx="6" fill="url(#vignette)"/>
</svg>`;

  fs.mkdirSync(path.join(__dirname, "..", "dist"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "dist", "live-stats.svg"), svg);
  console.log(
    `live-stats.svg generated. total=${totalContributions} streak=${currentStreak} longest=${longestStreak}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
