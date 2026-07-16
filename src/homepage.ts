// The apex-domain homepage for gwei.site — a single-screen hero presenting the
// gateway as a glowing arched doorway ("a door to the decentralized world").
//
// Pure inline HTML/CSS/SVG: no build step, no runtime deps, served straight from
// the Deno edge handler. Palette is a tinted-navy dark with a champagne-gold
// frame and a mint portal glow (the light from the world on the other side).
// Ambient motion is gated behind `prefers-reduced-motion: no-preference`.

/** Full HTML document for the gwei.site homepage. */
export function renderHomepage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>gwei.site — a door to the decentralized world</title>
<meta name="description" content="Every name on gwei.site is a key to the open web. No apps, no setup — just type a name and step through.">
<meta name="author" content="xav.gwei">
<meta name="theme-color" content="#070B14">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://gwei.site/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="gwei.site">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="https://gwei.site/">
<meta property="og:title" content="gwei.site — a door to the decentralized world">
<meta property="og:description" content="Every name on gwei.site is a key to the open web. No apps, no setup — just type a name and step through.">
<meta property="og:image" content="https://gwei.site/og.png">
<meta property="og:image:secure_url" content="https://gwei.site/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A glowing arched doorway to the decentralized web, with the wordmark gwei.site">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="gwei.site — a door to the decentralized world">
<meta name="twitter:description" content="Every name on gwei.site is a key to the open web. No apps, no setup — just type a name and step through.">
<meta name="twitter:image" content="https://gwei.site/og.png">
<meta name="twitter:image:alt" content="A glowing arched doorway to the decentralized web">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@400;500&display=swap" rel="stylesheet">

<!-- Structured data -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"WebSite","name":"gwei.site","alternateName":"gwei gateway","url":"https://gwei.site/","description":"Every name on gwei.site is a key to the open web. No apps, no setup — just type a name and step through.","image":"https://gwei.site/og.png"}
</script>
<style>
  :root {
    --bg: #070b14;
    --surface: #0e1626;
    --border: #1a2740;
    --text: #f2efe6;
    --muted: #9aa3b2;
    --gold: #e8dcc4;
    --mint: #7bc9a3;
    --serif: "Cormorant Garamond", "Iowan Old Style", Georgia, serif;
    --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background:
      radial-gradient(ellipse 78% 58% at 50% 44%, rgba(123, 201, 163, 0.08), transparent 60%),
      radial-gradient(ellipse 60% 40% at 50% 92%, rgba(123, 201, 163, 0.05), transparent 70%),
      var(--bg);
    color: var(--text);
    font-family: var(--sans);
    height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2.5rem 1.5rem 4.5rem;
    line-height: 1.5;
    overflow: hidden;
  }
  .hero { display: flex; flex-direction: column; align-items: center; gap: 1.1rem; max-width: 38rem; }
  .kicker {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.42em;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--mint);
    margin: 0 0 -0.4rem 0.42em;
    opacity: 0.92;
  }
  .door {
    width: clamp(190px, min(30vw, 34vh), 265px);
    height: auto;
    cursor: pointer;
    transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
    will-change: transform;
    filter: drop-shadow(0 18px 40px rgba(123, 201, 163, 0.18));
  }
  .door:hover { transform: translateY(-3px) scale(1.012); }
  .door .portal { transition: filter 0.6s ease; }
  .door:hover .portal { filter: brightness(1.18) saturate(1.08); }
  .door .frame { stroke: var(--gold); fill: none; stroke-width: 1.4; opacity: 0.92; }
  .door .stone { fill: var(--surface); stroke: var(--gold); stroke-width: 1.2; opacity: 0.9; }
  .door .threshold { stroke: var(--gold); stroke-width: 1.4; opacity: 0.8; }
  .door .floor { fill: url(#floorShade); }
  .headline {
    font-family: var(--serif);
    font-weight: 300;
    font-size: clamp(2.3rem, 8vw, 4.6rem);
    line-height: 1.02;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--text);
  }
  .sub {
    font-size: clamp(0.92rem, 1.5vw, 1.02rem);
    color: var(--muted);
    margin: 0;
    max-width: 28rem;
  }
  .sub b { color: var(--gold); font-weight: 500; }
  .hint {
    font-family: var(--mono);
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin: 0.4rem 0 0;
  }
  .hint .arrow { color: var(--mint); margin-right: 0.4rem; }
  .hint .apex { color: var(--gold); }
  .badge {
    position: fixed;
    top: 1.4rem;
    left: 1.6rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    opacity: 0.7;
  }
  .badge b { color: var(--gold); font-weight: 500; }
  .getname {
    position: fixed;
    top: 1.4rem;
    right: 1.6rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    text-decoration: none;
    opacity: 0.85;
    transition: color 0.3s ease, opacity 0.3s ease;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .getname:hover { color: var(--gold); opacity: 1; }
  .getname .arrow { color: var(--mint); }
  .footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.35rem 0.9rem;
    padding: 0.9rem 1.5rem;
    font-family: var(--mono);
    font-size: 0.74rem;
    letter-spacing: 0.03em;
    color: var(--muted);
    background: linear-gradient(to top, rgba(7, 11, 20, 0.92), rgba(7, 11, 20, 0));
    line-height: 1;
  }
  .footer a { color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; line-height: 1; transition: color 0.3s ease; }
  .footer a:hover { color: var(--gold); }
  .footer .gh-mark { width: 14px; height: 14px; fill: currentColor; flex: none; transform: translateY(-1px); }
  .footer .heart { color: var(--mint); }
  .footer .name { color: var(--gold); }
  .footer .sep { opacity: 0.4; }

  @media (prefers-reduced-motion: no-preference) {
    .door { animation: rise 1.1s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
    .kicker { animation: fade 1s ease both 0.1s; }
    .headline { animation: fade 1.1s ease both 0.35s; }
    .sub, .hint { animation: fade 1.1s ease both 0.6s; }
    @keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .portal-core {
      transform-origin: 200px 250px;
      animation: breathe 7s ease-in-out infinite;
    }
    .portal-soft { animation: drift 9s ease-in-out infinite; }
    .twinkle { animation: twinkle 4s ease-in-out infinite; }
    @keyframes breathe { 0%, 100% { opacity: 0.82; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
    @keyframes drift { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
    @keyframes twinkle { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.85; } }
  }
</style>
</head>
<body>
  <div class="badge"><b>gwei</b>.site</div>
  <a class="getname" href="https://gwei.domains/" target="_blank" rel="noopener noreferrer">buy a name <span class="arrow">&nearr;</span></a>

  <main class="hero">
    <p class="kicker">You are now entering</p>

    <svg class="door" viewBox="0 0 400 560" role="img"
         aria-label="A glowing arched doorway to the decentralized web" tabindex="0">
      <defs>
        <radialGradient id="portalGlow" cx="50%" cy="46%" r="62%">
          <stop offset="0%" stop-color="#7bc9a3" stop-opacity="0.55"></stop>
          <stop offset="60%" stop-color="#7bc9a3" stop-opacity="0.16"></stop>
          <stop offset="100%" stop-color="#7bc9a3" stop-opacity="0"></stop>
        </radialGradient>
        <radialGradient id="portalCore" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#f2efe6" stop-opacity="0.9"></stop>
          <stop offset="38%" stop-color="#7bc9a3" stop-opacity="0.5"></stop>
          <stop offset="100%" stop-color="#7bc9a3" stop-opacity="0"></stop>
        </radialGradient>
        <radialGradient id="portalSoft" cx="50%" cy="62%" r="56%">
          <stop offset="0%" stop-color="#7bc9a3" stop-opacity="0.32"></stop>
          <stop offset="100%" stop-color="#7bc9a3" stop-opacity="0"></stop>
        </radialGradient>
        <linearGradient id="floorShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.6"></stop>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"></stop>
        </linearGradient>
        <clipPath id="arch">
          <path d="M110,520 L110,210 A90,90 0 0 1 290,210 L290,520 Z"></path>
        </clipPath>
      </defs>

      <!-- portal interior: the world on the other side (clipped to the opening) -->
      <g class="portal" clip-path="url(#arch)">
        <rect x="92" y="96" width="216" height="440" fill="url(#portalGlow)"></rect>
        <ellipse class="portal-soft" cx="200" cy="300" rx="92" ry="74" fill="url(#portalSoft)"></ellipse>
        <ellipse class="portal-core" cx="200" cy="250" rx="72" ry="92" fill="url(#portalCore)"></ellipse>
        <!-- faint stars / motes in the other world -->
        <circle class="twinkle" cx="150" cy="180" r="1.4" fill="#f2efe6"></circle>
        <circle class="twinkle" cx="183" cy="150" r="1" fill="#f2efe6" style="animation-delay:.8s"></circle>
        <circle class="twinkle" cx="226" cy="166" r="1.6" fill="#f2efe6" style="animation-delay:1.6s"></circle>
        <circle class="twinkle" cx="164" cy="244" r="1.2" fill="#f2efe6" style="animation-delay:2.4s"></circle>
        <circle class="twinkle" cx="247" cy="232" r="1" fill="#f2efe6" style="animation-delay:3.1s"></circle>
        <circle class="twinkle" cx="200" cy="202" r="1.6" fill="#f2efe6" style="animation-delay:1.2s"></circle>
      </g>

      <!-- floor shadow spilling out beneath the threshold -->
      <rect class="floor" x="100" y="520" width="200" height="22" fill="url(#floorShade)"></rect>

      <!-- stone frame: outer + inner arches and jambs -->
      <path class="frame" d="M92,210 A108,108 0 0 1 308,210"></path>
      <path class="frame" d="M110,210 A90,90 0 0 1 290,210"></path>
      <path class="frame" d="M92,210 L92,536"></path>
      <path class="frame" d="M308,210 L308,536"></path>
      <path class="frame" d="M110,210 L110,520"></path>
      <path class="frame" d="M290,210 L290,520"></path>

      <!-- voussoirs (arch stones), radiating from the arch center -->
      <g class="frame" stroke-width="1">
        <line x1="114.4" y1="182.2" x2="97.3" y2="176.6"></line>
        <line x1="133.1" y1="149.8" x2="119.8" y2="137.7"></line>
        <line x1="163.4" y1="127.7" x2="156.1" y2="111.3"></line>
        <line x1="236.6" y1="127.7" x2="243.9" y2="111.3"></line>
        <line x1="266.9" y1="149.8" x2="280.2" y2="137.7"></line>
        <line x1="285.6" y1="182.2" x2="302.7" y2="176.6"></line>
      </g>

      <!-- keystone at the crown -->
      <path class="stone" d="M190,122 L210,122 L207,98 L193,98 Z"></path>

      <!-- threshold step -->
      <line class="threshold" x1="100" y1="520" x2="300" y2="520"></line>
      <line class="threshold" x1="84" y1="536" x2="316" y2="536" opacity="0.55"></line>
    </svg>

    <h1 class="headline">the decentralized world</h1>
    <p class="sub"><b>gwei.site</b> is a door to the decentralized web — IPFS, IPNS, Swarm. Step through.</p>
    <p class="hint"><span class="arrow">&rarr;</span>yourname<span class="apex">.gwei.site</span></p>
  </main>

  <footer class="footer">
    <a href="https://github.com/nipsysdev/gwei-site" target="_blank" rel="noopener noreferrer" aria-label="gwei.site on GitHub">
      <svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      GitHub
    </a>
    <span class="sep">&middot;</span>
    <span>built with <span class="heart">&hearts;</span> by <a class="name" href="https://xav.gwei.site" target="_blank" rel="noopener noreferrer">xav.gwei</a></span>
  </footer>
</body>
</html>`;
}
