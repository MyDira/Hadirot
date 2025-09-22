import type { Agency, Profile } from "@/config/supabase";

type Primitive = string | number | boolean | null;
export type QueryKey = readonly Primitive[];

type Subscriber<T> = (value: T | undefined) => void;

type QueryValue = unknown;

function hashQueryKey(key: QueryKey): string {
  return JSON.stringify(key);
}

class SimpleQueryClient {
  private cache = new Map<string, QueryValue>();
  private subscribers = new Map<string, Set<Subscriber<QueryValue>>>();

  getQueryData<T>(key: QueryKey): T | undefined {
    const hashed = hashQueryKey(key);
    return this.cache.get(hashed) as T | undefined;
  }

  setQueryData<T>(
    key: QueryKey,
    updater:
      | T
      | null
      | undefined
      | ((current: T | null | undefined) => T | null | undefined),
  ): T | null | undefined {
    const hashed = hashQueryKey(key);
    const current = this.cache.get(hashed) as T | null | undefined;
    const nextValue =
      typeof updater === "function"
        ? (updater as (current: T | null | undefined) => T | null | undefined)(
            current,
          )
        : updater;

    if (nextValue === undefined) {
      this.cache.delete(hashed);
    } else {
      this.cache.set(hashed, nextValue as QueryValue);
    }

    this.notify(hashed, nextValue as QueryValue | undefined);
    return nextValue;
  }

  invalidateQueries({ queryKey }: { queryKey: QueryKey }) {
    const hashed = hashQueryKey(queryKey);
    this.cache.delete(hashed);
    this.notify(hashed, undefined);
  }

  subscribe<T>(key: QueryKey, callback: Subscriber<T>): () => void {
    const hashed = hashQueryKey(key);
    const listener: Subscriber<QueryValue> = (value) => {
      callback(value as T | undefined);
    };

    const listeners = this.subscribers.get(hashed) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(hashed, listeners);

    return () => {
      const current = this.subscribers.get(hashed);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.subscribers.delete(hashed);
      }
    };
  }

  private notify(hashed: string, value: QueryValue | undefined) {
    const listeners = this.subscribers.get(hashed);
    if (!listeners) {
      return;
    }

    listeners.forEach((listener) => {
      try {
        listener(value);
      } catch (error) {
        console.error("[queryClient] subscriber error", error);
      }
    });
  }
}

export const queryClient = new SimpleQueryClient();

export const queryKeys = {
  profile: (userId: string): QueryKey => ["profile", userId],
  ownedAgency: (profileId: string): QueryKey => ["ownedAgency", profileId],
  agencyByOwner: (profileId: string): QueryKey => ["agencyByOwner", profileId],
  agencyBySlug: (slug: string): QueryKey => ["agencyBySlug", slug],
};

export function shareAgencyAcrossCaches(agency: Agency | null | undefined) {
  if (!agency) {
    return;
  }

  queryClient.setQueryData(queryKeys.ownedAgency(agency.owner_profile_id), agency);
  queryClient.setQueryData(queryKeys.agencyByOwner(agency.owner_profile_id), agency);
  if (agency.slug) {
    queryClient.setQueryData(queryKeys.agencyBySlug(agency.slug), agency);
  }
}

export function shareProfileAcrossCaches(
  profile: Profile | null | undefined,
) {
  if (!profile?.id) {
    return;
  }

  queryClient.setQueryData(queryKeys.profile(profile.id), profile);
}
