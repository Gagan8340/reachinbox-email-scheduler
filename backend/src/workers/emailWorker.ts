import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { redisConnection, OUTBOUND_EMAIL_QUEUE, emailQueue } from '../config/queue';
import { PrismaClient, CampaignStatus } from '@prisma/client';
import { indexEmailRecord } from '../services/elasticsearch';
import { WebClient } from '@slack/web-api';

const prisma = new PrismaClient();
const configuredConcurrency = Number.parseInt(process.env.WORKER_CONCURRENCY || '10', 10);
const CONCURRENCY_LIMIT = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : 10;

interface JobPayload {
  emailId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  delayBetweenSendsMs: number;
}

async function verifySlidingRateLimit(senderId: string, limit: number): Promise<{ allowed: boolean; waitMs: number }> {
  const now = Date.now();
  const windowMs = 3600 * 1000;
  const key = `rate_limit_sender:${senderId}`;

  const multi = redisConnection.multi();
  multi.zremrangebyscore(key, 0, now - windowMs);
  multi.zcard(key);

  const execRes = await multi.exec();
  const count = (execRes?.[1]?.[1] as number) || 0;

  if (count >= limit) {
    const oldest = await redisConnection.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTimestamp = oldest.length > 1 ? parseInt(oldest[1], 10) : now;
    const waitMs = Math.max(1000, oldestTimestamp + windowMs - now);
    return { allowed: false, waitMs };
  }

  await redisConnection.zadd(key, now, `${now}:${Math.random().toString(36).substring(2, 6)}`);
  await redisConnection.expire(key, 3600);
  return { allowed: true, waitMs: 0 };
}

async function triggerSlackRateAlert(userId: string, senderEmail: string, limit: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.slackToken || !user.slackChannel) return;

  try {
    const slack = new WebClient(user.slackToken);
    await slack.chat.postMessage({
      channel: user.slackChannel,
      text: `⚠️ *ReachInbox Limit Alert*\n\nSender Email \`${senderEmail}\` reached its rate limit (${limit}/hr). Rescheduling emails...`,
    });
  } catch (err) {
    console.error('Slack Alert Failed:', err);
  }
}

async function writeEmailSearchDocument(emailId: string, status: CampaignStatus, sentAt?: Date) {
  const record = await prisma.scheduledEmail.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!record) return;

  await indexEmailRecord({
    id: record.id,
    campaignId: record.campaignId,
    senderEmail: record.sender.senderEmail,
    recipientEmail: record.recipientEmail,
    subject: record.subject,
    body: record.body,
    status,
    scheduledAt: record.scheduledAt,
    sentAt: sentAt ?? record.sentAt,
  });
}

export const emailWorker = new Worker<JobPayload>(
  OUTBOUND_EMAIL_QUEUE,
  async (job: Job<JobPayload>) => {
    const { emailId, senderId, recipientEmail, subject, body, delayBetweenSendsMs } = job.data;

    const emailRecord = await prisma.scheduledEmail.findUnique({
      where: { id: emailId },
      include: { sender: { include: { user: true } } },
    });

    if (!emailRecord || emailRecord.status === CampaignStatus.SENT) {
      return { status: 'SKIPPED' };
    }

    const sender = emailRecord.sender;
    const rateCheck = await verifySlidingRateLimit(senderId, sender.hourlyLimit);

    if (!rateCheck.allowed) {
      await prisma.scheduledEmail.update({
        where: { id: emailId },
        data: { status: CampaignStatus.DELAYED_RATE_LIMIT },
      });

      await writeEmailSearchDocument(emailId, CampaignStatus.DELAYED_RATE_LIMIT);

      await triggerSlackRateAlert(sender.userId, sender.senderEmail, sender.hourlyLimit);

      await emailQueue.add(
        job.name,
        job.data,
        { delay: rateCheck.waitMs, jobId: `delayed_${emailId}_${Date.now()}` }
      );

      return { status: 'RATE_LIMITED_RESCHEDULED', waitMs: rateCheck.waitMs };
    }

    await prisma.scheduledEmail.update({
      where: { id: emailId },
      data: { status: CampaignStatus.PROCESSING },
    });
    await writeEmailSearchDocument(emailId, CampaignStatus.PROCESSING);

    if (delayBetweenSendsMs > 0) {
      await new Promise((r) => setTimeout(r, delayBetweenSendsMs));
    }

    const transporter = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: false,
      auth: {
        user: sender.smtpUser,
        pass: sender.smtpPass,
      },
    });

    const sendResult = await transporter.sendMail({
      from: `"${sender.user.name || 'Outreach Manager'}" <${sender.senderEmail}>`,
      to: recipientEmail,
      subject,
      text: body,
      html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
    });

    const sentAt = new Date();

    const updated = await prisma.scheduledEmail.update({
      where: { id: emailId },
      data: {
        status: CampaignStatus.SENT,
        sentAt,
      },
    });

    await indexEmailRecord({
      id: updated.id,
      campaignId: updated.campaignId,
      senderEmail: sender.senderEmail,
      recipientEmail: updated.recipientEmail,
      subject: updated.subject,
      body: updated.body,
      status: CampaignStatus.SENT,
      scheduledAt: updated.scheduledAt,
      sentAt,
    });

    return { status: 'SUCCESS', messageId: sendResult.messageId };
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY_LIMIT,
  }
);

emailWorker.on('ready', () => console.log(`Email worker ready with concurrency ${CONCURRENCY_LIMIT}.`));
emailWorker.on('error', (error) => console.error('Email worker connection error:', error));
emailWorker.on('failed', async (job, error) => {
  console.error(`Email job ${job?.id ?? 'unknown'} failed:`, error);

  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;

  try {
    await prisma.scheduledEmail.update({
      where: { id: job.data.emailId },
      data: { status: CampaignStatus.FAILED, lastError: error.message.slice(0, 1000) },
    });
    await writeEmailSearchDocument(job.data.emailId, CampaignStatus.FAILED);
  } catch (updateError) {
    console.error(`Could not record terminal failure for email ${job.data.emailId}:`, updateError);
  }
});

let shutdownStarted = false;
async function stopEmailWorker(signal: NodeJS.Signals) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; closing email worker.`);

  try {
    await emailWorker.close();
    await emailQueue.close();
    await prisma.$disconnect();
    await redisConnection.quit();
    process.exitCode = 0;
  } catch (error) {
    console.error('Email worker shutdown failed:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void stopEmailWorker('SIGINT'));
process.once('SIGTERM', () => void stopEmailWorker('SIGTERM'));