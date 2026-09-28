# ReachInbox Email Scheduler

ReachInbox is a local development project for composing email campaigns, scheduling deliveries, and tracking queue status. It uses a Next.js dashboard, an Express API, PostgreSQL with Prisma, BullMQ backed by Redis, Elasticsearch search, and a separate Node.js email worker.

## What It Does

- Create a campaign and queue one job per recipient for a selected start time.
- Use Redis-backed BullMQ delays, retry failed jobs up to three attempts, and apply a per-sender hourly rate limit.
- Persist campaign and delivery records in PostgreSQL.
- Index newly scheduled messages and worker status changes in Elasticsearch for dashboard search.
- Rebuild missing BullMQ jobs for database records marked `SCHEDULED` or `DELAYED_RATE_LIMIT` when the API starts.
- View recent delivery activity and administer the queue through the dashboard and Bull Board.

Delivery statuses are `SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, and `DELAYED_RATE_LIMIT`. Search results are limited to the most recent 100 indexed records.

## Requirements

- Node.js 20.9 or newer (recommended for the Next.js 16 frontend)
- npm
- Docker Desktop with Docker Compose
- SMTP account credentials for sending mail

## Run Locally

Open three terminals from the repository directory. Keep PostgreSQL, Redis, Elasticsearch, the API, the worker, and the frontend running while using the dashboard.

### 1. Start the data services

```powershell
docker compose up -d
```

The Compose file exposes PostgreSQL on `5432`, Redis on `6379`, and Elasticsearch on `9200`.

### 2. Configure the backend

Create `backend/.env` with values for your local services:

```dotenv
PORT=4000
DATABASE_URL="postgresql://reachinbox:reachinbox_password@localhost:5432/reachinbox_db?schema=public"
REDIS_URL="redis://localhost:6379"
ELASTICSEARCH_NODE="http://localhost:9200"
WORKER_CONCURRENCY=10
```

Install the backend dependencies, generate Prisma Client, and create/update the local database schema:

```powershell
Set-Location .\backend
npm install
npx prisma generate
npx prisma db push
```

### 3. Add a user and sender

The dashboard does not include account onboarding, and the API currently has no endpoint for creating senders. Add a `User` and an associated `EmailSender` record before scheduling a campaign. One way to do this locally is with Prisma Studio:

```powershell
npx prisma studio
```

Create a `User` with unique `email` and `googleId` values. Then create an `EmailSender` linked to that user's `id`, with a unique `senderEmail` and valid SMTP `smtpUser` and `smtpPass`. The sender defaults to `smtp.ethereal.email:587` and an hourly limit of 200; change these to values supported by your mail provider. Keep real credentials private and do not commit them.

The dashboard's sender selector reads from `GET /api/senders`. It remains unavailable while no senders exist.

### 4. Start the API and worker

In one backend terminal:

```powershell
npm run dev
```

In a second backend terminal:

```powershell
npm run worker
```

The API defaults to `http://localhost:4000`. The worker logs a ready message after connecting to Redis.

### 5. Start the dashboard

In a third terminal:

```powershell
Set-Location ..\frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend uses `http://localhost:4000/api` by default. To point it at another API origin, define `NEXT_PUBLIC_API_URL` in `frontend/.env.local`, for example:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

## Using the Dashboard

1. Choose a configured sender and enter the campaign name, subject, message, recipients, start time, and spacing between sends.
2. Paste recipient addresses separated by commas, semicolons, or new lines.
3. Submit the campaign. The API stores each delivery, adds a delayed BullMQ job, and indexes the initial status.
4. Use the delivery monitor to search recipient, sender, subject, message body, or status. Results refresh every five seconds; status tabs narrow the displayed results.
5. Open the queue console at [http://localhost:4000/admin/queues](http://localhost:4000/admin/queues) for Bull Board.

The composer displays merge-tag syntax such as `{{firstName}}` as a writing hint, but merge-tag substitution is not implemented: message text is currently sent as entered. Recipient addresses should be valid email addresses; the API requires at least one recipient but does not fully validate address syntax.

## API Reference

All API routes are served by the Express process on port `4000` by default.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/senders` | List configured senders (`id`, `senderEmail`, `hourlyLimit`). |
| `POST` | `/api/campaigns/schedule` | Create a campaign and queue its recipients. Supply `senderEmail` (or `senderId`), `subject`, `body`, `recipients`, `startAt`, and optionally `name` and `delayPerEmail`. |
| `GET` | `/api/emails/search` | Search indexed delivery records. Optional query parameters: `query` and `status`. |
| `GET` | `/admin/queues` | Bull Board queue administration UI. |

Example schedule request:

```json
{
	"senderEmail": "outreach@example.com",
	"name": "Product update",
	"subject": "A short update",
	"body": "Hello, here is the latest news.",
	"recipients": ["person@example.com"],
	"startAt": "2026-09-28T18:00:00.000Z",
	"delayPerEmail": 2
}
```

`startAt` should be an ISO-8601 date-time. `delayPerEmail` is a non-negative number of seconds and defaults to two. The sender must already exist in the database.

## Checks

Run these commands after making changes:

```powershell
# Backend type-check
Set-Location .\backend
npx tsc --noEmit

# Frontend lint and production build
Set-Location ..\frontend
npm run lint
npm run build
```

## Configuration and Operational Notes

- `PORT` selects the API port; the default is `4000`.
- `DATABASE_URL` is the Prisma PostgreSQL connection string.
- `REDIS_URL` selects the Redis connection; the default is `redis://localhost:6379`.
- `ELASTICSEARCH_NODE` selects the Elasticsearch node; the default is `http://localhost:9200`.
- `WORKER_CONCURRENCY` sets worker parallelism; invalid or missing values fall back to `10`.
- `User.slackToken` and `User.slackChannel` are optional. When both are present, the worker attempts to post a message when that sender reaches its hourly limit.
- Elasticsearch indexing is best-effort. The API does not automatically backfill older database rows into the search index.
- Startup recovery checks pending scheduled and rate-limited records and recreates queue jobs that are missing. It does not repair every possible interrupted worker state.

## Local-Only Security

This repository is configured for local development, not direct public exposure. The API currently has no authentication, CORS is open, and the Compose Elasticsearch service has security disabled. Do not expose these services to an untrusted network. Use real SMTP credentials only in ignored environment files or a secrets manager, and rotate any credentials that have been shared or committed.