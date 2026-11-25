import PDFDocument from 'pdfkit';

export function buildInterviewPdfBuffer(params: {
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  qualifications: string;
  experience: string;
  jobTitle: string;
  interviewDate: string;
  durationSeconds: number;
  status: string;
  overallScore: number;
  recommendation: string;
  summary: string;
  rubricScores: Array<{ criterion: string; score: number; evidenceQuote: string; rationale: string }>;
  strengths: string[];
  clarifications: string[];
  followUpQuestions: string[];
  recruiterNotes: string;
  transcript: Array<{ speaker: string; stage: string; content: string }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fillColor('#4B1528').fontSize(20).text('HireFlow AI — Level 1 Interview Report', { align: 'left' });
    doc.fillColor('#555555').fontSize(10).text(`Generated ${new Date().toISOString().slice(0, 10)} | AI Recruiter: Aira`);
    doc.moveDown(0.8);

    // Candidate & Job Details
    doc.fillColor('#111111').fontSize(13).text('Candidate & Role Details');
    doc.fontSize(10).fillColor('#333333');
    doc.text(`Candidate: ${params.candidateName} (${params.candidateEmail || 'No email'} · ${params.candidatePhone || 'No phone'})`);
    doc.text(`Qualifications: ${params.qualifications || 'Unspecified'} | Experience: ${params.experience || 'Unspecified'}`);
    doc.text(`Position: ${params.jobTitle}`);
    doc.text(`Interview Date: ${params.interviewDate} | Duration: ${Math.floor(params.durationSeconds / 60)}m ${params.durationSeconds % 60}s | Status: ${params.status}`);
    doc.moveDown(0.8);

    // Overall Assessment
    doc.fillColor('#4B1528').fontSize(13).text(`Overall Assessment: ${params.overallScore}/5.0 — ${params.recommendation}`);
    doc.fillColor('#222222').fontSize(10).text(params.summary);
    doc.moveDown(0.8);

    // Rubric Breakdown
    doc.fillColor('#111111').fontSize(13).text('Rubric Evaluation (Evidence-Grounded)');
    doc.moveDown(0.3);
    for (const item of params.rubricScores) {
      doc.fillColor('#4B1528').fontSize(10.5).text(`${item.criterion}: ${item.score}/5`);
      doc.fillColor('#333333').fontSize(9.5).text(`Evidence: "${item.evidenceQuote}"`);
      doc.fillColor('#555555').fontSize(9.5).text(`Rationale: ${item.rationale}`);
      doc.moveDown(0.4);
    }

    // Strengths & Follow-ups
    doc.fillColor('#111111').fontSize(12).text('Key Strengths');
    for (const s of params.strengths) {
      doc.fontSize(9.5).fillColor('#222222').text(`• ${s}`);
    }
    doc.moveDown(0.5);

    doc.fillColor('#111111').fontSize(12).text('Areas Needing Clarification');
    for (const c of params.clarifications) {
      doc.fontSize(9.5).fillColor('#222222').text(`• ${c}`);
    }
    doc.moveDown(0.5);

    doc.fillColor('#111111').fontSize(12).text('Recommended Level 2 Follow-Up Questions');
    for (const q of params.followUpQuestions) {
      doc.fontSize(9.5).fillColor('#222222').text(`• ${q}`);
    }
    if (params.recruiterNotes) {
      doc.moveDown(0.5);
      doc.fillColor('#111111').fontSize(12).text('Recruiter Notes');
      doc.fontSize(9.5).fillColor('#333333').text(params.recruiterNotes);
    }

    // Transcript Q&A
    if (params.transcript.length > 0) {
      doc.addPage();
      doc.fillColor('#4B1528').fontSize(13).text('Recorded Interview Transcript');
      doc.moveDown(0.4);
      for (const turn of params.transcript) {
        doc
          .fillColor(turn.speaker === 'aira' ? '#4B1528' : '#111111')
          .fontSize(9.5)
          .text(`${turn.speaker === 'aira' ? 'Aira' : params.candidateName} [${turn.stage}]: `, { continued: true })
          .fillColor('#333333')
          .text(turn.content);
        doc.moveDown(0.25);
      }
    }

    doc.end();
  });
}

export function buildAnalyticsPdfBuffer(params: {
  companyName: string;
  totals: Record<string, number>;
  statusBreakdown: Array<{ status: string; count: number }>;
  jobPerformance: Array<{ title: string; candidates: number; shortlisted: number; completed: number }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#4B1528').fontSize(20).text(`${params.companyName} — Recruitment Analytics Report`);
    doc.fillColor('#555555').fontSize(10).text(`Generated ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(1);

    doc.fillColor('#111111').fontSize(13).text('Summary Metrics');
    doc.fontSize(10).fillColor('#222222');
    for (const [k, v] of Object.entries(params.totals)) {
      doc.text(`• ${k}: ${v}`);
    }
    doc.moveDown(0.8);

    doc.fillColor('#111111').fontSize(13).text('Pipeline Distribution');
    for (const row of params.statusBreakdown) {
      doc.fontSize(10).fillColor('#222222').text(`• ${row.status}: ${row.count}`);
    }
    doc.moveDown(0.8);

    doc.fillColor('#111111').fontSize(13).text('Job-Wise Performance');
    for (const jp of params.jobPerformance) {
      doc
        .fontSize(10)
        .fillColor('#222222')
        .text(`• ${jp.title}: ${jp.candidates} applicants, ${jp.shortlisted} shortlisted, ${jp.completed} interviews completed`);
    }

    doc.end();
  });
}
