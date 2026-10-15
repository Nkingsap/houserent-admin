import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'primary';

export default function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
