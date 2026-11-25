import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileCheck2, PhoneCall, ShieldCheck, Sparkles } from 'lucide-react';
import { AiraStorySection } from '../components/AiraStorySection';

export function LandingPage() {
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', message: '' });
  const [contactStatus, setContactStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.includes('@') || !contactForm.message.trim()) {
      setContactStatus({ ok: false, text: 'Please provide your name, a valid work email, and a short message.' });
      return;
    }
    setContactStatus({
      ok: true,
      text: `Thank you, ${contactForm.name.trim()}. Your inquiry for ${contactForm.company.trim() || 'your team'} has been logged.`,
    });
    setContactForm({ name: '', email: '', company: '', message: '' });
  };

  return (
    <div className="min-h-screen bg-[#10090D] text-white">
      {/* Single scroll-driven Aira landing experience */}
      <AiraStorySection />

      {/* Features Section */}
      <section id="features" className="max-w-[1200px] mx-auto px-6 py-24 space-y-12">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#C26A8A]">
            Platform Capabilities
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Automated Screening and Structured Level 1 Interviews
          </h2>
          <p className="text-base text-[#C8B9C0] leading-relaxed">
            Built around one explicit recruiter authorization: upload CVs against a Job Description and let Aira rank, phone, transcribe, and evaluate while human recruiters retain every final decision.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="glass-panel rounded-2xl p-6 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-3 text-[#C26A8A]">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">01. Explainable CV-to-JD Screening</span>
            </div>
            <h3 className="text-xl font-bold text-white">Weighted Match Ranking Without Black-Box Rejections</h3>
            <p className="text-sm text-[#C8B9C0] leading-relaxed">
              Parses PDF, DOCX, and TXT resumes with duplicate detection and synonym awareness. Evaluates required skills (40%), experience (25%), qualification (15%), preferred skills (10%), and certifications (10%), automatically renormalizing weights when optional fields are unspecified. Candidates below threshold become Needs Review — never auto-rejected.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-[#C26A8A]">
              <PhoneCall className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">02. Level 1 Voice Engine</span>
            </div>
            <h3 className="text-xl font-bold text-white">Natural Turn-Taking & Web Alternative</h3>
            <p className="text-sm text-[#C8B9C0] leading-relaxed">
              Conducts 9-stage structured interviews via Twilio/Exotel telephony or the browser Web Interview with explicit identity verification, recording consent, English/Hindi choice, barge-in handling, and time limits.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-[#C26A8A]">
              <FileCheck2 className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">03. Evidence-Grounded Rubrics</span>
            </div>
            <h3 className="text-xl font-bold text-white">Transcript-Verified Evaluations & PDFs</h3>
            <p className="text-sm text-[#C8B9C0] leading-relaxed">
              Scores technical knowledge, experience, problem-solving, and clarity on a 1–5 scale, running a validation pass so every rubric score cites actual recorded candidate words. Export clean PDF reports anytime.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-3 text-[#C26A8A]">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">04. Human-in-the-Loop Governance</span>
            </div>
            <h3 className="text-xl font-bold text-white">Calling Windows, Audit Trails & Candidate Excel Sync</h3>
            <p className="text-sm text-[#C8B9C0] leading-relaxed">
              Enforces 09:00–21:00 local calling windows, retry limits, valid pipeline stage transitions, encrypted secrets, and full Candidate.xlsx workbook synchronization across your hiring team.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-[#1A1017]/60 border-y border-white/10 py-24">
        <div className="max-w-[1200px] mx-auto px-6 space-y-12">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#C26A8A]">
              End-to-End Flow
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
              From Bulk CVs to Level 2 Scheduling in Six Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Select Job Description', desc: 'Pick an active JD or upload a PDF/DOCX/TXT JD for field verification.' },
              { step: '02', title: 'Upload Single or Bulk CVs', desc: 'Automatic parsing, readability checks, and email/phone/hash deduplication.' },
              { step: '03', title: 'Explainable Shortlisting', desc: 'Ranked match percentages with skill breakdowns and manual recruiter overrides.' },
              { step: '04', title: 'Launch Level 1 Campaign', desc: 'Aira calls or shares expiring Web Interview links with explicit consent checks.' },
              { step: '05', title: 'Review Rubric Reports', desc: 'Inspect transcripts, 1–5 evidence-anchored rubric scores, and PDF downloads.' },
              { step: '06', title: 'Approve & Schedule Level 2', desc: 'Send Level 2 interview invitations with real SMTP delivery confirmation.' },
            ].map((item) => (
              <div key={item.step} className="glass-panel rounded-2xl p-6 space-y-2.5">
                <span className="font-mono-num text-sm font-semibold text-[#C26A8A]">{item.step}.</span>
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="text-sm text-[#C8B9C0] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About & Responsible AI */}
      <section id="about" className="max-w-[1200px] mx-auto px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#C26A8A]">
            Responsible Recruitment AI
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Transparent by Design. Never Auto-Rejecting.
          </h2>
          <p className="text-sm text-[#C8B9C0] leading-relaxed">
            HireFlow AI strictly separates automation from final hiring authority. Protected attributes, candidate names, and voice accents are never scored. Every candidate has the right to decline recording or request a human recruiter alternative.
          </p>
          <ul className="space-y-2.5 pt-2 text-sm text-[#E6D8DE]">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#39C98A] shrink-0" />
              <span>Explicit AI disclosure and recording consent before every interview</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#39C98A] shrink-0" />
              <span>Accessible browser Web Interview & text-only fallback option</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#39C98A] shrink-0" />
              <span>Full audit trail and configurable resume retention purging</span>
            </li>
          </ul>
        </div>

        {/* Contact Form */}
        <div id="contact" className="glass-panel rounded-2xl p-7 space-y-5">
          <div>
            <h3 className="text-xl font-bold text-white">Contact Recruitment Engineering</h3>
            <p className="text-xs text-[#C8B9C0] mt-1">
              Questions about enterprise telephony, custom rubrics, or sandbox onboarding? Send us a note.
            </p>
          </div>
          <form onSubmit={handleContactSubmit} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Your name"
                aria-label="Your name"
                value={contactForm.name}
                onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
              />
              <input
                type="email"
                placeholder="Work email"
                aria-label="Work email"
                value={contactForm.email}
                onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
              />
            </div>
            <input
              type="text"
              placeholder="Company name"
              aria-label="Company name"
              value={contactForm.company}
              onChange={(e) => setContactForm((p) => ({ ...p, company: e.target.value }))}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
            />
            <textarea
              rows={3}
              placeholder="Tell us about your hiring volume or questions..."
              aria-label="Message"
              value={contactForm.message}
              onChange={(e) => setContactForm((p) => ({ ...p, message: e.target.value }))}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#8E7E87] focus:outline-none focus:border-[#C26A8A]"
            />
            {contactStatus && (
              <p className={`text-xs ${contactStatus.ok ? 'text-[#39C98A]' : 'text-[#EF6677]'}`}>
                {contactStatus.text}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl burgundy-cta text-sm font-semibold text-white cursor-pointer"
            >
              Send Inquiry
            </button>
          </form>
        </div>
      </section>

      {/* Final CTA & Quiet Footer */}
      <footer className="border-t border-white/10 bg-[#1A1017]/50 py-14">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <p className="text-lg font-bold text-white">Ready to launch your first screening campaign?</p>
            <p className="text-xs text-[#8E7E87]">
              HireFlow AI · Automated Recruitment Platform · AI Recruiter: Aira
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-5 py-2.5 rounded-xl border border-white/15 text-sm font-semibold text-white hover:bg-white/5"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="px-5 py-2.5 rounded-xl burgundy-cta text-sm font-semibold text-white inline-flex items-center gap-2"
            >
              Create Recruiter Account
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
