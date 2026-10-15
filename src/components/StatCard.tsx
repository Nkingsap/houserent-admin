interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'primary' | 'success' | 'muted';
}

export default function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
