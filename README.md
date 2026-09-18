<!-- markdownlint-disable MD033 MD041 -->
<h1 align="center">WuslaHQ</h1>

<p align="center"><strong>Turn agent traffic into revenue.</strong></p>

<p align="center">
Bring your MCP server or REST API. Keys, scopes, limits, metering and payouts
come with it, and every call is billable on one key — human or agent.
</p>

<p align="center">
  <a href="https://wuslahq.com"><strong>wuslahq.com »</strong></a>
  ·
  <a href="https://wuslahq.com/sell"><strong>Bring your MCP server »</strong></a>
</p>

---

> This is the public overview for WuslaHQ — what it offers and why it exists.
> The platform itself is closed-source; this repo exists so developers can
> understand the offering without needing an account.

## What WuslaHQ is

WuslaHQ is a billing layer and marketplace for **premium APIs and MCP servers**.
Sellers point us at their existing endpoint; we put a managed gateway in front of
it and handle keys, checkout, metering, and payouts. Buyers get one key, one
bill, and one place to discover APIs run by the people who built them.

**What it exists to do.** The commerce layer of the internet was built for a
human reading a page: pricing tiers, signup flows, checkout, dashboards. As more
API consumption becomes automated, that layer needs a machine-readable
counterpart — a way for an autonomous caller to be identified, scoped, capped
and charged. WuslaHQ is that meter, and it runs the same pipeline for agents as
it does for people.

It is built to be **fair, not cheapest**: a single, all-inclusive commission with
no hidden processor fees, transparent about what it does and does not cover, and
direct, founder-run onboarding.

> **On tax:** for card sales to buyers in the **US, EU and UK**, Whop adds
> sales tax / VAT at checkout and remits it, so sellers register and file
> nothing there. Outside those regions, and on USDC payments, tax remains the
> seller's responsibility, and income tax on payouts is always the seller's.

## Why it's different

| | WuslaHQ |
|---|---|
| **Commission** | Flat **21%, all-inclusive** — covers payment processing, Whop's tax service and the platform. Sellers keep **79%**. No monthly fee, no setup fee, no per-key charge. |
| **Founding offer** | The first **10 founding sellers** pay **0% for their first 6 months**, then 21%. |
| **Get paid anywhere** | Choose your payout: **USDC on-chain** (Helio / Solana) or **bank, PayPal, or crypto** through a connected Whop company. No Stripe country list, no bank-approval gate. Buyers still just pay by card. |
| **Bring your MCP server** | Already serve MCP? Point us at your endpoint. We mirror your tools to buyers as they are, and buyers' own upstream credentials pass straight through on headers you allowlist. No re-implementation. |
| **MCP-native for REST too** | Every REST listing is also a real **MCP server**. AI agents call your API through the **same key, scopes, rate limits, and metering** as human traffic — you write zero glue code, and you can finally bill for agent calls. |
| **Onboarding** | Point us at your endpoint. Listing takes minutes, with personal help from the founder, and a credential-free sandbox to rehearse against first. |

## How it works

### For sellers

1. **List** — give us your MCP endpoint URL, or your REST API's base URL and
   (optionally) an OpenAPI spec. For REST we generate the MCP tools from your
   spec.
2. **Price** — set a monthly price and/or per-call price. The floor is
   **$39/month**; **$99+** is the recommended premium band, not the minimum.
   Define scopes (which routes a key may hit) and default caps.
3. **Publish** — keys, limits and metering are live for your first buyer.
   Attach payout details from your dashboard when there is money to move.
4. **Get paid** — pick your payout rail. We take the commission; you keep the
   rest. Payouts settle on your terms, in any country.

### For buyers

1. **Discover** an API in the marketplace and try it in a credential-free sandbox.
2. **Subscribe** — pay by card. **Whop** handles card settlement, and for
   buyers in the US, EU and UK adds sales tax / VAT at checkout and remits it.
3. **Call** — one API key, subject to your subscription's scopes, rate limits,
   and spend cap. The same key works for your app *and* for AI agents over MCP.

## A brief word on the gateway

Every call — human or agent — flows through one managed gateway that enforces
the key's scopes, request caps and dollar spend limits before it reaches your
endpoint, and meters it for billing. Agent traffic runs through the exact same
path as human traffic, so it inherits every one of those controls
automatically — no separate integration, no separate security story.

## Milestones

- **2026-09** — Founding cohort open: the first ten sellers list at **0%
  commission for six months**.

More to come as the cohort fills and the catalogue grows.

## Status

Early, and onboarding founding sellers now. If you sell a premium API or run
an MCP server and want billing for it, the founder will personally help you
get listed → **[wuslahq.com/sell](https://wuslahq.com/sell)**.

---

<p align="center"><sub>Built and run by Abdullah Al Masud. Premium, not cheapest.</sub></p>
