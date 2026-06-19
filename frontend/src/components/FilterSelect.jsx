import { useEffect, useRef, useState } from 'react';

export default function FilterSelect({ icon, placeholder, value, onChange, options, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o =>
    !search || o.label.toLowerCase().includes(search.toLowerCase())
  );

  function select(val) {
    onChange(val);
    setOpen(false);
  }

  return (
    <div className="filter-group fsel" ref={ref}>
      {icon && <div className="filter-icon" aria-hidden="true"><i className={`ti ${icon}`}></i></div>}
      <input
        ref={inputRef}
        className="filter-text"
        placeholder={open && searchable ? 'Buscar…' : (selected?.label || placeholder)}
        value={open && searchable ? search : (selected?.label || '')}
        onFocus={() => setOpen(true)}
        onChange={e => { if (!searchable) return; setOpen(true); setSearch(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        readOnly={!searchable}
        style={!searchable ? { cursor: 'pointer' } : {}}
        aria-expanded={open}
        aria-autocomplete={searchable ? 'list' : 'none'}
        autoComplete="off"
      />
      <button
        className="fsel-arrow"
        tabIndex={-1}
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : inputRef.current?.focus(); }}
        aria-hidden="true"
      >
        <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
      </button>
      {open && (
        <div className="fsel-drop" role="listbox">
          {filtered.length === 0 && (
            <div className="fsel-empty">Nenhum resultado</div>
          )}
          {filtered.map(o => (
            <div
              key={o.value}
              className={`fsel-opt${o.value === value ? ' sel' : ''}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={() => select(o.value)}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
