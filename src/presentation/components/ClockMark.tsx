/** El reloj ensangrentado de la portada. */
export function ClockMark() {
  return (
    <svg className="hero__clock" viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r="56" fill="#140c0e" stroke="#c9a35b" strokeWidth="3" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#5a4434" strokeWidth="1.5" strokeDasharray="2 6" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={60 + Math.sin(a) * 40}
            y1={60 - Math.cos(a) * 40}
            x2={60 + Math.sin(a) * 47}
            y2={60 - Math.cos(a) * 47}
            stroke="#e6c784"
            strokeWidth={i % 3 === 0 ? 3 : 1.5}
          />
        );
      })}
      <path d="M60 60 L60 24" stroke="#ecdfc4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M60 60 L80 70" stroke="#ecdfc4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M60 24 C56 34 54 40 56 46 C58 50 62 50 64 46 C66 40 64 34 60 24Z" fill="#d12a35" />
      <circle cx="60" cy="60" r="4.5" fill="#c9a35b" />
    </svg>
  );
}
