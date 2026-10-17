import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import type { NativeAnalyticsReader, NativeAnalyticsView } from '@/api/nativeAnalyticsReader';

export function useNativeAnalytics(session: NativeFeatureSession, reader: NativeAnalyticsReader, now: () => Date) {
  const live = useRef({ session, reader, now }); live.current = { session, reader, now };
  const generation = useRef(0), focused = useRef(false), request = useRef<AbortController | null>(null);
  const [value, setValue] = useState<NativeAnalyticsView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'setup-required' | 'error'>('loading');
  const invalidate = useCallback(() => { generation.current++; request.current?.abort(); request.current = null; }, []);
  const load = useCallback(async () => {
    invalidate(); setValue(null);
    if (!focused.current || live.current.session.phase !== 'active') return;
    const ticket = generation.current, controller = new AbortController(); request.current = controller; setState('loading');
    try {
      const result = await live.current.session.run(async (token, authoritySignal) => {
        const abort = () => controller.abort();
        if (authoritySignal.aborted) controller.abort();
        authoritySignal.addEventListener('abort', abort, { once: true });
        try { return await live.current.reader(token, controller.signal, live.current.now()); }
        finally { authoritySignal.removeEventListener('abort', abort); }
      });
      if (ticket !== generation.current || !focused.current || controller.signal.aborted) return;
      if (result.kind === 'ready') { setValue(result.projection); setState('ready'); }
      else setState('setup-required');
    } catch { if (ticket === generation.current && focused.current && !controller.signal.aborted) { setValue(null); setState('error'); } }
    finally { if (ticket === generation.current) request.current = null; }
  }, [invalidate]);
  useFocusEffect(useCallback(() => {
    focused.current = true; void load();
    return () => { focused.current = false; invalidate(); setValue(null); };
  }, [load, invalidate, session.phase]));
  return { value, state, reload: load };
}
