import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Mic, MicOff, Send, Square, Volume2, VolumeX, X } from 'lucide-react';
import styles from './AiraHero.module.css';
import { AiraAvatar, AiraAvatarState } from './AiraAvatar';
import { useAiraVoice } from '../hooks/useAiraVoice';
import { apiRequest } from '../lib/api';

interface ChatMsg {
  speaker: 'aira' | 'user';
  text: string;
}

interface AiraHeroCompactProps {
  variant: 'compact';
  recruiterName: string;
  stats: {
    totalCandidates: number;
    activeJobs: number;
    shortlisted: number;
    interviewsScheduled: number;
    completedInterviews: number;
  };
  onQuickAction: (path: string) => void;
}

interface AiraHeroFullProps {
  variant?: 'full';
}

type AiraHeroProps = AiraHeroFullProps | AiraHeroCompactProps;

function getTimeGreeting(): string {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good Morning';
  if (hr < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function AiraHero(props: AiraHeroProps) {
  const voice = useAiraVoice();
  const [talkMode, setTalkMode] = useState(false);
  const [airaState, setAiraState] = useState<AiraAvatarState>('Idle');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [textInput, setTextInput] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hasHeadVideo, setHasHeadVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const parallaxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const logoRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const eyebrowRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const subRef = useRef<HTMLParagraphElement | null>(null);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const talkBtnRef = useRef<HTMLButtonElement | null>(null);

  // Detect optional aira-head.mp4 clip and preload as object URL for instant scrubbing
  useEffect(() => {
    if (props.variant === 'compact') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let revokedUrl: string | null = null;
    fetch('/assets/aira-head.mp4', { method: 'HEAD' })
      .then(async (r) => {
        if (!r.ok) return;
        const vidResp = await fetch('/assets/aira-head.mp4');
        if (!vidResp.ok) return;
        const blob = await vidResp.blob();
        if (blob.size < 1000) return;
        revokedUrl = URL.createObjectURL(blob);
        setHasHeadVideo(true);
        if (videoRef.current) {
          videoRef.current.src = revokedUrl;
        }
      })
      .catch(() => {
        setHasHeadVideo(false);
      });

    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [props.variant]);

  // Entrance Web Animations API timeline (~1.8s)
  useEffect(() => {
    if (props.variant === 'compact') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const anims: Animation[] = [];
    const run = (el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (!el || typeof el.animate !== 'function') return;
      anims.push(el.animate(keyframes, { fill: 'both', ...options }));
    };

    run(logoRef.current, [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 500,
      delay: 80,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
    run(navRef.current, [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 500,
      delay: 140,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
    run(
      eyebrowRef.current,
      [{ opacity: 0, letterSpacing: '0.9em' }, { opacity: 1, letterSpacing: '0.46em' }],
      { duration: 680, delay: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
    run(
      headlineRef.current,
      [
        { opacity: 0, filter: 'blur(14px)', transform: 'translateY(20px)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
      ],
      { duration: 760, delay: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
    run(subRef.current, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 520,
      delay: 720,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
    run(ctaRef.current, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 520,
      delay: 880,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
    run(
      talkBtnRef.current,
      [{ opacity: 0, transform: 'translateX(-50%) scale(0.75)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }],
      { duration: 540, delay: 1180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );

    return () => {
      anims.forEach((a) => a.cancel());
    };
  }, [props.variant]);

  // Pointer tracking: head scrubbing / fallback pointer parallax + 3.5s idle gaze drift
  useEffect(() => {
    if (props.variant === 'compact') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let pointerY = window.innerHeight / 2;
    let normX = 0.5;
    let currentT = 0.5;
    let lastMoveAt = Date.now();
    let rafId = 0;

    const onMove = (e: PointerEvent) => {
      pointerY = e.clientY;
      lastMoveAt = Date.now();
      const stage = stageRef.current;
      if (stage) {
        const rect = stage.getBoundingClientRect();
        const raw = (e.clientX - rect.left) / Math.max(1, rect.width);
        normX = Math.max(0, Math.min(1, (raw - 0.14) / 0.72));
      }
    };

    window.addEventListener('pointermove', onMove);

    const tick = () => {
      let target = normX;
      if (talkMode) {
        target = 0.5; // Ease back to centre frame in Talk Mode
      } else if (Date.now() - lastMoveAt > 3500) {
        target = 0.5 + 0.32 * Math.sin(Date.now() / 1350);
      }

      currentT += (target - currentT) * 0.14;

      const vid = videoRef.current;
      if (hasHeadVideo && vid && Number.isFinite(vid.duration) && vid.duration > 0 && !vid.seeking) {
        vid.currentTime = currentT * vid.duration;
        if (!videoReady) setVideoReady(true);
      }

      if (parallaxRef.current) {
        const shiftX = (currentT - 0.5) * 14;
        const shiftY = talkMode ? 0 : ((pointerY / Math.max(1, window.innerHeight)) - 0.5) * 8;
        parallaxRef.current.style.transform = `translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
    };
  }, [hasHeadVideo, props.variant, talkMode, videoReady]);

  const sendMessageToAira = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { speaker: 'user', text: trimmed }]);
    setTextInput('');
    setAiraState('Thinking');

    try {
      const mode = props.variant === 'compact' ? 'dashboard' : 'landing';
      const data = await apiRequest<{ reply: string }>('/api/aira/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed, mode }),
      });
      setMessages((prev) => [...prev, { speaker: 'aira', text: data.reply }]);
      setAiraState('Speaking');
      await voice.speak(data.reply);
      setAiraState('Smiling');
      window.setTimeout(() => setAiraState('Idle'), 900);
    } catch (err) {
      setAiraState('Error');
      setMessages((prev) => [
        ...prev,
        { speaker: 'aira', text: (err as Error).message || 'Unable to connect right now.' },
      ]);
    }
  };

  const toggleTalkMode = async () => {
    setPressed(true);
    window.setTimeout(() => setPressed(false), 320);

    if (talkMode) {
      voice.stopSpeaking();
      voice.stopListening();
      setTalkMode(false);
      setAiraState('Idle');
      return;
    }

    setTalkMode(true);
    setAiraState('Greeting');
    const greeting =
      "Hello! Welcome to HireFlow AI. I'm Aira, your virtual recruitment assistant. How are you doing today?";
    setMessages((prev) => (prev.length === 0 ? [{ speaker: 'aira', text: greeting }] : prev));
    await voice.speak(greeting);
    setAiraState('Listening');
    voice.startListening((spoken) => {
      void sendMessageToAira(spoken);
    });
  };

  // --- COMPACT DASHBOARD VARIANT ---
  if (props.variant === 'compact') {
    const greeting = getTimeGreeting();
    const pendingTotal = props.stats.totalCandidates - props.stats.shortlisted;

    return (
      <section className="glass-panel rounded-2xl p-6 border border-white/12">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-center">
          <div className="flex flex-col items-center">
            <AiraAvatar
              state={voice.isSpeaking ? 'Speaking' : voice.isListening ? 'Listening' : airaState}
              mouthLevel={voice.mouthLevel}
              isAudioPlaying={voice.isSpeaking}
              size="md"
            />
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#C8B9C0] font-semibold">
                  Aira Virtual Recruiter Assistant
                </p>
                <h2 className="text-2xl font-bold text-white mt-1">
                  {greeting}, {props.recruiterName}
                </h2>
                <p className="text-sm text-[#C8B9C0] mt-1 font-data">
                  {props.stats.totalCandidates} total candidates · {props.stats.shortlisted} shortlisted ·{' '}
                  {props.stats.interviewsScheduled} interviews scheduled · {pendingTotal} in review or applied
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleTalkMode()}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    talkMode ? 'bg-[#EF6677]/90 hover:bg-[#EF6677]' : 'burgundy-cta'
                  }`}
                >
                  {talkMode ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {talkMode ? 'Stop Voice' : 'Talk to Aira'}
                </button>
                <button
                  type="button"
                  onClick={() => voice.setMuted(!voice.muted)}
                  aria-label={voice.muted ? 'Unmute Aira voice' : 'Mute Aira voice'}
                  className="p-2.5 rounded-lg border border-white/12 bg-white/5 text-[#C8B9C0] hover:text-white cursor-pointer"
                >
                  {voice.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Review new candidates', path: '/candidates' },
                { label: 'Upload a JD', path: '/jobs' },
                { label: 'Start CV screening', path: '/screening' },
                { label: 'View interview results', path: '/interviews' },
                { label: 'Check pending interviews', path: '/level2' },
              ].map((qa) => (
                <button
                  key={qa.path}
                  type="button"
                  onClick={() => props.onQuickAction(qa.path)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/6 hover:bg-[#4B1528]/70 text-[#E6D8de] border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {qa.label}
                </button>
              ))}
            </div>

            {/* Compact Transcript & Text Chat */}
            <div className="rounded-xl bg-[#10090D]/70 border border-white/10 p-3 space-y-2.5">
              {messages.length > 0 && (
                <div className="max-h-28 overflow-y-auto space-y-1.5 text-xs pr-1">
                  {messages.slice(-4).map((m, idx) => (
                    <div
                      key={idx}
                      className={m.speaker === 'aira' ? 'text-[#E6D8DE]' : 'text-[#C26A8A] text-right'}
                    >
                      <span className="font-semibold">{m.speaker === 'aira' ? 'Aira: ' : 'You: '}</span>
                      {m.text}
                    </div>
                  ))}
                </div>
              )}

              {voice.micError && <p className="text-xs text-[#E8B45C]">{voice.micError}</p>}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessageToAira(textInput);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Ask Aira for pipeline counts, pending reviews, or next steps..."
                  aria-label="Ask Aira"
                  className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
                />
                <button
                  type="button"
                  onClick={() =>
                    voice.isListening
                      ? voice.stopListening()
                      : voice.startListening((t) => void sendMessageToAira(t))
                  }
                  aria-label="Toggle microphone input"
                  className={`p-2 rounded-lg border border-white/12 cursor-pointer ${
                    voice.isListening ? 'bg-[#39C98A]/20 text-[#39C98A]' : 'bg-white/5 text-[#C8B9C0] hover:text-white'
                  }`}
                >
                  {voice.isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <button
                  type="submit"
                  aria-label="Send message to Aira"
                  className="px-3.5 py-2 rounded-lg burgundy-cta text-white text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Ask
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // --- FULL-SCREEN LANDING HERO VARIANT ---
  const navLinks = [
    { label: 'Home', href: '#top' },
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'About', href: '#about' },
    { label: 'Contact', href: '#contact' },
  ];

  return (
    <section id="top" className={styles.heroViewport}>

      {/* Aspect-locked studio stage for plate + optional head video */}
      <div ref={stageRef} className={styles.stageFrame} aria-hidden="true">
        <div ref={parallaxRef} className={styles.parallaxRig}>
          <img
            src="/assets/aira-plate.jpg"
            alt="Aira — AI Recruitment Assistant in burgundy studio"
            className={styles.plateImg}
            draggable={false}
          />
        </div>

        {hasHeadVideo && (
          <div className={styles.headVideoWrap} style={{ opacity: videoReady ? 1 : 0 }}>
            <video ref={videoRef} muted playsInline preload="auto" className={styles.headVideo} />
          </div>
        )}
      </div>

      {/* Top-left Logo (pinned to viewport) */}
      <div ref={logoRef} className={styles.logoWrap}>
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-[#9B395F] to-[#2B0D1A] text-xs font-extrabold tracking-tight text-white shadow-md shrink-0"
        >
          HF
        </span>
        <span className={styles.logoText}>HireFlow AI</span>
      </div>

      {/* Top-right Desktop Navigation (pinned to viewport) */}
      <nav ref={navRef} aria-label="Primary navigation" className={styles.desktopNav}>
        {navLinks.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-sm font-medium text-[#C8B9C0] hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {item.label}
          </a>
        ))}
        <Link
          to="/login"
          className="text-sm font-semibold text-white hover:text-[#C26A8A] transition-colors whitespace-nowrap shrink-0"
        >
          Login
        </Link>
        <Link
          to="/signup"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white burgundy-cta whitespace-nowrap shrink-0"
        >
          Get Started
        </Link>
      </nav>

      {/* Mobile 3-bar Menu Button */}
      <button
        type="button"
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileNavOpen}
        className={`${styles.mobileMenuBtn} p-2.5 rounded-lg glass-panel text-white cursor-pointer`}
      >
        {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileNavOpen && (
        <div className="fixed inset-x-4 top-16 z-50 rounded-2xl glass-panel bg-[#1A1017]/95 p-5 flex flex-col gap-3 md:hidden">
          {navLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className="text-base font-medium text-[#E6D8DE] hover:text-white py-1"
            >
              {item.label}
            </a>
          ))}
          <div className="border-t border-white/10 pt-3 flex items-center gap-3">
            <Link
              to="/login"
              onClick={() => setMobileNavOpen(false)}
              className="flex-1 text-center py-2.5 rounded-lg border border-white/15 text-sm font-semibold text-white"
            >
              Login
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileNavOpen(false)}
              className="flex-1 text-center py-2.5 rounded-lg burgundy-cta text-sm font-semibold text-white"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}

      {/* Centered Copy Block */}
      <div className={styles.copyBlock}>
        <p ref={eyebrowRef} className={styles.eyebrow}>
          YOUR AI RECRUITER
        </p>
        <h1 ref={headlineRef} className={styles.headline}>
          AIRA
        </h1>
        <p ref={subRef} className={styles.subtitle}>
          Recruit Smarter. Hire Faster.
        </p>
        <div ref={ctaRef} className={styles.ctaRow}>
          <Link
            to="/signup"
            className="px-6 py-2.5 rounded-lg burgundy-cta text-sm font-semibold text-white whitespace-nowrap shrink-0"
          >
            Get Started
          </Link>
          <button
            type="button"
            onClick={() => void toggleTalkMode()}
            className="px-6 py-2.5 rounded-lg glass-panel text-sm font-semibold text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {talkMode ? 'Close Talk Mode' : 'Meet Aira'}
          </button>
        </div>
      </div>

      {/* Talk to Aira Primary Stage Button */}
      <button
        ref={talkBtnRef}
        type="button"
        aria-pressed={talkMode}
        aria-label={talkMode ? 'Close Talk to Aira' : 'Talk to Aira'}
        onClick={() => void toggleTalkMode()}
        className={`${styles.talkButton} ${talkMode ? styles.talkButtonActive : ''} ${
          pressed ? styles.talkButtonPressed : ''
        }`}
      >
        <Mic className="w-5 h-5" />
        <span className={styles.talkLabel}>
          Talk to{' '}
          <br />
          Aira
        </span>
      </button>

      {/* Glass Conversation Card rising near her open palm in Talk Mode */}
      {talkMode && (
        <div
          className={`${styles.talkCard} glass-panel rounded-2xl p-4 bg-[#1A1017]/90 shadow-2xl space-y-3`}
          role="dialog"
          aria-label="Conversation with Aira"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/aira-avatar-bust.png"
                alt="Aira"
                className="w-8 h-8 rounded-full object-cover object-top border border-white/20"
              />
              <div>
                <p className="text-xs font-bold text-white">Aira · {airaState}</p>
                <p className="text-[11px] text-[#C8B9C0]">
                  {voice.isListening ? 'Listening...' : voice.isSpeaking ? 'Speaking...' : 'Ready'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => voice.setMuted(!voice.muted)}
                aria-label={voice.muted ? 'Unmute Aira' : 'Mute Aira'}
                className="p-1.5 rounded-lg bg-white/5 text-[#C8B9C0] hover:text-white cursor-pointer"
              >
                {voice.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => void toggleTalkMode()}
                aria-label="Stop Talk Mode"
                className="p-1.5 rounded-lg bg-white/5 text-[#C8B9C0] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-2 text-xs">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 ${
                  m.speaker === 'aira'
                    ? 'bg-white/6 text-[#F5ECEF]'
                    : 'bg-[#4B1528]/80 text-white ml-6'
                }`}
              >
                <span className="font-semibold block text-[10px] uppercase tracking-wider text-[#C8B9C0] mb-0.5">
                  {m.speaker === 'aira' ? 'Aira' : 'You'}
                </span>
                {m.text}
              </div>
            ))}
          </div>

          {voice.micError && <p className="text-[11px] text-[#E8B45C]">{voice.micError}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessageToAira(textInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type or speak to Aira..."
              aria-label="Message Aira"
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
            />
            <button
              type="button"
              onClick={() =>
                voice.isListening
                  ? voice.stopListening()
                  : voice.startListening((spoken) => void sendMessageToAira(spoken))
              }
              aria-label="Speak into microphone"
              className={`p-2 rounded-lg border border-white/15 cursor-pointer ${
                voice.isListening ? 'bg-[#39C98A]/20 text-[#39C98A]' : 'bg-white/5 text-[#C8B9C0]'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              type="submit"
              aria-label="Send"
              className="p-2 rounded-lg burgundy-cta text-white cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Bottom Captions (pinned to viewport) */}
      <p className={styles.captionLeft}>AI Recruitment Automation</p>
      <p className={styles.captionRight}>HireFlow AI</p>
    </section>
  );
}
