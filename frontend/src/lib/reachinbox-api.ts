import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  timeout: 12_000,
  headers: { 'Content-Type': 'application/json' },
});

export type DeliveryStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'DELAYED_RATE_LIMIT';

export interface SenderOption {
  id: string;
  senderEmail: string;
  hourlyLimit: number;
}

export interface DeliveryRecord {
  id: string;
  campaignId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: DeliveryStatus;
  scheduledAt: string;
  sentAt?: string | null;
}

export interface CampaignSubmission {
  senderEmail: string;
  name: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayPerEmail: number;
}

export async function loadSenders(): Promise<SenderOption[]> {
  const response = await api.get<{ data: SenderOption[] }>('/senders');
  return response.data.data;
}

export async function findDeliveries(filters: {
  query?: string;
  status?: DeliveryStatus;
}): Promise<DeliveryRecord[]> {
  const response = await api.get<{ data: DeliveryRecord[] }>('/emails/search', {
    params: filters,
  });
  return response.data.data;
}

export async function scheduleCampaign(submission: CampaignSubmission) {
  const response = await api.post('/campaigns/schedule', submission);
  return response.data as { success: boolean; count: number; campaignId: string };
}

export function explainApiError(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || error.message || 'The service could not be reached.';
  }

  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
