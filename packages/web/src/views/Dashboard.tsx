export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-text-muted mt-2">Overview of your Olympus workspace</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Authentication</h3>
            <span className="text-2xl">🔐</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">OpenAI</span>
              <span className="text-green-400">Authenticated</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Anthropic</span>
              <span className="text-green-400">Authenticated</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Google AI</span>
              <span className="text-yellow-400">Not configured</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Activity</h3>
            <span className="text-2xl">📈</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="text-text-muted">Total runs: <span className="text-text font-medium">24</span></div>
            <div className="text-text-muted">Last run: <span className="text-text font-medium">2 hours ago</span></div>
            <div className="text-text-muted">Success rate: <span className="text-green-400 font-medium">92%</span></div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">System Status</h3>
            <span className="text-2xl">⚡</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-text-muted">WebSocket connected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-text-muted">CLI server running</span>
            </div>
            <div className="text-text-muted">Port: <span className="text-text font-medium">8080</span></div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded-lg transition-colors font-medium">
            New Run
          </button>
          <button className="bg-surface hover:bg-border text-text border border-border px-4 py-3 rounded-lg transition-colors font-medium">
            View History
          </button>
          <button className="bg-surface hover:bg-border text-text border border-border px-4 py-3 rounded-lg transition-colors font-medium">
            Configure Auth
          </button>
          <button className="bg-surface hover:bg-border text-text border border-border px-4 py-3 rounded-lg transition-colors font-medium">
            Documentation
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="font-semibold mb-4">Recent Runs</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-sm font-medium">
                  R{i}
                </div>
                <div>
                  <div className="font-medium">Analyze codebase structure</div>
                  <div className="text-sm text-text-muted">{i * 2} hours ago</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-400">Success</span>
                <button className="text-accent hover:text-accent-hover text-sm font-medium">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
