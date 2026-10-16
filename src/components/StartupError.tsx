interface StartupErrorProps {
  error: unknown;
}

/**
 * Shown when the app's modules throw while loading. On a hosted build this almost
 * always means the Vite env vars were not present at build time, so point straight
 * at the fix instead of leaving the visitor on a blank white page.
 */
export default function StartupError({ error }: StartupErrorProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">R</span>
          <div>
            <h1>RentHub Admin</h1>
            <p>This build could not start</p>
          </div>
        </div>

        <div className="alert alert-error" role="alert">
          <span>{message}</span>
        </div>

        <p className="muted">
          Most likely this build was published without its Supabase credentials. Set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in the
          hosting project&rsquo;s environment variables and redeploy &mdash; Vite inlines
          these values at build time, so an existing deployment must be rebuilt.
        </p>
      </div>
    </div>
  );
}
