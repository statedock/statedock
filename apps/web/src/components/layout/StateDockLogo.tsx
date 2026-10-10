export function StateDockLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="StateDock"
      className={`object-contain shrink-0 select-none pointer-events-none ${className}`}
    />
  );
}
