import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const formatNumber = (num: number): string => {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
};

export const formatPercentage = (num: number): string => {
  return `${num.toFixed(2)}%`;
};

export const formatCU = (cu: number): string => {
  if (cu >= 1_000_000) {
    return (cu / 1_000_000).toFixed(1) + 'M CU';
  }
  if (cu >= 1_000) {
    return (cu / 1_000).toFixed(1) + 'K CU';
  }
  return cu.toLocaleString() + ' CU';
};

export const truncateAddress = (address: string, length = 8): string => {
  if (address.length <= length * 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
};

export const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    system: 'bg-blue-100 text-blue-800',
    token: 'bg-green-100 text-green-800',
    dex: 'bg-purple-100 text-purple-800',
    lending: 'bg-orange-100 text-orange-800',
    nft: 'bg-pink-100 text-pink-800',
    defi: 'bg-indigo-100 text-indigo-800',
    gaming: 'bg-yellow-100 text-yellow-800',
    other: 'bg-gray-100 text-gray-800',
  };
  
  return colors[category.toLowerCase()] || colors.other;
};