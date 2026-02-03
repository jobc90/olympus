import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

type View = 'dashboard' | 'run' | 'history' | 'settings';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

export default function Layout({ currentView, onNavigate, children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
