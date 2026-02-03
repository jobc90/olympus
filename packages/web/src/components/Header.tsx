export default function Header() {
  return (
    <header className="h-16 bg-surface border-b border-border px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Welcome to Olympus</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-text-muted">Connected</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-medium">
          U
        </div>
      </div>
    </header>
  );
}
