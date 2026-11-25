import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AiraAvatar, AiraAvatarState } from '../components/AiraAvatar';
import { useAiraVoice } from '../hooks/useAiraVoice';
import { apiRequest } from '../lib/api';

interface TurnItem {
  speaker: 'aira' | 'candidate';
  stage: string;
  content: string;
}

export function WebInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const voice = useAiraVoice();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<{
    id: string;
    candidateName: string;
    jobTitle: string;
    companyName: string;
    status: string;
    currentStage: string;
    language: string;
  } | null>(null);

  const [phase, setPhase] = useState<'consent' | 'active' | 'declined' | 'completed'>('consent');
  const [identityConfirmed, setIdentityConfirmed] = useState(true);
  const [recordingConsented, setRecordingConsented] = useState(true);
  const [language, setLanguage] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [textOnlyMode, setTextOnlyMode] = useState(false);

  const [airaState, setAiraState] = useState<AiraAvatarState>('Idle');
  const [turns, setTurns] = useState<TurnItem[]>([]);
  const [currentStage, setCurrentStage] = useState('introduction');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [evaluationSummary, setEvaluationSummary] = useState<{
    overallScore: number;
    recommendation: string;
    summary: string;
  } | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    apiRequest<{
      interview: {
        id: string;
        candidateName: string;
        jobTitle: string;
        companyName: string;
        status: string;
        currentStage: string;
        language: string;
      };
      transcript: TurnItem[];
    }>(`/api/web-interview/${token}`)
      .then((d) => {
        setContext(d.interview);
        setCurrentStage(d.interview.currentStage || 'introduction');
        if (d.transcript.length > 0) setTurns(d.transcript);
        if (d.interview.status === 'completed') setPhase('completed');
        else if (d.interview.status === 'in_progress') {
          setPhase('active');
          startedAtRef.current = Date.now();
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (phase !== 'active') return;
    const id = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const handleConsentSubmit = async (humanAlternative = false) => {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        proceed: boolean;
        openingText?: string;
        message?: string;
        stage?: string;
      }>(`/api/web-interview/${token}/consent`, {
        method: 'POST',
        body: JSON.stringify({
          identityConfirmed,
          recordingConsented: humanAlternative ? false : recordingConsented,
          humanAlternativeRequested: humanAlternative,
          language,
        }),
      });

      if (!res.proceed) {
        setPhase('declined');
        setError(res.message || 'Interview was not recorded.');
        return;
      }

      startedAtRef.current = Date.now();
      setPhase('active');
      if (res.openingText && turns.length === 0) {
        setTurns([{ speaker: 'aira', stage: 'introduction', content: res.openingText }]);
        if (!textOnlyMode) {
          setAiraState('Greeting');
          await voice.speak(res.openingText, { language });
          setAiraState('Listening');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const finishInterview = async () => {
    if (!token) return;
    voice.stopSpeaking();
    voice.stopListening();
    setAiraState('Processing');
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        evaluation: { overallScore: number; recommendation: string; summary: string };
      }>(`/api/web-interview/${token}/complete`, {
        method: 'POST',
        body: JSON.stringify({ durationSeconds: elapsedSeconds }),
      });
      setEvaluationSummary(res.evaluation);
      setPhase('completed');
      setAiraState('Smiling');
    } catch (err) {
      setError((err as Error).message);
      setAiraState('Error');
    } finally {
      setSubmitting(false);
    }
  };

  const sendCandidateResponse = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || !token || submitting) return;
    setSubmitting(true);
    setError(null);
    voice.stopSpeaking();
    setTurns((prev) => [...prev, { speaker: 'candidate', stage: currentStage, content: trimmed }]);
    setInputText('');
    setAiraState('Thinking');

    try {
      const res = await apiRequest<{
        reply: string;
        action: string;
        stage: string;
        latencyMs: number;
        ended: boolean;
      }>(`/api/web-interview/${token}/turn`, {
        method: 'POST',
        body: JSON.stringify({ message: trimmed, elapsedSeconds }),
      });

      setLastLatencyMs(res.latencyMs);
      setCurrentStage(res.stage);
      setTurns((prev) => [...prev, { speaker: 'aira', stage: res.stage, content: res.reply }]);

      if (!textOnlyMode) {
        setAiraState('Speaking');
        await voice.speak(res.reply, { language });
      }

      if (res.ended) {
        await finishInterview();
      } else {
        setAiraState('Listening');
      }
    } catch (err) {
      setError((err as Error).message);
      setAiraState('Error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#10090D] text-white flex items-center justify-center p-6">
        <p className="text-sm text-[#C8B9C0]">Loading Web Interview session...</p>
      </div>
    );
  }

  if (error && !context) {
    return (
      <div className="min-h-screen bg-[#10090D] text-white flex items-center justify-center p-6">
        <div className="glass-panel rounded-2xl p-8 max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold">Interview Session Unavailable</h1>
          <p className="text-sm text-[#EF6677]">{error}</p>
          <Link to="/" className="inline-block px-5 py-2.5 rounded-xl burgundy-cta text-xs font-semibold">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#10090D] text-white p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="glass-panel rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#C26A8A] font-semibold">
              {context?.companyName} · Level 1 Web Interview
            </p>
            <h1 className="text-lg font-bold text-white">
              {context?.candidateName} — {context?.jobTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs font-data">
            <span className="font-mono-num text-[#C8B9C0]">
              {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')} / 15:00
            </span>
            {lastLatencyMs != null && (
              <span className="font-mono-num text-[#8E7E87]">Latency {lastLatencyMs}ms</span>
            )}
            <button
              type="button"
              onClick={() => setTextOnlyMode(!textOnlyMode)}
              className="px-3 py-1.5 rounded-lg border border-white/15 text-[#E6D8DE] hover:bg-white/10 cursor-pointer"
            >
              {textOnlyMode ? 'Enable Voice' : 'Text-Only Mode'}
            </button>
          </div>
        </header>

        {/* Phase 1: Consent & Disclosure */}
        {phase === 'consent' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 flex justify-center">
              <AiraAvatar state="Greeting" size="lg" />
            </div>
            <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 text-[#39C98A] text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                Identity & Recording Consent Required
              </div>
              <p className="text-sm text-[#E6D8DE] leading-relaxed">
                Hello {context?.candidateName}! My name is Aira, the virtual AI recruitment assistant from{' '}
                {context?.companyName}. I&apos;m conducting this preliminary Level 1 interview for the{' '}
                <strong>{context?.jobTitle}</strong> role. With your permission, this interview will be transcribed and evaluated for our human recruitment team.
              </p>

              <div className="space-y-3 text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer text-[#E6D8DE]">
                  <input
                    type="checkbox"
                    checked={identityConfirmed}
                    onChange={(e) => setIdentityConfirmed(e.target.checked)}
                    className="accent-[#7B2948]"
                  />
                  I confirm I am {context?.candidateName}.
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-[#E6D8DE]">
                  <input
                    type="checkbox"
                    checked={recordingConsented}
                    onChange={(e) => setRecordingConsented(e.target.checked)}
                    className="accent-[#7B2948]"
                  />
                  I consent to this AI-assisted interview being transcribed and reviewed.
                </label>

                <div className="pt-1">
                  <span className="text-[#8E7E87] block mb-1.5">Preferred Language</span>
                  <div className="flex items-center gap-2">
                    {(['en-IN', 'hi-IN'] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          language === lang
                            ? 'bg-[#4B1528] border-[#C26A8A] text-white'
                            : 'bg-white/5 border-white/12 text-[#C8B9C0]'
                        }`}
                      >
                        {lang === 'en-IN' ? 'English (India)' : 'Hindi'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleConsentSubmit(false)}
                  className="px-5 py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white cursor-pointer"
                >
                  Start Interview
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleConsentSubmit(true)}
                  className="px-4 py-2.5 rounded-xl border border-white/15 text-xs font-semibold text-[#C8B9C0] hover:text-white cursor-pointer"
                >
                  Request Human Recruiter Instead
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: Declined / Human Alternative */}
        {phase === 'declined' && (
          <div className="glass-panel rounded-2xl p-8 text-center space-y-4">
            <h2 className="text-xl font-bold text-white">No Recording Taken</h2>
            <p className="text-sm text-[#C8B9C0] max-w-lg mx-auto">{error}</p>
            <Link to="/" className="inline-block px-5 py-2.5 rounded-xl border border-white/15 text-xs text-white">
              Return Home
            </Link>
          </div>
        )}

        {/* Phase 3: Active Interview */}
        {phase === 'active' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 flex flex-col items-center gap-4 glass-panel rounded-2xl p-5">
              <AiraAvatar
                state={voice.isSpeaking ? 'Speaking' : voice.isListening ? 'Listening' : airaState}
                mouthLevel={voice.mouthLevel}
                isAudioPlaying={voice.isSpeaking}
                size="lg"
              />
              <div className="w-full space-y-2 text-xs text-center">
                <p className="text-[#C8B9C0]">
                  Current Stage: <span className="text-white font-semibold capitalize">{currentStage.replace('_', ' ')}</span>
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => voice.setMuted(!voice.muted)}
                    className="px-3 py-1.5 rounded-lg border border-white/12 bg-white/5 text-[#C8B9C0] hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {voice.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    {voice.muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishInterview()}
                    className="px-3 py-1.5 rounded-lg border border-[#EF6677]/40 bg-[#EF6677]/15 text-[#FFB8C1] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    End & Evaluate
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 glass-panel rounded-2xl p-5 flex flex-col h-[500px]">
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {turns.map((t, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl px-4 py-3 text-sm ${
                      t.speaker === 'aira'
                        ? 'bg-white/6 text-[#F5ECEF] mr-8'
                        : 'bg-[#4B1528]/80 text-white ml-8'
                    }`}
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C8B9C0] mb-1">
                      {t.speaker === 'aira' ? `Aira · ${t.stage}` : context?.candidateName}
                    </span>
                    {t.content}
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>

              {voice.micError && <p className="text-xs text-[#E8B45C] pt-2">{voice.micError}</p>}
              {error && <p className="text-xs text-[#EF6677] pt-2">{error}</p>}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCandidateResponse(inputText);
                }}
                className="flex items-center gap-2.5 pt-4 border-t border-white/10 mt-3"
              >
                {!textOnlyMode && (
                  <button
                    type="button"
                    onClick={() =>
                      voice.isListening
                        ? voice.stopListening()
                        : voice.startListening((spoken) => void sendCandidateResponse(spoken), {
                            language,
                            onSilenceTimeout: () => {
                              setTurns((prev) => [
                                ...prev,
                                {
                                  speaker: 'aira',
                                  stage: currentStage,
                                  content: 'Are you still there? Feel free to speak or type your response whenever ready.',
                                },
                              ]);
                            },
                          })
                    }
                    aria-label="Toggle microphone"
                    className={`p-2.5 rounded-xl border border-white/15 cursor-pointer ${
                      voice.isListening ? 'bg-[#39C98A]/25 text-[#39C98A]' : 'bg-white/5 text-white'
                    }`}
                  >
                    {voice.isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>
                )}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Speak with mic or type your interview response..."
                  aria-label="Interview response"
                  className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
                />
                <button
                  type="submit"
                  disabled={submitting || !inputText.trim()}
                  className="px-4 py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Sending...' : 'Reply'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Phase 4: Completed */}
        {phase === 'completed' && (
          <div className="glass-panel rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-[#39C98A] mx-auto" />
            <h2 className="text-2xl font-bold text-white">Level 1 Interview Completed</h2>
            <p className="text-sm text-[#C8B9C0]">
              Thank you for your time. Our recruitment team will review your interview report and update you about the next steps.
            </p>
            {evaluationSummary && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-left text-xs space-y-1">
                <p className="font-bold text-white">
                  Evaluation Saved: {evaluationSummary.overallScore}/5.0 — {evaluationSummary.recommendation}
                </p>
                <p className="text-[#C8B9C0]">{evaluationSummary.summary}</p>
              </div>
            )}
            <div className="flex justify-center gap-3 pt-2">
              {context && (
                <Link
                  to={`/interviews/${context.id}`}
                  className="px-5 py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white"
                >
                  View Full Report (Recruiter)
                </Link>
              )}
              <Link
                to="/"
                className="px-5 py-2.5 rounded-xl border border-white/15 text-xs font-semibold text-[#C8B9C0]"
              >
                Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
