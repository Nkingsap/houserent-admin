import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Tiny stale-while-revalidate cache shared across the whole admin panel.
 *
 * Every route mount used to re-fetch its data from the Edge Function, so
 * navigating back and forth re-loaded everything each time. Results now live in
 * a module-level store: a revisited page renders its previous data instantly and
 * only revalidates in the background once the entry has gone stale.
 *
 * Backed by useSyncExternalStore so reads are tear-free and a fetch completing
 * does not schedule a cascading render.
 */

const DEFAULT_TTL = 30_000; // keep results hot for 30 seconds

export interface QuerySnapshot<T> {
  data: T | undefined;
  /** True only while there is nothing cached to show yet. */
  loading: boolean;
  /** True while background-revalidating data that is already on screen. */
  refreshing: boolean;
  error: string | null;
}

interface Entry<T> {
  data: T | undefined;
  updatedAt: number;
  error: string | null;
  refreshing: boolean;
  promise: Promise<void> | null;
  snapshot: QuerySnapshot<T>;
  listeners: Set<() => void>;
}

const cache = new Map<string, Entry<unknown>>();

function entryFor<T>(key: string): Entry<T> {
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing) return existing;

  const created: Entry<T> = {
    data: undefined,
    updatedAt: 0,
    error: null,
    refreshing: false,
    promise: null,
    snapshot: { data: undefined, loading: true, refreshing: false, error: null },
    listeners: new Set(),
  };
  cache.set(key, created);
  return created;
}

/** Recomputes the immutable snapshot React reads and wakes subscribers. */
function publish<T>(entry: Entry<T>) {
  entry.snapshot = {
    data: entry.data,
    loading: entry.data === undefined && entry.error === null,
    refreshing: entry.refreshing,
    error: entry.error,
  };
  for (const listener of entry.listeners) listener();
}

/**
 * Marks every cached entry whose key starts with `prefix` as stale so it is
 * re-fetched next time it is read. Entries are kept (and keep their listeners),
 * so a mounted page updates in place instead of flashing a loading state.
 */
export function invalidateQuery(prefix: string) {
  for (const [key, entry] of cache) {
    if (key.startsWith(prefix)) entry.updatedAt = 0;
  }
}

function startRequest<T>(entry: Entry<T>, fetcher: () => Promise<T>): Promise<void> {
  entry.refreshing = entry.data !== undefined;
  publish(entry);

  const request = fetcher()
    .then((data) => {
      entry.data = data;
      entry.error = null;
      entry.updatedAt = Date.now();
    })
    .catch((e) => {
      entry.error = e instanceof Error ? e.message : 'Something went wrong';
    })
    .finally(() => {
      entry.refreshing = false;
      entry.promise = null;
      publish(entry);
    });

  entry.promise = request;
  return request;
}

/** Starts (or reuses) a request for `key` unless a fresh cached value already exists. */
function ensureLoaded<T>(
  key: string,
  fetcher: () => Promise<T>,
  force: boolean,
  ttl: number,
): Promise<void> {
  const entry = entryFor<T>(key);
  if (entry.promise) return entry.promise;

  const isFresh = !force && entry.data !== undefined && Date.now() - entry.updatedAt < ttl;
  if (isFresh) return Promise.resolve();

  return startRequest(entry, fetcher);
}

export interface QueryState<T> extends QuerySnapshot<T> {
  reload: () => Promise<void>;
}

export function useQuery<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL): QueryState<T> {
  // Keep the latest fetcher without making it a dependency of the effect below.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = entryFor<T>(key);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => entryFor<T>(key).snapshot, [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    void ensureLoaded(key, () => fetcherRef.current(), false, ttl);
  }, [key, ttl]);

  const reload = useCallback(
    () => ensureLoaded<T>(key, () => fetcherRef.current(), true, ttl),
    [key, ttl],
  );

  return { ...snapshot, reload };
}
