import express from 'express';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './config/queue';
import { rehydratePendingJobsOnStartup } from './services/scheduler';
import { initElasticsearch, esClient, REACHINBOX_INDEX, indexEmailRecord } from './services/elasticsearch';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Setup BullMQ Board Dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

app.get('/api/senders', async (_req, res) => {
  try {
    const senders = await prisma.emailSender.findMany({
      select: { id: true, senderEmail: true, hourlyLimit: true },
      orderBy: { senderEmail: 'asc' },
    });
    return res.json({ success: true, data: senders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Schedule Campaign API
app.post('/api/campaigns/schedule', async (req, res) => {
  try {
    const { senderId, senderEmail, name, subject, body, recipients, startAt, delayPerEmail } = req.body;
    const recipientList = Array.isArray(recipients)
      ? recipients.map((recipient: unknown) => String(recipient).trim()).filter(Boolean)
      : [];
    const scheduledAt = new Date(startAt);
    const spacingSeconds = Number(delayPerEmail ?? 2);

    if (!subject?.trim() || !body?.trim() || recipientList.length === 0 || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'Provide a subject, message, valid start time, and at least one recipient.' });
    }

    if (!Number.isFinite(spacingSeconds) || spacingSeconds < 0) {
      return res.status(400).json({ error: 'Delay per email must be zero or greater.' });
    }

    const sender = await prisma.emailSender.findFirst({
      where: senderId ? { id: senderId } : { senderEmail: String(senderEmail || '').trim() },
    });

    if (!sender) {
      return res.status(400).json({ error: 'That sender is not configured. Add its SMTP settings before scheduling.' });
    }

    const campaign = await prisma.emailCampaign.create({
      data: {
        userId: sender.userId,
        name: name || 'Default Campaign',
        subject,
        body,
        delayPerEmail: spacingSeconds,
      },
    });

    const createdEmails = [];

    for (const recipient of recipientList) {
      const emailRecord = await prisma.scheduledEmail.create({
        data: {
          campaignId: campaign.id,
          senderId: sender.id,
          recipientEmail: recipient,
          subject,
          body,
          scheduledAt,
        },
      });

      const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

      const job = await emailQueue.add(
        'send-outbound-email',
        {
          emailId: emailRecord.id,
          senderId: sender.id,
          recipientEmail: recipient,
          subject,
          body,
          delayBetweenSendsMs: spacingSeconds * 1000,
        },
        { delay: delayMs, jobId: `email_${emailRecord.id}` }
      );

      const queuedEmail = await prisma.scheduledEmail.update({
        where: { id: emailRecord.id },
        data: { bullJobId: job.id },
      });

      await indexEmailRecord({
        id: queuedEmail.id,
        campaignId: queuedEmail.campaignId,
        senderEmail: sender.senderEmail,
        recipientEmail: queuedEmail.recipientEmail,
        subject: queuedEmail.subject,
        body: queuedEmail.body,
        status: queuedEmail.status,
        scheduledAt: queuedEmail.scheduledAt,
        sentAt: queuedEmail.sentAt,
      });

      createdEmails.push(queuedEmail);
    }

    return res.status(201).json({ success: true, count: createdEmails.length, campaignId: campaign.id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Search API using Elasticsearch
app.get('/api/emails/search', async (req, res) => {
  try {
    const { query, status } = req.query;
    const mustFilters: any[] = [];
    const knownStatuses = ['SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'DELAYED_RATE_LIMIT'];

    if (status) mustFilters.push({ term: { status } });
    if (query) {
      const searchText = String(query).trim();
      const matchingStatuses = knownStatuses.filter((value) => value.includes(searchText.toUpperCase()));
      const searchOptions: any[] = [{
        multi_match: {
          query: searchText,
          fields: ['recipientEmail', 'subject', 'body', 'senderEmail'],
        },
      }];

      matchingStatuses.forEach((value) => searchOptions.push({ term: { status: value } }));
      mustFilters.push({ bool: { should: searchOptions, minimum_should_match: 1 } });
    }

    const searchQuery: any = mustFilters.length ? { bool: { must: mustFilters } } : { match_all: {} };

    const searchResponse = await esClient.search({
      index: REACHINBOX_INDEX,
      query: searchQuery,
      size: 100,
      sort: [{ scheduledAt: { order: 'desc' } }],
    });

    const hits = searchResponse.hits.hits.map((h: any) => h._source);
    return res.json({ success: true, data: hits });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`🚀 ReachInbox Server running on port ${PORT}`);
  await initElasticsearch();
  await rehydratePendingJobsOnStartup();
});