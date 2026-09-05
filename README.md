# Circuit Breaker

A stock market simulator that isn't a spreadsheet. One fiscal year, ten tickers,
three rival funds and a newswire that is right more often than it is honest.

Open `index.html` in any browser. No build, no dependencies, no server.

## The run

You start with **$10,000** and **240 trading sessions**. Each session is six ticks;
you can pause, or run at three speeds. The year ends at the closing bell on day 240,
or earlier if you blow up.

## What's actually being simulated

Prices are a factor model, not a random number generator wearing a costume:

- **Market beta** — a common shock every tick, scaled per name.
- **Macro factors** — rates, crude and risk appetite, each an AR(1) process that
  news pushes around and that decays back toward neutral. Every stock has a signed
  sensitivity to all three, so a rate hike bids `GRNT` and hits `VLTA`, and tight
  crude lifts `ORCA` while squeezing `ZPHR`.
- **Idiosyncratic vol** — per-name, from 0.9% daily (`TRTL`) to 5.5% (`DGCN`).
- **A drifting fundamental** — each name is pulled toward a fair value on a slow
  Ornstein-Uhlenbeck term, so dips mean something and nothing runs to infinity.
  Earnings surprises and sector news move the fundamental, not just the price.
- **Event impulses** that decay over a few ticks, plus a hype term for the two
  names that deserve one.

Across 25 simulated years the median name finishes at 1.02× and the index averages
+5.6%, with real bull and bear years (index range 689–1581 on a 1000 base).

## Mechanics

| | |
|---|---|
| **Orders** | Market only. You pay a bid/ask spread plus slippage that scales with your size against the name's liquidity. |
| **Brackets** | Per-position stop-loss and take-profit percentages, checked every tick including overnight gaps. |
| **Margin** | Buying power is net worth × leverage − gross exposure. Fall below 25% maintenance and the desk force-liquidates your largest position. |
| **Shorting** | Borrow costs 0.04%/day. Approval level 3 and up. |
| **Halts** | Any name that moves 20% in a session trips the circuit breaker and stops trading until the next open. You are stuck with it. |
| **Overnight** | Borrow fees, margin interest, earnings gaps and the day's news all settle between sessions. |

## Progression

Your broker raises your approval level as your book grows — cash account at the
start, then margin at $15k, short selling at $25k, an insider contact at $60k and
4× leverage at $150k.

The contact is the interesting one. Tips from the ninth floor are nearly always
correct and always add **SEC heat**. Heat decays about a point a session. Reach 100
and there is an enforcement action: half your book, gone. It happens twice and the
run is over.

Rumors on the wire are the honest version of the same trade — each carries a stated
confidence, and acting before confirmation pays roughly double. Some of them are
false.

## Files

- `index.html` — the whole game, standalone.
- `build.js` — extracts `dist/artifact.html` (the same content without the document
  skeleton) for publishing as a Claude Artifact.

## Keys

`1`–`0` select a ticker · `B` buy · `S` sell · `H` short · `C` cover · `Space` pause

## Seeds

Every run has a seed shown in the footer. The same seed produces the same market,
so you can hand one to somebody and find out who actually traded it better.
