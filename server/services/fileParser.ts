import crypto from 'node:crypto';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { SKILL_SYNONYMS } from '../../src/lib/recruitmentRules.ts';

export interface ParsedResumeData {
  name: string;
  email: string;
  phone: string;
  qualifications: string;
  passingYear: string;
  experience: string;
  experienceYears: number | null;
  skills: string[];
  certifications: string[];
  projects: string[];
  rawText: string;
  fileHash: string;
}

export interface ParsedJobData {
  title: string;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minExperienceYears: number | null;
  qualification: string;
  certifications: string[];
  rawText: string;
}

const KNOWN_SKILLS = [
  'Python',
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'Next.js',
  'FastAPI',
  'Django',
  'Flask',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'SQL',
  'Docker',
  'Kubernetes',
  'AWS',
  'GCP',
  'Azure',
  'TailwindCSS',
  'REST API',
  'GraphQL',
  'Git',
  'CI/CD',
  'Machine Learning',
  'AI',
  'Java',
  'Spring Boot',
  'C++',
  'C#',
  'HTML',
  'CSS',
  'Redis',
  'Kafka',
  'Pandas',
  'PyTorch',
  'TensorFlow',
];

export async function extractTextFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const lower = filename.toLowerCase();
  let text = '';

  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      text = parsed.text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
  } else if (lower.endsWith('.txt') || lower.endsWith('.md') || mimeType.startsWith('text/')) {
    text = buffer.toString('utf8');
  } else {
    throw new Error(`Unsupported file format for "${filename}". Supported formats: PDF, DOCX, TXT.`);
  }

  const cleaned = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (cleaned.length < 15) {
    throw new Error(`File "${filename}" appears empty or unreadable (scanned/image-only PDF without text layer).`);
  }
  return cleaned;
}

function extractSkillsFromText(rawText: string): string[] {
  const found: string[] = [];
  const lower = rawText.toLowerCase();
  const seen = new Set<string>();

  for (const canonicalLabel of KNOWN_SKILLS) {
    const key = canonicalLabel.toLowerCase().replace(/[\s.-]/g, '');
    const aliases = [canonicalLabel.toLowerCase(), ...(SKILL_SYNONYMS[key] || [])];
    const matched = aliases.some((alias) => {
      const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(lower);
    });
    if (matched && !seen.has(canonicalLabel)) {
      seen.add(canonicalLabel);
      found.push(canonicalLabel);
    }
  }
  return found;
}

export async function parseResumeFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedResumeData> {
  const rawText = await extractTextFromBuffer(buffer, filename, mimeType);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/);

  // Extract first plausible human name line (not containing email/phone/resume header)
  let name = '';
  for (const line of lines.slice(0, 6)) {
    if (
      line.length >= 3 &&
      line.length <= 48 &&
      !/resume|curriculum|vitae|@|http|\d{4}/i.test(line) &&
      /^[A-Za-z][A-Za-z\s.'-]{2,}$/.test(line)
    ) {
      name = line;
      break;
    }
  }
  if (!name) {
    name = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  }

  const expMatch = rawText.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)?/i);
  const experienceYears = expMatch ? Number.parseFloat(expMatch[1]) : null;
  const experience = experienceYears !== null ? `${experienceYears} years` : '';

  const qualMatch = rawText.match(
    /(Ph\.?D|M\.?Tech|M\.?Sc|MCA|MBA|M\.?E\.?|B\.?Tech|B\.?E\.?|B\.?Sc|BCA|Bachelor[^,\n]{0,40}|Master[^,\n]{0,40})/i
  );
  const qualifications = qualMatch ? qualMatch[0].trim() : '';

  const yearMatch = rawText.match(/(?:graduat\w+|passing|class of|batch|20\d{2}|19\d{2})[^\n]{0,20}?((?:19|20)\d{2})/i);
  const passingYear = yearMatch ? yearMatch[1] : '';

  const certLines = lines.filter((l) => /certif|aws certified|azure|coursera|udemy|google cloud/i.test(l)).slice(0, 4);
  const projLines = lines.filter((l) => /project|built|developed|architected/i.test(l)).slice(0, 4);

  return {
    name,
    email: emailMatch ? emailMatch[0].toLowerCase() : '',
    phone: phoneMatch ? phoneMatch[0].trim() : '',
    qualifications,
    passingYear,
    experience,
    experienceYears,
    skills: extractSkillsFromText(rawText),
    certifications: certLines,
    projects: projLines,
    rawText,
    fileHash,
  };
}

export async function parseJobDescriptionFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedJobData> {
  const rawText = await extractTextFromBuffer(buffer, filename, mimeType);
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine =
    lines.find((l) => /title|role|position/i.test(l))?.replace(/^(job\s*)?(title|role|position)\s*[:-]\s*/i, '') ||
    lines[0]?.slice(0, 80) ||
    filename.replace(/\.[^.]+$/, '');

  const expMatch = rawText.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
  const qualMatch = rawText.match(/(Ph\.?D|M\.?Tech|Master|B\.?Tech|B\.?E\.?|Bachelor|B\.?Sc|BCA)/i);

  const allSkills = extractSkillsFromText(rawText);
  const splitIdx = Math.max(1, Math.ceil(allSkills.length * 0.7));

  return {
    title: titleLine.trim(),
    description: rawText.slice(0, 3000),
    requiredSkills: allSkills.slice(0, splitIdx),
    preferredSkills: allSkills.slice(splitIdx),
    minExperienceYears: expMatch ? Number.parseFloat(expMatch[1]) : null,
    qualification: qualMatch ? qualMatch[0] : '',
    certifications: [],
    rawText,
  };
}
