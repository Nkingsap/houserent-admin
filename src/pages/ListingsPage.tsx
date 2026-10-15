import { useEffect, useState } from 'react';
import Alert from '../components/Alert';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { deleteListing, listListings, setListingAvailable } from '../lib/adminApi';
import { formatDate, formatPrice } from '../lib/format';
import { LISTINGS_PREFIX, STATS_PREFIX, listingsKey } from '../lib/queryKeys';
import { invalidateQuery, useQuery } from '../lib/useQuery';
import type { ListingRow } from '../types';

export default function ListingsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListingRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Debounce so typing in the search box doesn't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Cached per search term, so returning to a view you already opened is instant.
  const { data, loading, refreshing, error: loadError, reload } = useQuery(listingsKey(debouncedSearch), () =>
    listListings({ search: debouncedSearch }),
  );

  const listings = data ?? [];
  const error = actionError ?? loadError;

  const toggleAvailable = async (listing: ListingRow) => {
    setBusyId(listing.id);
    setActionError(null);
    setNotice(null);
    try {
      await setListingAvailable(listing.id, !listing.available);
      setNotice(`"${listing.title}" marked ${!listing.available ? 'available' : 'unavailable'}.`);
      invalidateQuery(LISTINGS_PREFIX);
      invalidateQuery(STATS_PREFIX);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update listing');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setActionError(null);
    setNotice(null);
    try {
      await deleteListing(deleteTarget.id);
      setNotice(`Deleted "${deleteTarget.title}".`);
      setDeleteTarget(null);
      invalidateQuery(LISTINGS_PREFIX);
      invalidateQuery(STATS_PREFIX);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete listing');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Listings</h1>
          <p className="page-sub">Review published properties, take them offline, or remove them.</p>
        </div>
      </header>

      {error && <Alert kind="error" onDismiss={() => setActionError(null)}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

      <section className="panel">
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search title, city, address or owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="count">
            {loading ? 'Loading…' : refreshing ? 'Updating…' : `${listings.length} shown`}
          </span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Owner</th>
              <th>City</th>
              <th>Rent /mo</th>
              <th>Type</th>
              <th>Status</th>
              <th>Listed</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id}>
                <td className="strong">{l.title}</td>
                <td>{l.owner_name ?? '—'}</td>
                <td>{l.city}</td>
                <td>{formatPrice(l.price)}</td>
                <td className="muted">{l.type}</td>
                <td>
                  <Badge tone={l.available ? 'success' : 'warning'}>
                    {l.available ? 'available' : 'unavailable'}
                  </Badge>
                </td>
                <td>{formatDate(l.created_at)}</td>
                <td className="right">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => void toggleAvailable(l)}
                      disabled={busyId === l.id}
                    >
                      {l.available ? 'Take offline' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-xs"
                      onClick={() => setDeleteTarget(l)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && listings.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  No listings match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete listing"
          message={`Permanently delete "${deleteTarget.title}" in ${deleteTarget.city}? Anyone who saved it will lose it from their list. This cannot be undone.`}
          confirmLabel="Delete listing"
          busy={busyId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
