/**
 * Shared cache keys for the data-fetching hooks.
 *
 * Keeping these in one place means a page re-uses whatever another page already
 * fetched (e.g. the dashboard's user list and the Users page share a key), and
 * mutations know exactly which prefixes to invalidate.
 */

export const STATS_KEY = 'stats';

/** Users list for a given search term + role filter. `users::` is the unfiltered list. */
export const usersKey = (search = '', role?: string) => `users:${search}:${role ?? ''}`;

/** Listings list for a given search term. */
export const listingsKey = (search = '') => `listings:${search}`;

/** Prefixes passed to invalidateQuery() after a mutation. */
export const STATS_PREFIX = 'stats';
export const USERS_PREFIX = 'users:';
export const LISTINGS_PREFIX = 'listings:';
