import { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import RunView from './views/RunView';
import HistoryView from './views/HistoryView';
import SettingsView from './views/SettingsView';

type View = 'dashboard' | 'run' | 'history' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'run':
        return <RunView />;
      case 'history':
        return <HistoryView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentView={currentView} onNavigate={setCurrentView}>
      {renderView()}
    </Layout>
  );
}

export default App;
