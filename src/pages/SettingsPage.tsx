import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';
import { useAiraVoice } from '../hooks/useAiraVoice';

interface IntegrationEntry {
  configured: boolean;
  status: string;
  detail: string;
}

interface VoiceOption {
  id: string;
  label: string;
  provider: string;
  locale: string;
  description: string;
  recommended?: boolean;
}

export function SettingsPage() {
  const voice = useAiraVoice();
  const [user, setUser] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    companyName: string;
  } | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [integrations, setIntegrations] = useState<Record<string, IntegrationEntry>>({});
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<{
        user: typeof user;
        settings: Record<string, string>;
        integrations: Record<string, IntegrationEntry>;
      }>('/api/settings'),
      apiRequest<{ voices: VoiceOption[] }>('/api/voice/options'),
    ])
      .then(([sData, vData]) => {
        setUser(sData.user);
        setSettings(sData.settings);
        setIntegrations(sData.integrations);
        setVoiceOptions(vData.voices);
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMsg(null);
    await apiRequest('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    setSaveMsg('Aira & screening configuration saved.');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(pwForm),
      });
      setPwMsg('Password updated successfully.');
      setPwForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPwMsg((err as Error).message);
    }
  };

  const handleRetentionPurge = async () => {
    const days = Number.parseInt(settings['retention.days'] || '90', 10);
    const res = await apiRequest<{ purgedResumes: number; deletedFiles: number }>(
      '/api/settings/retention-purge',
      { method: 'POST', body: JSON.stringify({ days }) }
    );
    setPurgeMsg(`Purged ${res.purgedResumes} resume record(s) older than ${days} days.`);
  };

  const previewVoice = (v: VoiceOption) => {
    void voice.speak(
      `Hello! I'm Aira, your virtual recruitment assistant at HireFlow AI. Using ${v.label}.`,
      {
        voiceId: v.id,
        speechRate: Number.parseFloat(settings['aira.speechRate'] || '0.95'),
        language: v.locale,
      }
    );
  };

  return (
    <DashboardLayout
      title="Settings & Integrations"
      subtitle="Recruiter profile, Aira voice & rubric configuration, honest provider status, security, and data retention"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aira Voice & Interview Settings */}
        <form onSubmit={handleSaveSettings} className="glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white">Aira Voice & Interview Rules</h2>

          <div className="space-y-2.5">
            <span className="text-xs font-semibold text-[#C8B9C0] block">
              Select Aira Voice (Recommended default: Azure en-IN Neerja Neural)
            </span>
            {voiceOptions.map((v) => {
              const selected = settings['aira.voice'] === v.id;
              return (
                <div
                  key={v.id}
                  className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                    selected ? 'border-[#C26A8A] bg-[#4B1528]/35' : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="airaVoice"
                      checked={selected}
                      onChange={() => setSettings((p) => ({ ...p, 'aira.voice': v.id }))}
                      className="mt-1 accent-[#C26A8A]"
                    />
                    <div>
                      <p className="text-xs font-bold text-white">
                        {v.label} {v.recommended ? '(Recommended)' : ''}
                      </p>
                      <p className="text-[11px] text-[#8E7E87]">{v.description}</p>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => previewVoice(v)}
                    className="px-2.5 py-1.5 rounded-lg border border-white/15 text-xs text-white hover:bg-white/10 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Preview
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1 block">
              <span className="text-[#C8B9C0]">Primary Language</span>
              <select
                value={settings['aira.language'] || 'en-IN'}
                onChange={(e) => setSettings((p) => ({ ...p, 'aira.language': e.target.value }))}
                className="w-full bg-[#10090D] border border-white/15 rounded-xl px-3 py-2 text-white"
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi</option>
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[#C8B9C0]">Max Interview Duration (min)</span>
              <input
                type="number"
                min={5}
                max={30}
                value={settings['aira.maxDurationMinutes'] || '15'}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, 'aira.maxDurationMinutes': e.target.value }))
                }
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[#C8B9C0]">Default Shortlist Threshold (%)</span>
              <input
                type="number"
                min={40}
                max={95}
                value={settings['screening.threshold'] || '70'}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, 'screening.threshold': e.target.value }))
                }
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[#C8B9C0]">Speech Rate (0.8–1.2)</span>
              <input
                type="number"
                step="0.05"
                min={0.8}
                max={1.2}
                value={settings['aira.speechRate'] || '0.95'}
                onChange={(e) => setSettings((p) => ({ ...p, 'aira.speechRate': e.target.value }))}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white"
              />
            </label>
          </div>

          {saveMsg && <p className="text-xs text-[#39C98A]">{saveMsg}</p>}
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white cursor-pointer"
          >
            Save Configuration
          </button>
        </form>

        {/* Honest Integration Statuses & Profile */}
        <div className="space-y-6">
          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-white">Integration Status (Secrets Never Exposed)</h2>
            <div className="space-y-2.5">
              {Object.entries(integrations).map(([key, item]) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-white uppercase tracking-wider">{key}</p>
                    <p className="text-[#8E7E87] mt-0.5">{item.detail}</p>
                  </div>
                  <span
                    className={`font-semibold shrink-0 ${
                      item.configured ? 'text-[#39C98A]' : 'text-[#E8B45C]'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Recruiter Profile & Security</h2>
            {user && (
              <p className="text-xs text-[#C8B9C0]">
                Signed in as <strong className="text-white">{user.firstName} {user.lastName}</strong> ({user.email}) · Role: {user.role} · {user.companyName}
              </p>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  required
                  placeholder="Current password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="New password (min 8)"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              {pwMsg && <p className="text-xs text-[#C8B9C0]">{pwMsg}</p>}
              <button
                type="submit"
                className="px-4 py-2 rounded-xl border border-white/15 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
              >
                Update Password
              </button>
            </form>

            <div className="border-t border-white/10 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-white">CV & File Retention Policy</p>
                <p className="text-[#8E7E87]">
                  Purge stored resume files older than {settings['retention.days'] || '90'} days.
                </p>
                {purgeMsg && <p className="text-[#39C98A] mt-1">{purgeMsg}</p>}
              </div>
              <button
                type="button"
                onClick={() => void handleRetentionPurge()}
                className="px-3.5 py-2 rounded-xl border border-[#EF6677]/40 text-[#FFB8C1] hover:bg-[#EF6677]/15 cursor-pointer"
              >
                Run Retention Purge
              </button>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
