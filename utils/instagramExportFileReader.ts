import JSZip from 'jszip';

export type ZipTextCandidates = {
  label: string;
  candidates: string[];
};

function normPath(p: string) {
  return (p || '').replace(/\\/g, '/');
}

function uniq<T>(arr: T[]): T[] {
  const s = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (s.has(x)) continue;
    s.add(x);
    out.push(x);
  }
  return out;
}

function isValidText(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

/**
 * Safely read a text file from a JSZip by trying multiple candidate paths.
 * - Returns null if missing or unreadable.
 * - Never throws: errors are caught and logged.
 */
export async function safeGetZipText(
  zip: JSZip,
  opts: ZipTextCandidates
): Promise<string | null> {
  try {
    if (!zip || typeof zip !== 'object') {
      console.warn(`[InstaInsight][ExportReader] ${opts.label}: invalid zip object`);
      return null;
    }

    const candidates = uniq(
      (opts.candidates || []).map((c) => normPath(c)).filter(Boolean)
    );

    if (!candidates.length) {
      console.warn(`[InstaInsight][ExportReader] ${opts.label}: no candidates provided`);
      return null;
    }

    // Fast path: exact match candidates.
    for (const p of candidates) {
      const file = zip.file(p);
      if (!file) continue;
      try {
        const content = await file.async('string');
        if (!isValidText(content)) return null;
        return content;
      } catch (e) {
        console.warn(`[InstaInsight][ExportReader] ${opts.label}: failed to read '${p}'`, e);
        return null;
      }
    }

    // Fuzzy path: match by basename.
    const allFiles = Object.keys(zip.files);
    for (const candidate of candidates) {
      const base = normPath(candidate).split('/').pop()!;
      if (!base) continue;
      const match = allFiles.find((f) => normPath(f).endsWith('/' + base) || normPath(f) === base);
      if (!match) continue;

      try {
        const file = zip.file(match);
        if (!file) continue;
        const content = await file.async('string');
        if (!isValidText(content)) return null;
        return content;
      } catch (e) {
        console.warn(`[InstaInsight][ExportReader] ${opts.label}: failed to read fuzzy '${match}'`, e);
        return null;
      }
    }

    return null;
  } catch (e) {
    console.warn(`[InstaInsight][ExportReader] ${opts.label}: unexpected error`, e);
    return null;
  }
}

/**
 * Safe JSON parse. Returns null on missing/invalid JSON.
 */
export function safeParseJson<T>(text: string | null, label: string): T | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed as T;
  } catch (e) {
    console.warn(`[InstaInsight][ExportReader] ${label}: invalid JSON`, e);
    return null;
  }
}

/**
 * Safe parse HTML (caller provides a parser fn).
 * Returns null if parsing throws; returns parser result otherwise.
 */
export function safeParseWith<T>(
  text: string | null,
  label: string,
  parser: (html: string) => T
): T | null {
  if (!text) return null;
  try {
    return parser(text);
  } catch (e) {
    console.warn(`[InstaInsight][ExportReader] ${label}: failed to parse`, e);
    return null;
  }
}

