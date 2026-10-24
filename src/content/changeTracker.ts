const MUTATION_DEBOUNCE_MS = 400;
const URL_POLL_MS = 500;

export interface ChangeTrackerOptions {
  debounceMs?: number;
  urlPollMs?: number;
}

export type SignatureProvider = () => Promise<string>;

/**
 * Observe DOM + URL changes; invoke callback when signature changes.
 * Returns disposer. Each callback receives an AbortSignal aborted on the next change.
 */
export function startChangeTracker(
  doc: Document,
  getSignature: SignatureProvider,
  onSignatureChange: (signature: string, signal: AbortSignal) => void,
  options: ChangeTrackerOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? MUTATION_DEBOUNCE_MS;
  const urlPollMs = options.urlPollMs ?? URL_POLL_MS;

  let lastSignature: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let disposed = false;

  const win = doc.defaultView;

  const scheduleCheck = () => {
    if (disposed) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void checkSignature('mutation');
    }, debounceMs);
  };

  const checkSignature = async (_reason: 'mutation' | 'url' | 'init') => {
    if (disposed) return;
    try {
      const sig = await getSignature();
      if (sig === lastSignature) return;
      lastSignature = sig;
      abortController?.abort();
      abortController = new AbortController();
      onSignatureChange(sig, abortController.signal);
    } catch {
      // swallow — tracker must not throw
    }
  };

  const observer = new MutationObserver(() => scheduleCheck());
  const target = doc.body ?? doc.documentElement;
  if (target) {
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  let lastPath = '';
  try {
    lastPath = win?.location.pathname ?? '';
  } catch {
    lastPath = '';
  }

  const urlTimer = setInterval(() => {
    if (disposed || !win) return;
    let path = '';
    try {
      path = win.location.pathname;
    } catch {
      return;
    }
    if (path !== lastPath) {
      lastPath = path;
      void checkSignature('url');
    }
  }, urlPollMs);

  void checkSignature('init');

  return () => {
    disposed = true;
    observer.disconnect();
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    clearInterval(urlTimer);
    abortController?.abort();
  };
}
