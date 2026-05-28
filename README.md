# crash-ticket-sync

Private CLI for syncing Firebase Crashlytics crashes into Azure Boards or Jira.

## Sources

- `bigquery`: queries Firebase Crashlytics BigQuery export tables.
- `import-json`: creates or updates a ticket from downloaded Crashlytics JSON and an optional stacktrace file.

Firebase does not expose a general public REST API for listing Crashlytics issues. The intended automation path is Crashlytics export to BigQuery, optionally with streaming export enabled for near-realtime data.

## Ticket Backends

- Azure Boards
- Jira Cloud

Tickets are deduped using a stable tag/label derived from the Crashlytics `issue_id`.

## Install

```bash
npm install
npm run build
```

## Configure

```bash
npm run dev -- init-config -o crash-ticket-sync.config.json
```

Authentication is read from environment variables:

- BigQuery: Google ADC, usually `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
- Azure Boards: `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_PAT`, or `AZURE_DEVOPS_EXT_PAT`
- Jira: `JIRA_EMAIL` and `JIRA_API_TOKEN`

## Run

Validate config:

```bash
npm run dev -- validate-config -c crash-ticket-sync.config.json
```

Sync from BigQuery:

```bash
npm run dev -- sync -c crash-ticket-sync.config.json --project app-ios --since-hours 24
```

Dry run:

```bash
npm run dev -- sync -c crash-ticket-sync.config.json --project app-ios --dry-run
```

Import downloaded Crashlytics files:

```bash
npm run dev -- import-json \
  -c crash-ticket-sync.config.json \
  --project app-ios \
  --metadata crash.json \
  --stacktrace stacktrace.txt \
  --dry-run
```

## Scheduling

Run from cron, GitHub Actions, or any CI runner with the required credentials:

```cron
15 7 * * * cd /path/to/crash-ticket-sync && npm run dev -- sync -c crash-ticket-sync.config.json --since-hours 24
```

## BigQuery Notes

The default query expects a Crashlytics export table with fields like:

- `issue_id`
- `issue_title`
- `issue_subtitle`
- `event_timestamp`
- `is_fatal`
- `display_version`
- `build_version`

If a project uses a different schema or a custom view, set `source.query` in the config. The query should return these aliases when possible:

- `issueId`
- `title`
- `subtitle`
- `platform`
- `bundleIdentifier`
- `displayVersion`
- `buildVersion`
- `eventCount`
- `latestEventAt`
- `fatal`
- `consoleUrl`
