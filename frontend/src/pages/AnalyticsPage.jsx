import React, { useState, useEffect } from 'react';
import { Brain, Wrench, Activity } from 'lucide-react';
import { getAiPerformance } from '../api/admin.js';
import StatCard from '../components/StatCard.jsx';

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);

  useEffect(() => {
    getAiPerformance(days).then(setData).catch(() => setData(null));
  }, [days]);

  if (!data) return <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto', width: '100%', color: 'var(--text-muted)' }}>Loading analytics…</div>;

  const maxTool = Math.max(1, ...data.tool_usage.map(t => t.count));
  const totalMsg = data.confidence_series.reduce((s, c) => s + c.count, 0);

  const resolutionColors = {
    ai_resolved: '#6ee7b7', appointment_completed: '#5eead4', ticket_created: '#93c5fd',
    human_resolved: '#fbbf24', escalated: '#fbbf24', abandoned: '#fca5a5', unresolved: '#f87171',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>AI Performance</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>{data.range.from} → {data.range.to}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: days === d ? 'var(--brand-gradient)' : 'transparent', color: days === d ? '#fff' : '#94a3b8' }}>{d}d</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard value={data.total_calls} label="Total Calls" accent="purple" />
        <StatCard value={data.ai_resolved} label="AI Resolved" accent="emerald" />
        <StatCard value={`${(data.resolution_rate * 100).toFixed(1)}%`} label="Resolution Rate" accent="gold" />
        <StatCard value={totalMsg} label="Messages Analyzed" accent="fire" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Brain size={15} color="#93c5fd" /> Resolution breakdown</h3>
          {Object.keys(data.resolution_breakdown).length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No resolved calls in this range.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {Object.entries(data.resolution_breakdown).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: resolutionColors[k] || '#64748b', flexShrink: 0 }} />
                  <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)', minWidth: 150 }}>{k.replace('_', ' ')}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <div style={{ width: `${(v / data.total_calls) * 100}%`, height: '100%', background: resolutionColors[k] || '#64748b', borderRadius: 4 }} />
                  </div>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Wrench size={15} color="#5eead4" /> Tool usage</h3>
          {data.tool_usage.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No tools used in this range.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {data.tool_usage.map(t => (
                <div key={t.tool} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--text-secondary)', minWidth: 170 }}>{t.tool}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <div style={{ width: `${(t.count / maxTool) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #14b8a6)', borderRadius: 4 }} />
                  </div>
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={15} color="#fbbf24" /> Answer confidence over time</h3>
        {data.confidence_series.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No confidence data yet.</p> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, maxWidth: '100%', overflowX: 'auto', paddingBottom: 4 }}>
            {data.confidence_series.map(c => (
              <div key={c.date} style={{ flex: '1 0 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.avg_confidence.toFixed(2)}</span>
                <div style={{ width: '100%', maxWidth: 30, height: Math.max(4, c.avg_confidence * 90), borderRadius: '6px 6px 0 0', background: c.avg_confidence >= 0.6 ? 'linear-gradient(180deg, #34d399, #10b981)' : c.avg_confidence >= 0.35 ? 'linear-gradient(180deg, #fbbf24, #f59e0b)' : 'linear-gradient(180deg, #fca5a5, #ef4444)' }} title={`${c.date}: avg ${c.avg_confidence} (${c.count} msgs)`} />
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{c.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}