'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface BlacklistedWallet {
  wallet_address: string;
  blacklisted_at: string;
  reason: string;
}

// API functions for wallet blacklist
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getBlacklistedWallets(): Promise<BlacklistedWallet[]> {
  const response = await fetch(`${API_BASE_URL}/api/wallet-blacklist`);
  if (!response.ok) {
    throw new Error('Failed to fetch blacklisted wallets');
  }
  const data = await response.json();
  return data.data || [];
}

async function addWalletToBlacklist(walletAddress: string, reason: string = ''): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/wallet-blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wallet_address: walletAddress, reason }),
  });
  if (!response.ok) {
    throw new Error('Failed to add wallet to blacklist');
  }
}

async function removeWalletFromBlacklist(walletAddress: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/wallet-blacklist/${walletAddress}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to remove wallet from blacklist');
  }
}

async function clearWalletBlacklist(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/wallet-blacklist`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to clear wallet blacklist');
  }
}

interface WalletBlacklistContextType {
  blacklistedWallets: Set<string>;
  addToWalletBlacklist: (walletAddress: string, reason?: string) => Promise<void>;
  removeFromWalletBlacklist: (walletAddress: string) => Promise<void>;
  isWalletBlacklisted: (walletAddress: string) => boolean;
  clearWalletBlacklist: () => Promise<void>;
  getWalletBlacklistArray: () => string[];
  loading: boolean;
  error: string | null;
  refreshWalletBlacklist: () => Promise<void>;
  walletBlacklistDetails: BlacklistedWallet[];
}

const WalletBlacklistContext = createContext<WalletBlacklistContextType | undefined>(undefined);

export const useWalletBlacklist = () => {
  const context = useContext(WalletBlacklistContext);
  if (!context) {
    throw new Error('useWalletBlacklist must be used within a WalletBlacklistProvider');
  }
  return context;
};

export const WalletBlacklistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [blacklistedWallets, setBlacklistedWallets] = useState<Set<string>>(new Set());
  const [walletBlacklistDetails, setWalletBlacklistDetails] = useState<BlacklistedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load blacklist from server on mount
  const loadWalletBlacklist = async () => {
    try {
      setLoading(true);
      setError(null);
      const wallets = await getBlacklistedWallets();
      const walletAddresses = wallets.map(w => w.wallet_address);
      setBlacklistedWallets(new Set(walletAddresses));
      setWalletBlacklistDetails(wallets);
    } catch (err: any) {
      console.error('Failed to load wallet blacklist from server:', err);
      setError('Failed to load wallet blacklist');
      // Fallback to localStorage if server fails
      try {
        const stored = localStorage.getItem('blacklistedWallets');
        if (stored) {
          const parsed = JSON.parse(stored);
          setBlacklistedWallets(new Set(parsed));
        }
      } catch (localErr) {
        console.error('Failed to load from localStorage:', localErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWalletBlacklist();
  }, []);

  const addToWalletBlacklist = async (walletAddress: string, reason: string = '') => {
    try {
      await addWalletToBlacklist(walletAddress, reason);
      setBlacklistedWallets(prev => new Set([...prev, walletAddress]));
      
      // Update details
      const newWallet: BlacklistedWallet = {
        wallet_address: walletAddress,
        blacklisted_at: new Date().toISOString(),
        reason,
      };
      setWalletBlacklistDetails(prev => [newWallet, ...prev]);
      
      // Update localStorage as backup
      const newArray = [...blacklistedWallets, walletAddress];
      localStorage.setItem('blacklistedWallets', JSON.stringify(newArray));
    } catch (err: any) {
      console.error('Failed to add wallet to blacklist:', err);
      // Fallback to localStorage only
      setBlacklistedWallets(prev => new Set([...prev, walletAddress]));
      const newArray = [...blacklistedWallets, walletAddress];
      localStorage.setItem('blacklistedWallets', JSON.stringify(newArray));
    }
  };

  const removeFromWalletBlacklist = async (walletAddress: string) => {
    try {
      await removeWalletFromBlacklist(walletAddress);
      setBlacklistedWallets(prev => {
        const newSet = new Set(prev);
        newSet.delete(walletAddress);
        return newSet;
      });
      
      // Update details
      setWalletBlacklistDetails(prev => prev.filter(w => w.wallet_address !== walletAddress));
      
      // Update localStorage as backup
      const newArray = Array.from(blacklistedWallets).filter(w => w !== walletAddress);
      localStorage.setItem('blacklistedWallets', JSON.stringify(newArray));
    } catch (err: any) {
      console.error('Failed to remove wallet from blacklist:', err);
      // Fallback to localStorage only
      setBlacklistedWallets(prev => {
        const newSet = new Set(prev);
        newSet.delete(walletAddress);
        return newSet;
      });
      const newArray = Array.from(blacklistedWallets).filter(w => w !== walletAddress);
      localStorage.setItem('blacklistedWallets', JSON.stringify(newArray));
    }
  };

  const clearWalletBlacklist = async () => {
    try {
      await clearWalletBlacklist();
      setBlacklistedWallets(new Set());
      setWalletBlacklistDetails([]);
      localStorage.removeItem('blacklistedWallets');
    } catch (err: any) {
      console.error('Failed to clear wallet blacklist:', err);
      // Fallback to localStorage only
      setBlacklistedWallets(new Set());
      setWalletBlacklistDetails([]);
      localStorage.removeItem('blacklistedWallets');
    }
  };

  const refreshWalletBlacklist = async () => {
    await loadWalletBlacklist();
  };

  const value: WalletBlacklistContextType = {
    blacklistedWallets,
    addToWalletBlacklist: addToWalletBlacklist,
    removeFromWalletBlacklist,
    isWalletBlacklisted: (walletAddress: string) => blacklistedWallets.has(walletAddress),
    clearWalletBlacklist,
    getWalletBlacklistArray: () => Array.from(blacklistedWallets),
    loading,
    error,
    refreshWalletBlacklist,
    walletBlacklistDetails,
  };

  return (
    <WalletBlacklistContext.Provider value={value}>
      {children}
    </WalletBlacklistContext.Provider>
  );
};