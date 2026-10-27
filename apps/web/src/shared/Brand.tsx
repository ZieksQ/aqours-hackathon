export function Brand() {
  return (
    <span className="brand">
      <svg width="24" height="28" viewBox="0 0 24 28" aria-hidden="true">
        <path
          d="M12 2C9 7 3 13 3 18a9 9 0 0 0 18 0c0-5-6-11-9-16Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M7 18a5 5 0 0 0 5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <span className="brand-name">Aqours</span>
    </span>
  );
}
