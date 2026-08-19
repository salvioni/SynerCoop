export default function PageHeader({ subtitle, title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 2 }}>{subtitle}</div>
        <h1 className="page-h1">{title}</h1>
      </div>
      {action}
    </div>
  );
}
