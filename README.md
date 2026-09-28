# ReachInbox Production Email Scheduler & Delivery Engine

A robust, restart-proof, high-throughput email scheduling service built with Node.js, TypeScript, BullMQ, Redis, PostgreSQL (Prisma ORM), Elasticsearch, and Next.js.

## Key Features

- **Delayed Queue Architecture**: Uses BullMQ delayed jobs backed by Redis for precise, persistent email dispatching without relying on OS/Node cron tasks.
- **Sliding-Window Rate Limiting**: Implements Redis atomic counters to enforce per-sender hourly sending limits.
- **System Restart Resilience**: Auto-rehydrates pending or interrupted scheduled jobs from PostgreSQL back into BullMQ on server startup.
- **Full-Text Analytics**: Real-time indexing of sent and scheduled email logs into Elasticsearch for instant search and filtering.
- **Live Admin Dashboard**: Next.js UI for campaign creation, real-time job monitoring, and BullMQ queue administration (`/admin/queues`).

## Infrastructure Setup

Ensure Docker and Node.js are installed, then bring up the core infrastructure:

```bash
docker-compose up -d