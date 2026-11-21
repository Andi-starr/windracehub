export function Flag({ code, label, size = 64 }: { code: string; label?: string; size?: number }) {
  const w = size, h = size * 0.7;
  const box = (children: React.ReactNode) => (
    <svg width={w} height={h} viewBox="0 0 100 70" className="rounded-sm shadow ring-1 ring-black/20" role="img" aria-label={label ?? code}>{children}</svg>
  );
  switch (code) {
    case "P": return box(<><rect width="100" height="70" fill="#1d4ed8" /><rect x="30" y="20" width="40" height="30" fill="#fff" /></>);
    case "I": return box(<><rect width="100" height="70" fill="#facc15" /><circle cx="50" cy="35" r="20" fill="#111" /></>);
    case "Z": return box(<><polygon points="0,0 100,0 50,35" fill="#facc15" /><polygon points="0,0 0,70 50,35" fill="#111" /><polygon points="100,0 100,70 50,35" fill="#dc2626" /><polygon points="0,70 100,70 50,35" fill="#1d4ed8" /></>);
    case "U": return box(<><rect width="100" height="70" fill="#fff" /><rect width="50" height="35" fill="#dc2626" /><rect x="50" y="35" width="50" height="35" fill="#dc2626" /></>);
    case "BLACK": return box(<rect width="100" height="70" fill="#111" />);
    case "ORANGE": return box(<rect width="100" height="70" fill="#f97316" />);
    case "N": return box(<>{Array.from({ length: 16 }, (_, i) => <rect key={i} x={(i % 4) * 25} y={Math.floor(i / 4) * 17.5} width="25" height="17.5" fill={(i + Math.floor(i / 4)) % 2 ? "#fff" : "#1d4ed8"} />)}</>);
    case "AP": return (
      <svg width={w} height={h} viewBox="0 0 100 70" role="img" aria-label="AP">
        <polygon points="0,0 100,35 0,70" fill="#fff" stroke="#999" />
        {[0, 2, 4].map((i) => <polygon key={i} points={`${i * 20},${i * 7} ${(i + 1) * 20},${(i + 1) * 7} ${(i + 1) * 20},${70 - (i + 1) * 7} ${i * 20},${70 - i * 7}`} fill="#dc2626" />)}
      </svg>
    );
    case "X1": return (
      <svg width={w} height={h} viewBox="0 0 100 70" role="img" aria-label="1st substitute">
        <polygon points="0,0 100,35 0,70" fill="#1d4ed8" /><polygon points="12,14 70,35 12,56" fill="#facc15" />
      </svg>
    );
    default: return box(<><rect width="100" height="70" fill="#fff" /><text x="50" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0b2f42">{(label ?? code).slice(0, 8)}</text></>);
  }
}
