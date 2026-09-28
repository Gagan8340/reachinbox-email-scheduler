import { PrismaClient, CampaignStatus } from '@prisma/client';
import { emailQueue } from '../config/queue';

const prisma = new PrismaClient();

export async function rehydratePendingJobsOnStartup() {
  console.log('🔄 Re-hydrating pending jobs from Database to Redis Queue...');

  const activeEmails = await prisma.scheduledEmail.findMany({
    where: {
      status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.DELAYED_RATE_LIMIT] },
    },
    include: { campaign: true },
  });

  let rehydratedCount = 0;

  for (const item of activeEmails) {
    const existingJob = item.bullJobId ? await emailQueue.getJob(item.bullJobId) : null;

    if (!existingJob) {
      const now = Date.now();
      const targetExecution = new Date(item.scheduledAt).getTime();
      const delayMs = Math.max(0, targetExecution - now);

      const job = await emailQueue.add(
        'send-outbound-email',
        {
          emailId: item.id,
          senderId: item.senderId,
          recipientEmail: item.recipientEmail,
          subject: item.subject,
          body: item.body,
          delayBetweenSendsMs: item.campaign.delayPerEmail * 1000,
        },
        {
          delay: delayMs,
          jobId: `rehydrated_${item.id}`,
        }
      );

      await prisma.scheduledEmail.update({
        where: { id: item.id },
        data: { bullJobId: job.id },
      });

      rehydratedCount++;
    }
  }

  console.log(`✅ System startup complete. Rehydrated ${rehydratedCount} persistent jobs.`);
}