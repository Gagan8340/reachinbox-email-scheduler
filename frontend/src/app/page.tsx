'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, AtSign, ExternalLink, Layers3, Radio, Send } from 'lucide-react';
import { CampaignComposer } from '@/components/CampaignComposer';
import { DeliveryMonitor } from '@/components/DeliveryMonitor';

export default function Home() {
  const queryClient = useQueryClient();

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="ReachInbox home">
          <span className="brand-symbol"><AtSign size={19} strokeWidth={2.1} /></span>
          <span>reach<span className="brand-light">inbox</span></span>
        </a>
        <div className="topbar-right">
          <span className="service-state"><span className="service-dot" /> API connected</span>
          <a className="queue-link" href="http://localhost:4000/admin/queues" target="_blank" rel="noreferrer">
            Queue dashboard <ExternalLink size={13} />
          </a>
          <div className="avatar-mark" aria-label="Workspace">R</div>
        </div>
      </header>

      <div id="top" className="page-content">
        <section className="welcome-band">
          <div className="welcome-copy">
            <div className="eyebrow"><Radio size={13} /> OUTBOUND WORKSPACE <span className="eyebrow-rule" /> MONDAY, SEPTEMBER 28</div>
            <h1>Make every send <em>count.</em></h1>
            <p>One calm place to compose, schedule, and follow every conversation.</p>
          </div>
          <div className="welcome-stamp" aria-hidden="true">
            <div className="stamp-ring"><span>R</span><Send size={17} /></div>
            <span className="stamp-caption">SENDING<br />WITH INTENTION</span>
          </div>
        </section>

        <div className="workspace-label">
          <span><Layers3 size={15} /> CAMPAIGN WORKSPACE</span>
          <span className="workspace-line" />
          <span className="timezone-note">Local schedule time</span>
        </div>

        <div className="dashboard-grid">
          <CampaignComposer onCreated={() => queryClient.invalidateQueries({ queryKey: ['deliveries'] })} />
          <DeliveryMonitor />
        </div>

        <footer className="page-footer">
          <span>REACHINBOX <span className="footer-dot">•</span> CAMPAIGN OPERATIONS</span>
          <span>Every message, accounted for <ArrowUpRight size={13} /></span>
        </footer>
      </div>
    </main>
  );
}
