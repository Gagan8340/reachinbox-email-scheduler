import { Client } from '@elastic/elasticsearch';

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
});

export const REACHINBOX_INDEX = 'reachinbox_emails_v1';

export async function initElasticsearch() {
  try {
    const exists = await esClient.indices.exists({ index: REACHINBOX_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: REACHINBOX_INDEX,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            senderEmail: { type: 'keyword' },
            recipientEmail: { type: 'keyword' },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
          },
        },
      });
      console.log('✅ Elasticsearch index initialized.');
    }
  } catch (err) {
    console.error('⚠️ Elasticsearch setup warning:', err);
  }
}

export async function indexEmailRecord(document: Record<string, any>) {
  try {
    await esClient.index({
      index: REACHINBOX_INDEX,
      id: document.id,
      document,
      refresh: 'wait_for',
    });
  } catch (err) {
    console.error(`Failed to index record ${document.id}:`, err);
  }
}