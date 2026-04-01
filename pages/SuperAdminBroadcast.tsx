import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, Users, Filter, Mail, ChevronLeft, AlertCircle,
  CheckCircle, Loader2, Eye, X, Radio, BarChart2
} from 'lucide-react';

interface SuperAdminBroadcastProps {
  token: string;
  onLogout: () => void;
}

type UserType = 'club_owners' | 'coaches' | 'parents';
type PlanFilter = 'all' | 'trial' | 'paying';
type PremiumFilter = 'all' | 'free' | 'premium';
type ArtFilter = 'all' | 'Taekwondo' | 'Karate' | 'BJJ' | 'Judo' | 'MMA' | 'Kickboxing' | 'Kung Fu' | 'Custom';

interface AudiencePreview {
  count: number;
  sample: { email: string; name: string }[];
}

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
  batches: number;
}

const ARTS: ArtFilter[] = ['all', 'Taekwondo', 'Karate', 'BJJ', 'Judo', 'MMA', 'Kickboxing', 'Kung Fu', 'Custom'];

export const SuperAdminBroadcast: React.FC<SuperAdminBroadcastProps> = ({ token, onLogout }) => {
  const [userType, setUserType] = useState<UserType>('club_owners');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>('all');
  const [artFilter, setArtFilter] = useState<ArtFilter>('all');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromName, setFromName] = useState('MyTaek Team');

  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ userType });
    if (userType === 'club_owners') { p.set('plan', planFilter); p.set('art', artFilter); }
    if (userType === 'coaches') { p.set('art', artFilter); }
    if (userType === 'parents') { p.set('premium', premiumFilter); }
    return p;
  }, [userType, planFilter, premiumFilter, artFilter]);

  const fetchAudience = useCallback(async () => {
    setLoadingAudience(true);
    setAudience(null);
    try {
      const res = await fetch(`/api/super-admin/broadcast/audience?${buildParams()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setAudience(data);
    } catch {
      setAudience({ count: 0, sample: [] });
    } finally {
      setLoadingAudience(false);
    }
  }, [buildParams, token]);

  useEffect(() => { fetchAudience(); }, [fetchAudience]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.');
      return;
    }
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/super-admin/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userType,
          planFilter: userType === 'club_owners' ? planFilter : undefined,
          premiumFilter: userType === 'parents' ? premiumFilter : undefined,
          artFilter: userType !== 'parents' ? artFilter : undefined,
          subject: subject.trim(),
          body: body.trim(),
          fromName: fromName.trim() || 'MyTaek Team',
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Send failed');
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  const segmentLabel = () => {
    if (userType === 'club_owners') return `Club Owners · ${planFilter === 'all' ? 'All plans' : planFilter === 'trial' ? 'Trial only' : 'Paying only'} · ${artFilter === 'all' ? 'All disciplines' : artFilter}`;
    if (userType === 'coaches') return `Coaches · ${artFilter === 'all' ? 'All disciplines' : artFilter}`;
    return `Parents · ${premiumFilter === 'all' ? 'All' : premiumFilter === 'premium' ? 'Premium' : 'Free'}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Nav */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/super-admin/dashboard" className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4" /> Dashboard
          </Link>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-white">Email Broadcast</span>
          </div>
        </div>
        <button onClick={onLogout} className="text-gray-500 hover:text-white text-xs transition-colors">Log out</button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Email Broadcast Tool</h1>
          <p className="text-gray-400 text-sm mt-1">Compose and send marketing emails to segmented audiences using your SendGrid account.</p>
        </div>

        {result ? (
          /* Success State */
          <div className="max-w-lg mx-auto text-center py-16">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Broadcast Sent!</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-6 text-left space-y-3">
              <div className="flex justify-between"><span className="text-gray-400">Emails sent</span><span className="text-green-400 font-bold">{result.sent.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Skipped (unsubscribed)</span><span className="text-yellow-400 font-bold">{result.skipped}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Errors</span><span className={result.errors > 0 ? 'text-red-400 font-bold' : 'text-gray-500'}>{result.errors}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Batches used</span><span className="text-gray-300">{result.batches}</span></div>
            </div>
            <button
              onClick={() => { setResult(null); setSubject(''); setBody(''); }}
              className="mt-6 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors text-sm"
            >
              Send Another Broadcast
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* LEFT: Segmentation Panel */}
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Filter className="w-4 h-4 text-purple-400" />
                  <h2 className="font-semibold text-white text-sm uppercase tracking-wide">Audience Segment</h2>
                </div>

                {/* User Type */}
                <div className="mb-5">
                  <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Who to target</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['club_owners', 'coaches', 'parents'] as UserType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setUserType(t)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${userType === t ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                      >
                        {t === 'club_owners' ? 'Club Owners' : t === 'coaches' ? 'Coaches' : 'Parents'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Plan filter (club owners only) */}
                {userType === 'club_owners' && (
                  <div className="mb-5">
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Filter by plan</p>
                    <div className="space-y-1.5">
                      {([['all', 'All plans'], ['trial', 'Trial only (active trial)'], ['paying', 'Paying only (converted)']] as [PlanFilter, string][]).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2.5 cursor-pointer group">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${planFilter === val ? 'border-purple-500 bg-purple-500' : 'border-gray-600 group-hover:border-gray-500'}`}>
                            {planFilter === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm text-gray-300">{label}</span>
                          <input type="radio" className="hidden" checked={planFilter === val} onChange={() => setPlanFilter(val)} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Premium filter (parents only) */}
                {userType === 'parents' && (
                  <div className="mb-5">
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Filter by status</p>
                    <div className="space-y-1.5">
                      {([['all', 'All parents'], ['free', 'Free users only'], ['premium', 'Premium subscribers only']] as [PremiumFilter, string][]).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2.5 cursor-pointer group">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${premiumFilter === val ? 'border-purple-500 bg-purple-500' : 'border-gray-600 group-hover:border-gray-500'}`}>
                            {premiumFilter === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm text-gray-300">{label}</span>
                          <input type="radio" className="hidden" checked={premiumFilter === val} onChange={() => setPremiumFilter(val)} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Art/Discipline filter (club owners & coaches) */}
                {userType !== 'parents' && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Filter by discipline</p>
                    <select
                      value={artFilter}
                      onChange={e => setArtFilter(e.target.value as ArtFilter)}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500"
                    >
                      {ARTS.map(a => (
                        <option key={a} value={a}>{a === 'all' ? 'All disciplines' : a}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Audience preview */}
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Estimated audience</p>
                    <button onClick={fetchAudience} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Refresh</button>
                  </div>
                  {loadingAudience ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                      <span className="text-sm text-gray-400">Counting…</span>
                    </div>
                  ) : audience ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{audience.count.toLocaleString()}</span>
                        <span className="text-sm text-gray-400">recipients</span>
                      </div>
                      {audience.sample.length > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            {showPreview ? 'Hide' : 'Preview'} sample
                          </button>
                          {showPreview && (
                            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                              {audience.sample.map((s, i) => (
                                <div key={i} className="text-xs text-gray-400 font-mono truncate">{s.email}</div>
                              ))}
                              {audience.count > audience.sample.length && (
                                <div className="text-xs text-gray-600 italic">...and {(audience.count - audience.sample.length).toLocaleString()} more</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* RIGHT: Email Composer */}
            <div className="lg:col-span-3 space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="w-4 h-4 text-purple-400" />
                  <h2 className="font-semibold text-white text-sm uppercase tracking-wide">Email Composer</h2>
                </div>

                {/* Segment summary */}
                <div className="bg-purple-900/20 border border-purple-800/40 rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span className="text-purple-300 text-sm font-medium">{segmentLabel()}</span>
                  {audience && <span className="ml-auto text-purple-400 text-sm font-bold">{audience.count.toLocaleString()} recipients</span>}
                </div>

                {/* From name */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">From Name</label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={e => setFromName(e.target.value)}
                    placeholder="MyTaek Team"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-purple-500 placeholder-gray-600"
                  />
                </div>

                {/* Subject */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Email Subject *</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="🥋 Big news from MyTaek — don't miss this"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-purple-500 placeholder-gray-600"
                  />
                </div>

                {/* Body */}
                <div className="mb-2">
                  <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Email Body (HTML or plain text) *</label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={`<h2>Hello!</h2>\n<p>We have exciting news to share...</p>\n\n<!-- Or paste plain text -->`}
                    rows={14}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 placeholder-gray-600 font-mono resize-y"
                  />
                  <p className="text-xs text-gray-600 mt-1">HTML is supported. An unsubscribe link is automatically appended to every email.</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                )}

                {/* Send Button */}
                <button
                  onClick={() => {
                    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
                    if (!audience || audience.count === 0) { setError('No recipients match the current segment.'); return; }
                    setError('');
                    setShowConfirm(true);
                  }}
                  disabled={sending || loadingAudience}
                  className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send Broadcast to {audience?.count.toLocaleString() ?? '…'} recipients
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Confirm Broadcast</h3>
              </div>
              <button onClick={() => setShowConfirm(false)} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 mb-5 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Segment</span><span className="text-white font-medium truncate max-w-[180px] text-right">{segmentLabel()}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Recipients</span><span className="text-yellow-300 font-bold">{audience?.count.toLocaleString()} emails</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Subject</span><span className="text-white truncate max-w-[180px] text-right">{subject}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">From</span><span className="text-white">{fromName || 'MyTaek Team'}</span></div>
            </div>
            <p className="text-gray-400 text-xs mb-5">
              This will immediately send emails via SendGrid. This action cannot be undone. Unsubscribed users are automatically excluded.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors text-sm font-semibold border border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Confirm & Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
