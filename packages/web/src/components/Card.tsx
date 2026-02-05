import React from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  active?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', hover = false, active = false, onClick }: Props) {
  const baseClasses = 'card';
  const hoverClasses = hover ? 'card-hover cursor-pointer' : '';
  const activeClasses = active ? 'card-active' : '';

  return (
    <div
      className={`${baseClasses} ${hoverClasses} ${activeClasses} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function CardHeader({ children, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        {children}
      </h3>
      {action && <div>{action}</div>}
    </div>
  );
}
