import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Alert from '../components/Alert';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { createUser, deleteUser, listUsers, setUserPassword, updateUser } from '../lib/adminApi';
import { formatDate, formatDateTime } from '../lib/format';
import { STATS_PREFIX, USERS_PREFIX, usersKey } from '../lib/queryKeys';
import { invalidateQuery, useQuery } from '../lib/useQuery';
import { ROLES } from '../types';
import type { AdminUserRow, Role } from '../types';

type RoleFilter = 'all' | Role;

interface UserForm {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
}

const emptyForm: UserForm = {
  id: null,
  name: '',
  email: '',
  phone: '',
  role: 'tenant',
  password: '',
};

const FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tenant', label: 'Tenants' },
  { key: 'owner', label: 'Owners' },
];

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Debounce so typing in the search box doesn't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const role = roleFilter === 'all' ? undefined : roleFilter;
  // Cached per search + role, so switching back to a view you already opened is instant.
  const { data, loading, refreshing, error: loadError, reload } = useQuery(
    usersKey(debouncedSearch, role),
    () => listUsers({ search: debouncedSearch, role }),
  );

  const users = data ?? [];
  const error = actionError ?? loadError;

  // One form for both create and edit; `id` distinguishes the two modes.
  const [form, setForm] = useState<UserForm | null>(null);
  const [passwordFor, setPasswordFor] = useState<AdminUserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successMessage);
      // Counts changed too, so drop the shared caches before re-reading users.
      invalidateQuery(USERS_PREFIX);
      invalidateQuery(STATS_PREFIX);
      await reload();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;

    const isEdit = Boolean(form.id);
    const ok = await runAction(
      () =>
        isEdit
          ? updateUser({
              id: form.id!,
              name: form.name.trim(),
              phone: form.phone.trim(),
              role: form.role,
            }).then(() => undefined)
          : createUser({
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
              role: form.role,
              password: form.password,
            }).then(() => undefined),
      isEdit ? 'User updated.' : 'User created.',
    );

    if (ok) {
      setForm(null);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordFor) return;
    if (newPassword.length < 8) {
      setActionError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setActionError('Passwords do not match');
      return;
    }

    const ok = await runAction(
      () => setUserPassword(passwordFor.id, newPassword).then(() => undefined),
      `Password updated for ${passwordFor.email ?? 'user'}.`,
    );

    if (ok) {
      setPasswordFor(null);
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const ok = await runAction(
      () => deleteUser(deleteTarget.id).then(() => undefined),
      `Deleted ${deleteTarget.email ?? 'user'}.`,
    );
    if (ok) setDeleteTarget(null);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Users</h1>
          <p className="page-sub">Manage every tenant and property owner on the platform.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setForm({ ...emptyForm })}
        >
          + New user
        </button>
      </header>

      {error && <Alert kind="error" onDismiss={() => setActionError(null)}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

      <section className="panel">
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="segmented" role="group" aria-label="Filter by role">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`segment${roleFilter === f.key ? ' segment-active' : ''}`}
                onClick={() => setRoleFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="count">
            {loading ? 'Loading…' : refreshing ? 'Updating…' : `${users.length} shown`}
          </span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Last sign-in</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="strong">
                  {u.name ?? '—'}
                  {u.hasProfile && !u.hasLegacyRow && (
                    <span className="tag" title="No legacy record in public.users">
                      auth-only
                    </span>
                  )}
                </td>
                <td>{u.email ?? '—'}</td>
                <td>
                  <Badge tone={u.role === 'owner' ? 'primary' : 'neutral'}>{u.role ?? 'unknown'}</Badge>
                </td>
                <td>{u.phone ?? '—'}</td>
                <td>{formatDate(u.created_at)}</td>
                <td className="muted">{formatDateTime(u.lastSignInAt)}</td>
                <td className="right">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        setForm({
                          id: u.id,
                          name: u.name ?? '',
                          email: u.email ?? '',
                          phone: u.phone ?? '',
                          role: (u.role === 'owner' ? 'owner' : 'tenant') as Role,
                          password: '',
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordFor(u);
                      }}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-xs"
                      onClick={() => setDeleteTarget(u)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No users match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {form && (
        <Modal
          title={form.id ? 'Edit user' : 'Create user'}
          onClose={() => !busy && setForm(null)}
          busy={busy}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : form.id ? 'Save changes' : 'Create user'}
              </button>
            </>
          }
        >
          <form id="user-form" className="form" onSubmit={submitForm}>
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={Boolean(form.id)}
                required
              />
              {form.id && <small className="hint">Email changes are not supported here.</small>}
            </label>

            <label className="field">
              <span>Phone</span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Optional"
              />
            </label>

            <label className="field">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r === 'owner' ? 'Owner — lists properties' : 'Tenant — looking to rent'}
                  </option>
                ))}
              </select>
            </label>

            {!form.id && (
              <label className="field">
                <span>Temporary password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                />
                <small className="hint">
                  The account is created pre-confirmed, so the user can sign in straight away.
                </small>
              </label>
            )}
          </form>
        </Modal>
      )}

      {passwordFor && (
        <Modal
          title={`Reset password — ${passwordFor.email ?? 'user'}`}
          onClose={() => !busy && setPasswordFor(null)}
          busy={busy}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPasswordFor(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" form="password-form" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Set password'}
              </button>
            </>
          }
        >
          <form id="password-form" className="form" onSubmit={submitPassword}>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <small className="hint">
              This updates the user's Supabase Auth credential and the app's legacy login record.
            </small>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete user"
          message={`Permanently delete ${deleteTarget.name ?? 'this user'} (${
            deleteTarget.email ?? 'no email'
          })? Their profile, login and saved data will be removed. This cannot be undone.`}
          confirmLabel="Delete user"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
