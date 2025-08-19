'use client';

import { usePathname } from 'next/navigation';
import { Star, BarChart3, Users, Settings, Home } from 'lucide-react';

interface NavRoute {
  href: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  gradient?: string;
}

const routes: NavRoute[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: <Home className="w-4 h-4" />,
    description: 'Program tracking and analytics',
  },
  {
    href: '/explorer',
    label: 'Block Explorer',
    icon: <Star className="w-4 h-4" />,
    description: 'Real-time blockchain monitoring',
    gradient: 'from-primary to-accent',
  },
  {
    href: '/validators',
    label: 'Validator Stats',
    icon: <Users className="w-4 h-4" />,
    description: 'Validator program analysis',
    gradient: 'from-success to-emerald-600',
  },
  {
    href: '/blacklist',
    label: 'Manage Blacklist',
    icon: <Settings className="w-4 h-4" />,
    description: 'Configure blocked programs',
  },
];

interface HeaderNavProps {
  title?: string;
  subtitle?: string;
  showRoutes?: boolean;
  className?: string;
}

export default function HeaderNav({ 
  title = "Solana Program Tracker", 
  subtitle = "Real-time blockchain monitoring and program analysis",
  showRoutes = true,
  className = ""
}: HeaderNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className={`border-b border-border bg-card ${className}`}>
      <div className="container mx-auto px-6">
        {/* Compact Header with integrated navigation */}
        <div className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  {title}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {subtitle}
                </p>
              </div>
              
              {/* Integrated Navigation - Always visible */}
              {showRoutes && (
                <nav className="hidden md:flex">
                  <div className="flex items-center gap-1">
                    {routes.map((route) => {
                      const active = isActive(route.href);
                      return (
                        <a
                          key={route.href}
                          href={route.href}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
                            active
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                          title={route.description}
                        >
                          {route.icon}
                          <span className="hidden lg:inline">{route.label}</span>
                        </a>
                      );
                    })}
                  </div>
                </nav>
              )}
            </div>
            
            {/* Mobile Navigation Menu */}
            {showRoutes && (
              <div className="md:hidden">
                <nav className="flex items-center gap-1">
                  {routes.map((route) => {
                    const active = isActive(route.href);
                    return (
                      <a
                        key={route.href}
                        href={route.href}
                        className={`p-2 rounded-md transition-all duration-200 ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        title={route.label}
                      >
                        {route.icon}
                      </a>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}