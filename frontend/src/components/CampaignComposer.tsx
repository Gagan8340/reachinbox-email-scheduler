'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarClock, Check, LoaderCircle, MailPlus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  explainApiError,
  loadSenders,
  scheduleCampaign,
  type CampaignSubmission,
} from '@/lib/reachinbox-api';

function localStartTime() {
  const soon = new Date(Date.now() + 5 * 60_000);
  soon.setSeconds(0, 0);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function splitRecipients(pasted: string) {
  return [...new Set(pasted.split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean))];
}

export function CampaignComposer({ onCreated }: { onCreated: () => void }) {
  const [senderEmail, setSenderEmail] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [startAt, setStartAt] = useState(localStartTime);
  const [delay, setDelay] = useState('2');
  const [successMessage, setSuccessMessage] = useState('');
  const senderQuery = useQuery({ queryKey: ['senders'], queryFn: loadSenders });
  const recipients = splitRecipients(recipientText);
  const createCampaign = useMutation({
    mutationFn: (submission: CampaignSubmission) => scheduleCampaign(submission),
    onSuccess: (result) => {
      setSuccessMessage(`${result.count} ${result.count === 1 ? 'message' : 'messages'} added to the queue.`);
      setCampaignName('');
      setSubject('');
      setBody('');
      setRecipientText('');
      onCreated();
    },
  });

  function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage('');
    createCampaign.mutate({
      senderEmail,
      name: campaignName.trim(),
      subject: subject.trim(),
      body: body.trim(),
      recipients,
      startAt: new Date(startAt).toISOString(),
      delayPerEmail: Number(delay),
    });
  }

  const senderError = senderQuery.isError ? explainApiError(senderQuery.error) : '';

  return (
    <section className="composer-panel" aria-labelledby="composer-title">
      <div className="panel-heading">
        <div className="section-index">01 <span>COMPOSE</span></div>
        <div className="heading-icon"><MailPlus size={18} strokeWidth={1.8} /></div>
      </div>
      <h2 id="composer-title" className="panel-title">Build a campaign</h2>
      <p className="panel-subtitle">Write once. Reach every contact at the right moment.</p>

      <form className="composer-form" onSubmit={submitCampaign}>
        <label className="field-block">
          <span className="field-label">Campaign name <span className="field-optional">OPTIONAL</span></span>
          <input
            className="text-control"
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
            placeholder="April product follow-up"
            maxLength={100}
          />
        </label>

        <label className="field-block">
          <span className="field-label">From sender</span>
          <select
            className="text-control"
            value={senderEmail}
            onChange={(event) => setSenderEmail(event.target.value)}
            required
            disabled={senderQuery.isLoading || senderQuery.data?.length === 0}
          >
            <option value="">{senderQuery.isLoading ? 'Loading senders…' : 'Choose a configured address'}</option>
            {senderQuery.data?.map((sender) => (
              <option key={sender.id} value={sender.senderEmail}>{sender.senderEmail}</option>
            ))}
          </select>
          {senderError && <span className="field-hint error-text">Sender list unavailable: {senderError}</span>}
          {!senderQuery.isLoading && !senderError && senderQuery.data?.length === 0 && (
            <span className="field-hint">No sender accounts are configured yet.</span>
          )}
        </label>

        <label className="field-block">
          <span className="field-label">Subject line</span>
          <input
            className="text-control"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="A thoughtful next step"
            maxLength={180}
            required
          />
        </label>

        <label className="field-block">
          <span className="field-label">Message</span>
          <textarea
            className="text-control message-control"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={'Hi {{firstName}},\n\nI wanted to share a quick update…'}
            rows={5}
            required
          />
          <span className="field-hint">Personalize with merge tags such as {'{{firstName}}'}.</span>
        </label>

        <label className="field-block">
          <span className="field-label recipient-label">
            <span>Recipients</span>
            <span className="recipient-count"><Users size={13} /> {recipients.length} added</span>
          </span>
          <textarea
            className="text-control recipients-control"
            value={recipientText}
            onChange={(event) => setRecipientText(event.target.value)}
            placeholder={'alex@example.com\nsam@example.com'}
            rows={4}
            required
          />
          <span className="field-hint">Paste addresses separated by commas or new lines.</span>
        </label>

        <div className="schedule-fields">
          <label className="field-block">
            <span className="field-label">Start sending</span>
            <span className="input-with-icon">
              <CalendarClock size={16} />
              <input
                className="text-control"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                required
              />
            </span>
          </label>
          <label className="field-block delay-field">
            <span className="field-label">Spacing <span className="field-optional">SEC / EMAIL</span></span>
            <input
              className="text-control"
              type="number"
              min="0"
              max="3600"
              step="1"
              value={delay}
              onChange={(event) => setDelay(event.target.value)}
              required
            />
          </label>
        </div>

        {createCampaign.isError && (
          <p className="form-feedback error-text" role="alert">{explainApiError(createCampaign.error)}</p>
        )}
        {successMessage && (
          <p className="form-feedback success-text" role="status"><Check size={15} /> {successMessage}</p>
        )}
        <button className="primary-action" type="submit" disabled={createCampaign.isPending || !senderQuery.data?.length}>
          {createCampaign.isPending ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
          {createCampaign.isPending ? 'Scheduling campaign…' : 'Schedule campaign'}
        </button>
      </form>
    </section>
  );
}
