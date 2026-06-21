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
understand its spending; no accounting or analytics knowledge is assumed, as a ledger is uploaded
and the dashboard is read.

## Prerequisite and scope

A maintained Excel ledger of grocery orders is required. This ledger is the single source of data
the application reads, and it is expected to be kept current outside the application, in whatever
tool the orders are recorded in. Until a ledger is uploaded, the application is empty.

Khata is a visualisation tool. Orders are read and presented; they are not created, edited, or
reconciled within it. The separate task of collecting receipts and order histories into one clean
ledger is handled better by dedicated tools and is therefore out of scope. The application is
concerned only with making an existing ledger understandable.

## Input: the Excel ledger

Data is read from an `.xlsx` workbook. A sheet named `Full Ledger` is used when one is present;
in a single-sheet workbook, any sheet name is accepted. The first row is treated as a header and
skipped, and data is read from the second row onward.

Columns are read by position rather than by header text, so headers may be renamed as long as the
order below is preserved.

| # | Column | Required | Used for |
|---|---|---|---|
| 1 | # | yes | Row marker; a blank value skips the row. |
| 2 | Date | yes | All time-based features. A real date cell, or text such as `18-Jun` (the year is assumed to be 2026). |
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
dot against weekly marks. The cadence of buying - regular, clustered, or sporadic - is read across
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

Sign-in with a Google account is required, and a member's data is stored in that member's own
Google Drive. Any Google account may sign in.

Data is shared within a household - a group of members who see one common ledger. A household is
created by naming it, after which an invite link is shown. The link is sent to the members who are
to share the ledger; each member opens it once and then selects the shared file to join. From that
point the same ledger is read and written by every member, and a change made by one is picked up
by the others. The invite link can be retrieved again at any time from the household panel.

A household is identified by its underlying file rather than its name, so two households of the
same name remain distinct. Membership is managed from the household panel: a member may leave,
which removes the household only from that member's device, while the creator's exit deletes the
household for everyone.

An account may also be deleted outright. Deleting an account removes the household and the
member's stored data and disconnects the application from the member's Google account; the other
members of a deleted household are disconnected and see no data.

## Availability

Nothing is installed in order to use Khata, though it may be added to a device's home screen. All
data resides in members' own Google Drive accounts.

# Part 2 - For developers

This part is for developers who clone the repository and host their own instance of Khata. The
product is described above; what follows is how it is built, configured, and deployed.

## Technology

Khata is a single-page Angular application. Its interface logic runs in the browser and its build
produces static files, so any static host can serve it; GitHub Pages is the configured target.

## Running and building locally

1. The dependencies can be installed by running `npm install`.
2. A development server can be started by running `npm start`, which serves the app at
   http://localhost:4200.
3. A production build can be produced by running `npm run build`, which writes its output to
   `dist/khata/browser`.

## Configuring Google sign-in

Sign-in, Drive storage, and the join picker depend on a Google OAuth client and an API key, both
of which can be set up in the Google Cloud Console.

1. A project can be created or selected.
2. The Google Drive API and the Google Picker API can be enabled under APIs & Services → Library.
3. The OAuth consent screen can be configured with the User type set to External, and the scope
   `https://www.googleapis.com/auth/drive.file` can be added. Because that scope is non-sensitive,
   the consent screen can then be published to production, after which any Google account may sign
   in, with no verification and no test-user list.
4. An OAuth client ID of type Web application can be created under APIs & Services → Credentials,
   with the local and deployment origins - for example `http://localhost:4200` and
   `https://<user>.github.io` - added as Authorized JavaScript origins.
5. An API key can be created in the same project under APIs & Services → Credentials, restricted to
   the Google Picker API and the same origins. The key is used only by the file picker, when an
   existing household is joined.
6. For local use, `google-config.example.js` can be copied to `public/google-config.js` and the
   values filled in; that file is gitignored, so the key is never committed. For the deployed site,
   the API key is stored as a repository Actions secret named `GOOGLE_API_KEY` (Settings → Secrets
   and variables → Actions), which the deploy workflow writes into `public/google-config.js` at
   build time. The key still reaches the browser - that is inherent to a client-side picker - so the
   referrer restriction from step 5 is what secures it.

## Deploying to GitHub Pages

Deployment is automatic: on every push to the `main` branch, the workflow at
`.github/workflows/deploy-pages.yml` builds the app and publishes it to GitHub Pages. The one-time
requirement can be met under Settings → Pages by setting the Source to GitHub Actions.

## Project structure

- `src/app/app.html` - the page markup.
- `src/app/prototype.ts` - the application logic: Excel parsing, aggregation, the sparkline and
  price-trend charts, spike detection, restock, rhythm, inventory, search, day detail, and the
  Google Drive household sync.
- `src/styles.css` - the full stylesheet.
- `src/index.html` - loads the fonts, the SheetJS reader, Google sign-in, and the file picker.
- `public/google-config.js` - the Google OAuth client ID and Picker API key (gitignored; on deploy
  it is generated from the `GOOGLE_API_KEY` secret). `google-config.example.js` is the committed template.
- `public/manifest.webmanifest` and `ngsw-config.json` - the web-app manifest and service-worker
  configuration.
- `.github/workflows/deploy-pages.yml` - the build-and-publish workflow for GitHub Pages.
