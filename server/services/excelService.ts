import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { db, getStoragePaths, createId } from '../db/database.ts';

export const CANDIDATE_EXCEL_COLUMNS = [
  'ID',
  'NAME',
  'PHONE NO.',
  'EMAIL',
  'QUALIFICATIONS',
  'PASSING YEAR',
  'EXPERIENCE',
  'FEEDBACK',
  'STATUS',
] as const;

export interface CandidateRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  qualifications: string;
  passing_year: string;
  experience: string;
  feedback: string;
  status: string;
}

export async function syncCandidatesToExcel(): Promise<string> {
  const { excelPath } = getStoragePaths();
  const rows = db
    .prepare(
      `SELECT id, name, phone, email, qualifications, passing_year, experience, feedback, status
       FROM candidates ORDER BY created_at ASC`
    )
    .all() as CandidateRow[];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HireFlow AI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Candidates');
  sheet.columns = CANDIDATE_EXCEL_COLUMNS.map((col) => ({
    header: col,
    key: col,
    width: col === 'FEEDBACK' ? 42 : col === 'EMAIL' ? 28 : col === 'NAME' ? 24 : 18,
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4B1528' },
  };

  for (const r of rows) {
    sheet.addRow({
      ID: r.id,
      NAME: r.name,
      'PHONE NO.': r.phone,
      EMAIL: r.email,
      QUALIFICATIONS: r.qualifications,
      'PASSING YEAR': r.passing_year,
      EXPERIENCE: r.experience,
      FEEDBACK: r.feedback,
      STATUS: r.status,
    });
  }

  await workbook.xlsx.writeFile(excelPath);
  return excelPath;
}

export async function buildCandidatesWorkbookBuffer(): Promise<Buffer> {
  await syncCandidatesToExcel();
  const { excelPath } = getStoragePaths();
  return fs.readFileSync(excelPath);
}

export async function importCandidatesFromExcelBuffer(
  buffer: Buffer,
  companyId: string | null
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { imported: 0, skipped: 0, errors: ['Workbook contains no worksheets.'] };
  }

  const headerRow = sheet.getRow(1);
  const headers: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const label = String(cell.value || '').trim().toUpperCase();
    if (label) headers[label] = colNumber;
  });

  if (!headers['NAME'] && !headers['EMAIL']) {
    return {
      imported: 0,
      skipped: 0,
      errors: ['Missing required header columns (expected ID, NAME, PHONE NO., EMAIL, ...).'],
    };
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO candidates (
      id, company_id, name, phone, email, qualifications, passing_year,
      experience, experience_years, feedback, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'excel_import')
  `);

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const getVal = (key: string) => {
      const idx = headers[key];
      if (!idx) return '';
      const raw = row.getCell(idx).value;
      if (raw && typeof raw === 'object' && 'text' in raw) return String((raw as { text: string }).text).trim();
      return String(raw ?? '').trim();
    };

    const name = getVal('NAME');
    const email = getVal('EMAIL').toLowerCase();
    const phone = getVal('PHONE NO.');
    if (!name && !email) {
      skipped++;
      return;
    }

    if (email) {
      const existing = db.prepare('SELECT id FROM candidates WHERE lower(email) = ?').get(email);
      if (existing) {
        skipped++;
        return;
      }
    }

    const expStr = getVal('EXPERIENCE');
    const expMatch = expStr.match(/(\d+(?:\.\d+)?)/);
    const expYears = expMatch ? Number.parseFloat(expMatch[1]) : null;
    const id = getVal('ID') || createId('cand');

    try {
      insertStmt.run(
        id,
        companyId,
        name || 'Unnamed Candidate',
        phone,
        email,
        getVal('QUALIFICATIONS'),
        getVal('PASSING YEAR'),
        expStr,
        expYears,
        getVal('FEEDBACK'),
        getVal('STATUS') || 'Applied'
      );
      imported++;
    } catch (err) {
      errors.push(`Row ${rowNum}: ${(err as Error).message}`);
    }
  });

  await syncCandidatesToExcel();
  return { imported, skipped, errors };
}
