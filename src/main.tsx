import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StartupError from './components/StartupError';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

/**
 * App is imported lazily so that a failure while its modules evaluate — most often the
 * missing-VITE_SUPABASE_* check in lib/supabase.ts — surfaces as a readable screen
 * instead of a blank white page.
 */
void (async () => {
  try {
    const { default: App } = await import('./App');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    console.error(error);
    root.render(<StartupError error={error} />);
  }
})();
