import { useState } from 'react';

export default function SettingsView() {
  const [apiKeys, setApiKeys] = useState({
    openai: '••••••••••••••••',
    anthropic: '••••••••••••••••',
    google: '',
  });

  const handleApiKeyChange = (provider: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-text-muted mt-2">Configure your Olympus workspace</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">API Authentication</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">OpenAI API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeys.openai}
                    onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="sk-..."
                  />
                  <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors">
                    Test
                  </button>
                </div>
                <div className="mt-1 text-sm text-green-400">✓ Connected</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Anthropic API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeys.anthropic}
                    onChange={(e) => handleApiKeyChange('anthropic', e.target.value)}
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="sk-ant-..."
                  />
                  <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors">
                    Test
                  </button>
                </div>
                <div className="mt-1 text-sm text-green-400">✓ Connected</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Google AI API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeys.google}
                    onChange={(e) => handleApiKeyChange('google', e.target.value)}
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="AIza..."
                  />
                  <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors">
                    Test
                  </button>
                </div>
                <div className="mt-1 text-sm text-yellow-400">Not configured</div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Model Preferences</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Default Claude Model</label>
                <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent">
                  <option>claude-3-5-sonnet-20241022</option>
                  <option>claude-3-opus-20240229</option>
                  <option>claude-3-haiku-20240307</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default GPT Model</label>
                <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent">
                  <option>gpt-4-turbo-preview</option>
                  <option>gpt-4</option>
                  <option>gpt-3.5-turbo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default Gemini Model</label>
                <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent">
                  <option>gemini-pro</option>
                  <option>gemini-pro-vision</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Execution Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-accent" defaultChecked />
                  <span>Auto-save run history</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-accent" defaultChecked />
                  <span>Enable streaming responses</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-accent" />
                  <span>Show token usage</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-accent" />
                  <span>Enable debug mode</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default Temperature</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue="0.7"
                  className="w-full accent-accent"
                />
                <div className="text-sm text-text-muted text-right mt-1">0.7</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Max Tokens</label>
                <input
                  type="number"
                  defaultValue="2048"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">System Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Version</span>
                <span className="font-medium">0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Node.js</span>
                <span className="font-medium">v20.11.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Platform</span>
                <span className="font-medium">darwin</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">WebSocket</span>
                <span className="text-green-400">Connected</span>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full bg-background hover:bg-border text-text border border-border px-4 py-2 rounded-lg text-sm transition-colors">
                Export Settings
              </button>
              <button className="w-full bg-background hover:bg-border text-text border border-border px-4 py-2 rounded-lg text-sm transition-colors">
                Import Settings
              </button>
              <button className="w-full bg-background hover:bg-border text-text border border-border px-4 py-2 rounded-lg text-sm transition-colors">
                Reset to Defaults
              </button>
              <button className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                Clear All Data
              </button>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Resources</h3>
            <div className="space-y-2">
              <a
                href="#"
                className="block text-accent hover:text-accent-hover text-sm transition-colors"
              >
                Documentation
              </a>
              <a
                href="#"
                className="block text-accent hover:text-accent-hover text-sm transition-colors"
              >
                GitHub Repository
              </a>
              <a
                href="#"
                className="block text-accent hover:text-accent-hover text-sm transition-colors"
              >
                Report Issue
              </a>
              <a
                href="#"
                className="block text-accent hover:text-accent-hover text-sm transition-colors"
              >
                Release Notes
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button className="bg-surface hover:bg-border text-text border border-border px-6 py-2 rounded-lg transition-colors">
          Cancel
        </button>
        <button className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}
