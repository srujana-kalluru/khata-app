# Khata

Khata is a web application that reads a grocery-purchase ledger and presents it as a spending
dashboard. A spreadsheet of grocery orders is uploaded, and the application turns it into spend
totals, category breakdowns, item price trends, restock estimates, a buying-rhythm timeline, and
a current-inventory view. The ledger holds the raw orders; the application makes them legible.

The application is hosted at https://srujanakalluru.github.io/khata-app/ and runs entirely in the
browser.

## Purpose

A running list of grocery orders does not, by itself, answer the questions that matter from one
month to the next: where the money goes, how the price of an item is moving, what is due to be
bought again, and what is currently in the kitchen. Khata exists to answer those questions from
data that has already been recorded, without any manual analysis. The application is intended for
an individual or a household that already keeps a record of its grocery orders and wants to
understand its spending.

## Prerequisite and scope

A maintained Excel ledger of grocery orders is required. This ledger is the single source of data
the application reads, and it is expected to be kept current outside the application, in whatever
tool the orders are recorded in. Until a ledger is uploaded, the application is empty.

Khata is a visualisation tool. Orders are read and presented; they are not created, edited, or
reconciled within it. The separate task of collecting receipts and order histories into one clean
ledger is handled better by dedicated tools and is therefore out of scope. The application is
concerned only with making an existing ledger understandable.

## Input: the Excel ledger

Data is read from an `.xlsx` workbook. Every tab whose header row contains a `Date` column and a
`Category` column is treated as ledger data and merged; tabs without those columns (summaries and
pivots) are ignored. The header row is found automatically and skipped.

Columns are matched by header name - the app looks for `Date`, `Platform`, `Brand`, `Item`,
`Variant`/`Size`, `Category`, `Subcategory`, `Item Type`, `Qty`, `Unit Price`/`MRP`, and
`Final Paid` - so column order may change as long as the headers stay recognisable. A row is
skipped when its `Date` or `Category` is blank.

| # | Column | Required | Used for |
|---|---|---|---|
| 1 | # | no | Row marker; ignored. |
| 2 | Date | yes | All time-based features. Best as a full date with the year - a real date cell or text such as `18-Jun-2026`. Bare `18-Jun` is accepted too, with the year taken from the tab name (for example `June 2026`) or, on the running tab, the current year. |
| 3 | Platform | no | The platform filter and the day-detail breakdown (for example Zepto or Blinkit). |
| 4 | Order ID | no | Ignored. |
| 5 | Brand | no | Searchable; shown in day detail. |
| 6 | Item | no | Product or receipt name; searchable. |
| 7 | Variant / Size | no | Drives the per-kilogram rate (for example `500 g`, `1 kg`, `52g x 6`). |
| 8 | Category | yes | Drill level 1; a blank value skips the row. |
| 9 | Subcategory | no | Drill level 2. |
| 10 | Item Type | no | Drill level 3; price trend, spike detection, and restock are computed per Item Type. |
| 11 | Qty | no | Packs bought (default 1). |
| 12 | Unit Price (MRP) | no | Reference only. |
| 13-14 | Line Total / Discount | no | Ignored. |
| 15 | Final Paid | yes | Drives every spend figure (a value of `0` records a free item). |
| 16 | Notes | no | Ignored. |

New entries are added to one running tab (named `Running` in the supplied workbook). When a month
is complete, its rows can be moved into a dated archive tab named for that month - for example
`June 2026` (or `2026-06`). The running tab and every archive tab are read together, so the
dashboard always shows the full history while each month keeps its own tab; the tab name supplies
the year for any bare `DD-Mon` dates it contains.

Pack sizes are recognised and normalised so that different sizes compare fairly: weights such as
`500 g` and `1 kg`, compound forms such as `52g x 6`, `250+250 g`, and `900g-1kg`, and volumes
such as `100 ml` and `1 L`. Pure counts such as `4 pcs` are treated per unit, and a purchase
recorded without a size is estimated from the item's average rate.

## The spending hierarchy

Every purchase is placed in a three-level hierarchy taken from the ledger: Category (required),
Subcategory, and Item Type. No fixed list of categories is imposed; the values in the ledger
define the hierarchy, and consistent naming is what keeps it meaningful. Price trends, spike
detection, and restock estimates are all computed per Item Type.

## Functionality

### Time periods

Spending is viewed over one of three periods: the current month, a single day, or a custom date
range. Arrows step to the previous or following month, so any past month is reviewed without
re-uploading.

### Dashboard and drill-down

The total spend for the selected period is shown above a daily-spend sparkline, marked by week;
the amount for a single day is revealed when its point is touched. Spending is drawn as horizontal
bars, and a bar is tapped to drill from Category to Subcategory to Item Type. A breadcrumb and a
row of sibling chips allow sideways movement through the hierarchy, while Home, Back, and Forward
move through the drill history. Home additionally resets the view to the current month with all
filters cleared.

### Item price trend and spikes

At the Item Type level, a per-kilogram (or per-unit) price line is drawn with one point for each
purchase. Any purchase priced 20% or more above the item's usual rate is flagged as a price spike,
both on the chart and by a marker on the item's bar, so an unusual price stands out.

### Restock

For any item bought at least three times, a buying rhythm is estimated from the interval between
purchases. Items are grouped into Overdue, Due soon, and Coming up, each shown with its usual pack
size and interval, so what needs buying is visible at a glance.

### Rhythm

A shared timeline is plotted with one lane per frequently bought item and each purchase shown as a
dot against weekly marks. The cadence of buying — regular, clustered, or sporadic — is read across
all items together.

### Inventory

Everything logged is treated as currently on hand. Items are grouped by category, and each is
shown with the date it was last added and the total quantity held, expressed in the item's own
unit: kilograms for weighed goods, litres for liquids, or packs for counted items. An item is
opened to see its price history.

### Search and day detail

Any item, brand, subcategory, category, or platform is found through search, and a result is
selected to jump straight to it. A purchase date is opened to list everything bought that day,
broken down by platform.

## Accounts and households

Sign-in with a Google account is required; authentication is handled by Supabase, which manages
the OAuth flow. Any Google account may sign in.

Data is shared within a household — a group of members who see one common ledger. A household is
created by naming it, after which a six-character code is shown. That code is shared with anyone
who should join the household; a member enters it once in the app to be added. From that point the
same ledger is read and written by every member, and a change made by one is picked up by the
others the next time they open or return to the app.

Membership is managed from the household panel. A member may leave, which removes the household
only from that member's view while it continues to exist for the others. The creator's exit deletes
the household for everyone.

An account may also be deleted outright. Deleting an account removes the member from the household
(or deletes the household entirely if the member is its creator), clears locally stored data, and
signs the member out.

## Availability

Nothing is installed in order to use Khata, though it may be added to a device's home screen as a
progressive web app. The ledger data uploaded by each member is stored in their browser locally and
synced to a shared household record in Supabase.

---

# Part 2 — For developers

This part is for developers who clone the repository and host their own instance of Khata. The
product is described above; what follows is how it is built, configured, and deployed.

## Technology

| Layer | Choice | Version |
|---|---|---|
| Frontend framework | Angular | 22 |
| Language | TypeScript | 6 |
| Excel parsing | SheetJS (`xlsx`) | 0.18 |
| Auth + database | Supabase (PostgreSQL + RLS) | JS SDK v2 |
| Service worker | Angular NGSW | — |
| Schema migrations | Liquibase | 4.31 |
| Tests | Vitest | 4 |
| Hosting | GitHub Pages | — |

The build produces static files only. There is no server-side rendering and no application server;
the Supabase project is the only external service.

## Running and building locally

Node 22 is required.

```bash
npm install          # install dependencies
npm start            # dev server at http://localhost:4200 (live-reload)
npm run watch        # build in watch mode (development configuration)
npm run build        # production build → dist/khata/browser/
npm test             # run Vitest unit tests
```

A `public/supabase-config.js` file with valid credentials must be present before the app will
work. If the file is missing or the values are empty, the app shows an error and does not proceed.
See the Supabase section below.

## Configuring Supabase

Sign-in and household sync require a Supabase project.

### 1. Create a project

Go to [supabase.com](https://supabase.com) and create a project. From **Project Settings → API**,
note:

- **Project URL** — the `https://<project>.supabase.co` value.
- **anon / public key** — the safe-to-expose API key used by the browser client.

### 2. Enable Google OAuth

Under **Authentication → Providers → Google**, toggle the provider on and supply a Google OAuth
client ID and secret. To create these in Google Cloud Console:

1. Create or select a project.
2. Under **APIs & Services → Credentials**, create an OAuth client of type *Web application*.
3. Add the Supabase callback URL as an authorized redirect URI:
   `https://<project>.supabase.co/auth/v1/callback`

The app requests no Google scopes beyond the default profile; Drive access is not used.

The Supabase client is initialised with PKCE flow (`flowType: "pkce"`) and session persistence
enabled. After the OAuth redirect, Supabase detects the session in the URL automatically.

### 3. Apply the database schema

Apply the migrations in `db/changelog/db.changelog-master.sql` to your Supabase database. The
easiest way locally is to paste the SQL into the Supabase SQL editor and run it. On deploy the
Liquibase Docker image handles this automatically (see Deploying to GitHub Pages).

### 4. Supply credentials to the app

**Local development** — fill in `public/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://<project>.supabase.co",
  anonKey: "<anon-key>"
};
```

This file is gitignored and is never committed. The app reads `window.SUPABASE_CONFIG` at startup;
if the object is empty or missing, auth is skipped.

**Deployed site** — store the values as repository Actions secrets. The deploy workflow generates
`public/supabase-config.js` from them at build time:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Database schema

The schema is managed with Liquibase. All migrations live in a single changelog file:
`db/changelog/db.changelog-master.sql`. They are applied automatically on every deploy before the
build step runs (see `.github/workflows/deploy-pages.yml`). To apply them manually, run the
Liquibase CLI against the Supabase PostgreSQL connection string, or paste the SQL directly into
the Supabase SQL editor.

### Tables

**`households`** — one row per household.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, `gen_random_uuid()`. |
| `code` | TEXT | Unique six-character alphanumeric join code. |
| `name` | TEXT | Display name chosen at creation. |
| `data` | JSONB | The full serialised ledger (see Data format below). |
| `created_by` | UUID | References `auth.users`; enforces creator-only delete via RLS. |
| `updated_at` | TIMESTAMPTZ | Updated on every ledger sync. |

**`household_members`** — join table linking users to households.

| Column | Type | Notes |
|---|---|---|
| `household_id` | UUID | References `households`. |
| `user_id` | UUID | References `auth.users`. |
| `joined_at` | TIMESTAMPTZ | |

### Row-Level Security

RLS is enabled on both tables. The policies enforce:

- A user may select, insert, and update only households in which they appear as a member.
- A user may delete a household only if `created_by` matches their own `auth.uid()`.
- A user may select and delete only their own rows in `household_members`.

### Stored procedures

Two security-definer functions handle the write operations that require elevated access:

- **`create_household(p_name text)`** — generates a unique six-character code, inserts a new
  household row, inserts the calling user into `household_members` as the creator, and returns
  `(id uuid, code text)`.
- **`join_household(p_code text)`** — looks up the household by code, inserts the calling user
  into `household_members` if not already present, and returns the `household_id`.

### Data format

The `data` JSONB column stores the entire ledger for the household. It is written on every file
upload or manual refresh and read when any member opens the app:

```json
{
  "entries": [
    {
      "date": "2026-06-01",
      "platform": "Zepto",
      "brand": "Amul",
      "item": "Butter",
      "size": "500 g",
      "category": "Dairy",
      "subcategory": "Butter & Ghee",
      "itemType": "Butter",
      "qty": 1,
      "mrp": 280,
      "paid": 262
    }
  ],
  "updatedAt": "2026-06-22T10:30:00.000Z"
}
```

All ledger processing (aggregation, chart data, restock estimates, etc.) happens in the browser
from this object; the database stores and distributes it, but performs no computation on it.

### Sync behaviour

The app writes to Supabase after every file upload. On subsequent visits or when the browser tab
regains focus (`visibilitychange`), the app fetches the household row and compares `updated_at`
to the locally cached timestamp; if the remote copy is newer, it is loaded. This gives eventual
consistency across household members without a real-time subscription.

## Deploying to GitHub Pages

Deployment is automatic on every push to `main`. The workflow at
`.github/workflows/deploy-pages.yml` runs three jobs in sequence:

1. **migrate** — runs Liquibase inside a Docker container against the Supabase database to apply
   any pending schema changes.
2. **build** — installs Node dependencies, generates `public/supabase-config.js` from secrets,
   runs `ng build --configuration production`, and uploads the `dist/khata/browser` directory as
   a Pages artifact.
3. **deploy** — publishes the artifact to GitHub Pages.

### One-time GitHub setup

1. Under **Settings → Pages**, set the Source to **GitHub Actions**.
2. Add four repository secrets under **Settings → Secrets and variables → Actions**:

   | Secret | Value |
   |---|---|
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_ANON_KEY` | Supabase anon/public key |
   | `SUPABASE_DB_URL` | Supabase JDBC connection string (used by Liquibase) |
   | `SUPABASE_DB_PASSWORD` | Database password |

The `SUPABASE_DB_URL` connection string for Liquibase follows the JDBC format:
`jdbc:postgresql://db.<project>.supabase.co:5432/postgres`. It can be found under
**Project Settings → Database → Connection string → JDBC**.

## Progressive web app

The Angular service worker (`@angular/service-worker`) is enabled in the production build. It
prefetches and caches the application shell (HTML, CSS, JS) on first load, so the UI opens
instantly on subsequent visits and remains available offline. The cache is updated automatically
when a new version is deployed.

The PWA manifest at `public/manifest.webmanifest` configures the app name, theme colour, and
icons so it can be installed to a device's home screen.

## Testing

Tests use Vitest with jsdom. Run them with `npm test`. The test suite covers pure functions in
`prototype.ts` such as size parsing, price normalisation, and restock interval estimation.

## Project structure

```
khata-app/
├── src/
│   ├── app/
│   │   ├── prototype.ts      # All application logic (Excel parsing, aggregation, charts,
│   │   │                     # restock, rhythm, search, Supabase sync)
│   │   ├── app.html          # Page markup and tab layout
│   │   ├── app.ts            # Root Angular component
│   │   └── app.config.ts     # Angular bootstrapping and service worker registration
│   ├── index.html            # Loads fonts, SheetJS, and Supabase JS SDK
│   ├── styles.css            # Full stylesheet (colour palette, layout, SVG charts)
│   └── main.ts               # Angular entry point
├── public/
│   ├── supabase-config.js    # Supabase URL and anon key — gitignored; generated on deploy
│   ├── manifest.webmanifest  # PWA manifest
│   └── vendor/
│       └── xlsx.full.min.js  # SheetJS pre-bundled (loaded by index.html)
├── db/
│   └── changelog/
│       └── db.changelog-master.sql  # Liquibase changelog: schema, RLS, stored procedures
├── .github/workflows/
│   └── deploy-pages.yml      # migrate → build → deploy pipeline
├── angular.json              # Angular CLI build configuration
├── ngsw-config.json          # Service worker asset groups and caching strategy
└── package.json
```
