function initials(name) {
  return (name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export const AVATAR_COLORS = [
  { value: '#0D1E3B', label: 'Azul Escuro' },
  { value: '#1A4D2E', label: 'Verde' },
  { value: '#6B2D5B', label: 'Roxo' },
  { value: '#8B4513', label: 'Marrom' },
  { value: '#2F4F4F', label: 'Cinza Escuro' },
  { value: '#B8860B', label: 'Dourado' },
  { value: '#4A1A2E', label: 'Vinho' },
  { value: '#1B3A4B', label: 'Petróleo' },
];

export default function UserAvatar({ user, size = 36 }) {
  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (user?.avatar) {
    return <div style={{ ...base, background: `url(${user.avatar}) center/cover no-repeat` }} />;
  }

  return (
    <div style={{
      ...base,
      background: user?.avatar_color || 'var(--blue)', color: '#fff',
      fontSize: Math.round(size * 0.33), fontWeight: 600,
    }}>
      {initials(user?.name)}
    </div>
  );
}
