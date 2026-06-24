# luach.com scraper

Scrapes apartment listings from **luach.com** and feeds new ones into the
existing `scraped_listings` pipeline (same table/UI as the *Luach HaTsibbur*
publication scraper), tagged `source = 'luach_com'`. New leads land with
`call_status = 'pending_call'` in the **Pipeline** tab of the Admin Panel,
where you call the owner and, with permission, publish to Hadirot.

## Run it

```bash
# Parse and print only — never touches the database. Start here.
npm run scrape:luach -- --dry-run --limit 6

# Live: scrape page 1 (newest listings) and upsert new ones
npm run scrape:luach

# Backfill: scan more index pages
npm run scrape:luach -- --pages 5

# Options: --limit N (cap how many to process), --verbose
```

## How it works

- Reads the `/apartments` index (newest-first), collects detail-page slugs.
- Dedups by `dedup_key = md5("luach_com:<slug>")` against the unique index on
  `scraped_listings.dedup_key`. Already-seen listings are skipped before
  re-fetching; if re-processed they only bump `date_last_seen` / `times_seen`
  and never overwrite your `call_status` / `call_notes`.
- Each run records a row in `scrape_runs` with parsed/inserted/updated counts.
- DB access is a direct Postgres connection via `SUPABASE_DB_URL` in `.env`
  (no service-role key needed). HTML parsing via `cheerio`.

## Field mapping (luach.com → scraped_listings)

| luach.com            | column                                   |
|----------------------|------------------------------------------|
| listing URL          | `source_url`                             |
| title                | `title`                                  |
| address line         | `cross_streets_raw` (used by geocoder)   |
| description          | `raw_text`                               |
| `$X / Month`         | `price` (+ `price_note` if weekly/daily) |
| bedrooms (from text) | `bedrooms`                               |
| bathrooms (from text)| `bathrooms`                              |
| basement/duplex/etc. | `property_type`                          |
| phone                | `contact_phone`, `contact_phone_display` |
| `Posted on M/D/Y`    | `pdf_date`                               |

Bedrooms/bathrooms/property type are parsed heuristically from the listing
text — they are starting points the admin confirms on the call.

## Running it daily (optional, later)

Currently run manually. To schedule on this Mac, add a `launchd` job that runs
`npm run scrape:luach` each morning — ask Claude to set this up when ready.
