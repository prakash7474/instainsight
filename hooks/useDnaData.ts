// hooks/useDnaData.ts
import { useEffect, useMemo, useState } from 'react';
import { getJsonFromStorage } from '@/utils/storageService';
import type { DnaData } from '@/utils/dnaParser';

const STORAGE_KEY_DNA = 'instainsight_dna';

export function useDnaData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dnaData, setDnaData] = useState<DnaData | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const stored = await getJsonFromStorage<DnaData | null>(STORAGE_KEY_DNA, {
          defaultValue: null,
          validate: (v): v is DnaData =>
            v !== null &&
            typeof v === 'object' &&
            'timeline' in v &&
            'socialGraph' in v &&
            'curiosity' in v &&
            'identity' in v,
        });
        if (mounted) setDnaData(stored);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load DNA data.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const hasDnaData = useMemo(() => dnaData !== null, [dnaData]);

  return { loading, error, dnaData, hasDnaData };
}
