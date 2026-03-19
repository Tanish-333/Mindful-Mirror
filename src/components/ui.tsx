import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn(
      "bg-[var(--card)] text-[var(--card-foreground)] rounded-lg border border-[var(--border)] shadow-sm transition-all duration-300", 
      onClick && "cursor-pointer hover:shadow-md hover:border-[var(--accent)]",
      className
    )}
  >
    {children}
  </div>
);

export const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 shadow-sm",
    secondary: "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]",
    ghost: "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
    outline: "bg-transparent border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] hover:border-[var(--accent)]",
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs tracking-wide uppercase font-bold",
    md: "px-5 py-2.5 text-sm font-medium",
    lg: "px-8 py-3.5 text-base font-medium",
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

