'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, Settings } from 'lucide-react';
import { useWalletBlacklist } from '@/contexts/WalletBlacklistContext';

interface WalletBlacklistManagerProps {
  className?: string;
}

export const WalletBlacklistManager: React.FC<WalletBlacklistManagerProps> = ({ className = '' }) => {
  const { 
    getWalletBlacklistArray, 
    addToWalletBlacklist, 
    removeFromWalletBlacklist, 
    clearWalletBlacklist, 
    loading, 
    error: contextError,
    refreshWalletBlacklist 
  } = useWalletBlacklist();
  const [isOpen, setIsOpen] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletReason, setNewWalletReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const blacklistedWallets = getWalletBlacklistArray();

  const handleAddWallet = async () => {
    const walletAddress = newWalletAddress.trim();
    const reason = newWalletReason.trim();
    
    if (!walletAddress) {
      setError('Please enter a wallet address');
      return;
    }

    // Basic validation for Solana wallet address format (base58, ~44 characters)
    if (walletAddress.length < 32 || walletAddress.length > 44) {
      setError('Invalid wallet address format');
      return;
    }

    if (blacklistedWallets.includes(walletAddress)) {
      setError('Wallet already blacklisted');
      return;
    }

    setIsSubmitting(true);
    try {
      await addToWalletBlacklist(walletAddress, reason);
      setNewWalletAddress('');
      setNewWalletReason('');
      setError(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to add wallet to blacklist');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveWallet = async (walletAddress: string) => {
    try {
      await removeFromWalletBlacklist(walletAddress);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to remove wallet from blacklist');
    }
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear all blacklisted wallets? This will affect all users.')) {
      try {
        await clearWalletBlacklist();
        setError(null);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        setError(error.response?.data?.error || 'Failed to clear wallet blacklist');
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddWallet();
    }
  };

  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-md border border-gray-700 transition-colors"
      >
        <Settings className="h-4 w-4 text-gray-300" />
        <span className="text-sm text-gray-300">Wallet Blacklist</span>
        {blacklistedWallets.length > 0 && (
          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
            {blacklistedWallets.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-96 bg-gray-900 border border-gray-700 rounded-md shadow-lg z-50">
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Wallet Blacklist</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Hide specific wallets from all search results and comparisons (server-side, affects all users)
            </p>
            
            <div className="space-y-2">
              <input
                type="text"
                value={newWalletAddress}
                onChange={(e) => {
                  setNewWalletAddress(e.target.value);
                  setError(null);
                }}
                onKeyPress={handleKeyPress}
                placeholder="Enter wallet address to blacklist..."
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-sm text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-600 focus:border-gray-600 disabled:opacity-50"
              />
              <input
                type="text"
                value={newWalletReason}
                onChange={(e) => setNewWalletReason(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Reason for blacklisting (optional)..."
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-sm text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-600 focus:border-gray-600 disabled:opacity-50"
              />
              <button
                onClick={handleAddWallet}
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-sm transition-colors border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>{isSubmitting ? 'Adding...' : 'Add to Blacklist'}</span>
              </button>
            </div>
            
            {(error || contextError) && (
              <p className="text-red-400 text-sm mt-2">{error || contextError}</p>
            )}
            
            {loading && (
              <p className="text-gray-400 text-sm mt-2">Loading blacklist...</p>
            )}
          </div>

          <div className="p-4">
            {blacklistedWallets.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                No wallets blacklisted
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-300">
                    Blacklisted Wallets ({blacklistedWallets.length})
                  </span>
                  <button
                    onClick={handleClearAll}
                    className="text-red-400 hover:text-red-300 text-sm flex items-center space-x-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Clear All</span>
                  </button>
                </div>
                
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {blacklistedWallets.map((walletAddress) => (
                    <div
                      key={walletAddress}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded-sm border border-gray-700"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {formatWalletAddress(walletAddress)}
                        </div>
                        <div className="text-xs text-gray-400 font-mono truncate">
                          {walletAddress}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveWallet(walletAddress)}
                        className="ml-2 p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};