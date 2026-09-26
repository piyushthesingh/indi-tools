# Spend

A mobile-first, offline, no-login expense tracker at `indi.tools/spend/`.
It answers two questions the moment it opens: how much have I spent this
month, and for each credit card, how much is unbilled and when does the
statement close. All data stays on the device.

Vanilla HTML, CSS and ES modules. No framework, no build step, no runtime
dependencies, no CDN or remote fonts.

## Files

```
spend/
  index.html, manifest.webmanifest, sw.js, icons/
  css/app.css            all styles; dark tokens by default, light via data-theme
  js/app.js              boot, router (#/home, #/activity?…, #/insights?…,
                         #/accounts, #/account/<id>, #/settings), deep links,
                         service worker + update prompt
  js/db.js               IndexedDB wrapper and schema upgrades
  js/state.js            in-memory copy of the data; every write goes through here
  js/ui/                 screens and sheets
  js/lib/                pure logic, no DOM (unit tested)
    money.js dates.js cycles.js totals.js filters.js suggest.js transactions.js
    accounts.js categories.js insights.js budgets.js recurring.js cashback.js
    banners.js backup.js deeplink.js defaults.js
  tests/                 node --test files for js/lib (and the SW file list)
  tools/serve.mjs        local dev server (not needed in production)
```

## Running and testing

```bash
node --test spend/tests/
```

Node 18+ with no packages. `spend/package.json` only sets `"type": "module"`
for the tests.

Local server, from the repo root, so the app is at the same path as
production:

```bash
node spend/tools/serve.mjs
```

Then open http://localhost:8787/spend/. The dev server sends `Cache-Control:
no-store`, and on localhost the service worker goes to the network first, so
you never see a stale file. Open `/spend/?sw=prod` once to switch that
browser to the real cache-first worker (to test offline and the "Update
available" prompt); `/spend/?sw=dev` switches back.

## Deploying

1. Bump `VERSION` in `sw.js`. A new version is what makes installed copies
   show "Update available".
2. If you added or removed a file under `css/`, `js/` or `icons/`, update
   `SHELL` in `sw.js`. `tests/sw.test.js` fails until the list matches
   the files on disk.
3. Run the tests, then upload `spend/` with the rest of the site. `tests/`,
   `tools/` and `package.json` are never requested by the app; uploading them
   is harmless.

The root site has no service worker, so Spend's (scoped to `/spend/`) has
nothing to conflict with. Spend is deliberately not linked from the
indi.tools homepage or navigation.

## Data model

IndexedDB database `indi-spend`. The database version is the schema
version (`SCHEMA_VERSION` in `lib/defaults.js`, currently 1). `db.js` has
one upgrade step per version; `migrateData()` in `defaults.js` mirrors them
for backups from older versions.

| Store | Key | Notes |
|---|---|---|
| accounts | id | `kind` is credit_card, upi, bank, wallet, cash or investment. Cards add statementDay, dueDay, limit, openingOutstanding, cashback. Investments add history (`[{ id, date, amount }]`, money invested before tracking). Others add trackBalance, openingBalance. |
| categories | id | name, icon (emoji), color, type (expense/income), order, archived. Defaults have stable ids (`cat-food`…). |
| transactions | id | type, amount, date, accountId, toAccountId, categoryId, payee, note, recurringId, createdAt, updatedAt. Indexed on date, accountId, toAccountId, categoryId, type. |
| recurring | id | template, frequency, dayOfMonth / weekday, startDate, endDate, lastGeneratedDate, mode (confirm/auto), paused, pending (dates waiting in "To log"). |
| budgets | id | month is "YYYY-MM" or "default"; totalLimit; categoryLimits. |
| settings | key | onboarded, theme, lastBackupAt, persistRequested, persistGranted. |

Rules that are never broken:

- **Money** is integer paise everywhere. Floats exist only while parsing what
  was typed (`parseAmount`, which also does `120+80`). Display uses
  `Intl.NumberFormat('en-IN')` with `.00` hidden on whole amounts.
- **Dates** are local `YYYY-MM-DD` strings, taken from the device clock, never
  from UTC. Calendar maths uses `Date.UTC` only as a day counter.
- **Spend** is expenses minus refunds. **Transfers** (card bills, moving money,
  cash withdrawals) are never spend. **Income** is counted on its own. Home,
  Activity, Insights, budgets and the CSV all use the same `spendOf()`.
- Groups (Credit cards, Digital cash, Cash, Investments) are derived from
  `kind`, never stored.
- **Investments** only move by transfer (bank → investment, or back out as a
  redemption), so investing is never spend. They never appear as a way to
  pay or receive. A SIP is a recurring transfer into an investment.
  Money invested before tracking lives in the account's `history`, not as
  transfers, so it does not come out of a bank balance a second time.
- Accounts and categories that are in use are archived, not deleted, so
  history keeps its names.

## Credit card cycle rules (`lib/cycles.js`)

For statement day S and due day D:

- `effectiveDay` clamps a day to the month: S = 31 closes on 28 or 29 Feb.
- A statement closes at the end of its statement date; spends on that day
  belong to it.
- Next statement = first statement date on or after today. Last statement =
  most recent statement date before today.
- Current cycle = the day after the last statement to the next statement,
  inclusive.
- Due date = the first date after the statement date whose day is
  effectiveDay(D): the same month if that is later than the statement date,
  otherwise the next month.
- `outstanding` = openingOutstanding + expenses + transfers out − refunds −
  transfers in (payments) − income credited to the card (cashback).
  Transactions dated after the current cycle are left out, so a future-dated
  entry cannot inflate the billed amount.
- `unbilled` = expenses − refunds in the current cycle.
- `billedDue` = max(0, outstanding − unbilled). This handles carry-over and
  partial payments with no extra state. A negative outstanding is a credit
  balance.
- A refund of an already billed purchase lowers unbilled (which can go below
  zero) and leaves billed due alone, as a bank does: the credit appears on the
  next statement.

## Money now (Insights, `lib/networth.js`)

Always as of today: bank, UPI, wallet and cash balances (only accounts with
"Track balance" on) minus what is owed on cards = money now. Invested so far
(at cost: history + transfers in − transfers out, no returns) is shown apart,
and the total of both is the net worth figure.

## Recurring

On every open (and when an open app wakes up on a new day), each rule
generates the occurrences due since `lastGeneratedDate`, up to today. "Log it
for me" rules save them; "Ask me first" rules add them to the rule's
`pending` list, shown as "N to log" on Home. Every occurrence has the fixed id
`rec:<ruleId>:<date>`, and the transactions and advanced rules are written in
one IndexedDB transaction. So an occurrence is never generated twice. Paused
rules do not catch up when resumed.

## Backups

**Export backup** writes `spend-backup-YYYY-MM-DD.json`:

```json
{ "app": "indi-spend", "schemaVersion": 1, "exportedAt": "…",
  "data": { "accounts": [], "categories": [], "transactions": [],
            "recurring": [], "budgets": [], "settings": {} } }
```

Arrays are sorted by id, so exporting the same data twice gives the same
file. On phones it uses the share sheet (Files or iCloud Drive on iPhone);
elsewhere it downloads.

**Restore** checks `app` and `schemaVersion`, shows the counts, upgrades older
schemas and refuses newer ones. When there is data on the phone it first
saves `spend-before-restore-YYYY-MM-DD.json`. If that safety copy is
cancelled, nothing is changed. Then it replaces everything in one
transaction. It is also offered on the welcome screen, for moving to a new
phone.

**CSV** columns: date, type, amount (rupees, 2 decimals), account, to account,
category, payee, note. From Activity it respects the current filters and
search. Cells starting with `= + - @` are prefixed with `'` so spreadsheets
do not run them.

## Deep links

```
/spend/?amt=250&via=hdfc&cat=food&payee=Swiggy&note=dinner&type=expense
```

All parameters are optional. They pre-fill quick add; the user always taps
Save.

| Param | Meaning |
|---|---|
| `amt` | rupees; maths works (`120%2B80`) |
| `via` | an account's short code (Manage → edit to see or change it) |
| `cat` | category name, case-insensitive: exact name, then a name that starts with it (`food` → Food and dining), then a whole word in it |
| `type` | expense (default), income, refund, transfer |
| `to` | transfers only: short code of the account the money goes to |
| `payee`, `note` | any text |

Anything that does not match is reported in a toast rather than guessed.
Settings → Shortcut links shows your codes and a copyable example. The
manifest also defines "Add expense" and "Add transfer" shortcuts
(long-press the installed icon on Android).
