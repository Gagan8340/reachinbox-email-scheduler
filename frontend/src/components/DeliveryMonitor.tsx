'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity, CircleAlert, CircleCheck, Clock3, LoaderCircle, Search, Send, TimerReset } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { explainApiError, findDeliveries, type DeliveryRecord, type DeliveryStatus } from '@/lib/reachinbox-api';

const statusFilters: { label: string; value: DeliveryStatus | 'ALL' }[] = [
  { label: 'All mail', value: 'ALL' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Delayed', value: 'DELAYED_RATE_LIMIT' },
  { label: 'Failed', value: 'FAILED' },
];

function readableStatus(status: DeliveryStatus) {
  return status === 'DELAYED_RATE_LIMIT' ? 'Delayed' : status.charAt(0) + status.slice(1).toLowerCase();
}

function statusGlyph(status: DeliveryStatus) {
  if (status === 'SENT') return <CircleCheck size={14} />;
  if (status === 'PROCESSING') return <Activity size={14} />;
  if (status === 'FAILED') return <CircleAlert size={14} />;
  if (status === 'DELAYED_RATE_LIMIT') return <TimerReset size={14} />;
  return <Clock3 size={14} />;
}

function displayTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : format(date, 'MMM d, HH:mm');
}

function totalFor(records: DeliveryRecord[], status: DeliveryStatus) {
  return records.filter((record) => record.status === status).length;
}

export function DeliveryMonitor() {
  const [searchText, setSearchText] = useState('');
  const [activeStatus, setActiveStatus] = useState<DeliveryStatus | 'ALL'>('ALL');
  const searchTerm = useDeferredValue(searchText.trim());
  const deliveries = useQuery({
    queryKey: ['deliveries', searchTerm],
    queryFn: () => findDeliveries({ query: searchTerm || undefined }),
    refetchInterval: 5_000,
  });
  const records = deliveries.data ?? [];
  const visibleRecords = activeStatus === 'ALL'
    ? records
    : records.filter((record) => record.status === activeStatus);

  return (
    <section className="monitor-panel" aria-labelledby="monitor-title">
      <div className="panel-heading monitor-heading">
        <div>
          <div className="section-index">02 <span>DELIVERY STREAM</span></div>
          <h2 id="monitor-title" className="panel-title">Live job monitor</h2>
          <p className="panel-subtitle">Status changes refresh automatically.</p>
        </div>
        <div className={`live-indicator ${deliveries.isError ? 'live-offline' : ''}`}>
          <span className="live-dot" />{deliveries.isError ? 'Disconnected' : 'Live'}
        </div>
      </div>

      <div className="metric-strip" aria-label="Delivery totals">
        <Metric label="Queued" value={totalFor(records, 'SCHEDULED') + totalFor(records, 'DELAYED_RATE_LIMIT')} tone="mint" icon={<Clock3 size={15} />} />
        <Metric label="In flight" value={totalFor(records, 'PROCESSING')} tone="amber" icon={<Activity size={15} />} />
        <Metric label="Delivered" value={totalFor(records, 'SENT')} tone="green" icon={<Send size={15} />} />
      </div>

      <div className="monitor-toolbar">
        <label className="search-control">
          <Search size={17} />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search recipient, subject, or status"
            aria-label="Search emails by recipient, subject, or status"
          />
          {deliveries.isFetching && <LoaderCircle size={15} className="spin search-spinner" aria-label="Updating results" />}
        </label>
        <span className="result-count">{visibleRecords.length} {visibleRecords.length === 1 ? 'result' : 'results'}</span>
      </div>

      <div className="status-tabs" role="tablist" aria-label="Filter delivery status">
        {statusFilters.map((filter) => (
          <button
            className={`status-tab ${activeStatus === filter.value ? 'status-tab-active' : ''}`}
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={activeStatus === filter.value}
            onClick={() => setActiveStatus(filter.value)}
          >
            {filter.label}
            {filter.value !== 'ALL' && <span>{totalFor(records, filter.value)}</span>}
          </button>
        ))}
      </div>

      <div className="delivery-table-wrap">
        <table className="delivery-table">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Scheduled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.isLoading && (
              <tr><td colSpan={4} className="table-message"><LoaderCircle className="spin" size={18} /> Loading delivery stream…</td></tr>
            )}
            {deliveries.isError && (
              <tr><td colSpan={4} className="table-message table-error">{explainApiError(deliveries.error)}</td></tr>
            )}
            {!deliveries.isLoading && !deliveries.isError && visibleRecords.length === 0 && (
              <tr><td colSpan={4} className="table-message">No email records match this view yet.</td></tr>
            )}
            {visibleRecords.map((record) => <DeliveryRow key={record.id} record={record} />)}
          </tbody>
        </table>
      </div>
      <div className="monitor-footnote"><span className="footnote-mark" /> Polling every 5 seconds <span className="footnote-divider">/</span> Elasticsearch index</div>
    </section>
  );
}

function Metric({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: React.ReactNode }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span className="metric-icon">{icon}</span>
      <span className="metric-copy"><strong>{value.toLocaleString()}</strong><small>{label}</small></span>
    </div>
  );
}

function DeliveryRow({ record }: { record: DeliveryRecord }) {
  return (
    <tr>
      <td>
        <div className="recipient-cell">{record.recipientEmail}</div>
        <div className="cell-caption">from {record.senderEmail}</div>
      </td>
      <td><div className="subject-cell" title={record.subject}>{record.subject}</div></td>
      <td>
        <div className="time-cell">{displayTime(record.scheduledAt)}</div>
        {record.sentAt && <div className="cell-caption">sent {displayTime(record.sentAt)}</div>}
      </td>
      <td>
        <span className={`delivery-status status-${record.status.toLowerCase()}`}>
          {statusGlyph(record.status)} {readableStatus(record.status)}
        </span>
      </td>
    </tr>
  );
}
