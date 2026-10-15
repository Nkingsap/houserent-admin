import Alert from '../components/Alert';
import Badge from '../components/Badge';
import StatCard from '../components/StatCard';
import { getStats, listUsers } from '../lib/adminApi';
import { formatDate, formatDateTime } from '../lib/format';
import { STATS_KEY, usersKey } from '../lib/queryKeys';
import { useQuery } from '../lib/useQuery';

export default function DashboardPage() {
  const stats = useQuery(STATS_KEY, getStats);
  const users = useQuery(usersKey(), () => listUsers());

  const recent = (users.data ?? []).slice(0, 6);
  const error = stats.error ?? users.error;
  // Only show the loading placeholder when there is genuinely nothing to render yet.
  const initialLoading = (!stats.data && stats.loading) || (!users.data && users.loading);
  const refreshing = stats.refreshing || users.refreshing;

  const refresh = () => Promise.all([stats.reload(), users.reload()]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">Overview of everyone and everything on RentHub.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <Alert kind="error">{error}</Alert>}

      <section className="stat-grid">
        <StatCard label="Tenants" value={stats.data?.tenants ?? '—'} tone="primary" />
        <StatCard label="Owners" value={stats.data?.owners ?? '—'} tone="success" />
        <StatCard
          label="Listings"
          value={stats.data?.listings ?? '—'}
          hint={`${stats.data?.availableListings ?? 0} available`}
        />
        <StatCard label="Saved homes" value={stats.data?.favorites ?? '—'} tone="muted" />
        <StatCard label="New signups" value={stats.data?.newSignups ?? '—'} hint="last 7 days" />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Newest accounts</h2>
        </header>
        {initialLoading ? (
          <p className="empty">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="empty">No accounts yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((u) => (
                <tr key={u.id}>
                  <td className="strong">{u.name ?? '—'}</td>
                  <td>{u.email ?? '—'}</td>
                  <td>
                    <Badge tone={u.role === 'owner' ? 'primary' : 'neutral'}>{u.role ?? 'unknown'}</Badge>
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td className="muted">{formatDateTime(u.lastSignInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
