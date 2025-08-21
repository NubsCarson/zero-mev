'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { searchWallets, getTopWallets } from '@/lib/api';
import debounce from 'lodash/debounce';

interface WalletSearchBarProps {
  timeRange: string;
}

export default function WalletSearchBar({ timeRange }: WalletSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ wallet_address: string; transaction_count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [topWallets, setTopWallets] = useState<Array<{ wallet_address: string; transaction_count: number }>>([]);

  useEffect(() => {
    // Load top wallets when component mounts
    loadTopWallets();
  }, [timeRange]);

  const loadTopWallets = async () => {
    try {
      const wallets = await getTopWallets(timeRange, 10);
      setTopWallets(wallets);
    } catch (error) {
      console.error('Error loading top wallets:', error);
    }
  };

  const searchWalletsDebounced = useCallback(
    debounce(async (searchQuery: string) => {
      if (searchQuery.length < 3) {
        setResults(topWallets);
        return;
      }

      setLoading(true);
      try {
        const searchResults = await searchWallets(searchQuery);
        setResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    [topWallets]
  );

  useEffect(() => {
    if (query) {
      searchWalletsDebounced(query);
    } else {
      setResults(topWallets);
    }
  }, [query, searchWalletsDebounced, topWallets]);

  const handleSelect = (walletAddress: string) => {
    router.push(`/wallet/${walletAddress}?timeRange=${timeRange}`);
    setShowDropdown(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query) {
      // If there's an exact match or only one result, navigate to it
      if (results.length === 1) {
        handleSelect(results[0].wallet_address);
      } else if (query.length === 44) {
        // Likely a full wallet address
        handleSelect(query);
      }
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyPress={handleKeyPress}
          placeholder="Enter wallet address (e.g., 3Bpjjj...)"
          className="w-full px-4 py-3 pl-12 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-gray-100 placeholder-gray-400"
        />
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {showDropdown && (results.length > 0 || (!loading && query.length > 0)) && (
        <div className="absolute w-full mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10 max-h-96 overflow-y-auto">
          {results.length > 0 ? (
            <>
              {!query && (
                <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
                  Top Active Wallets ({timeRange})
                </div>
              )}
              {results.map((result) => (
                <button
                  key={result.wallet_address}
                  onClick={() => handleSelect(result.wallet_address)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Wallet className="h-4 w-4 text-gray-500" />
                      <div>
                        <div className="text-sm font-mono text-gray-200">
                          {result.wallet_address.slice(0, 4)}...{result.wallet_address.slice(-4)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {result.wallet_address}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">
                        {result.transaction_count.toLocaleString()} txns
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="px-4 py-3 text-sm text-gray-400">
              {query.length === 44 ? (
                <button
                  onClick={() => handleSelect(query)}
                  className="w-full text-left hover:text-gray-200 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4" />
                    <span>Search for wallet: {query.slice(0, 8)}...</span>
                  </div>
                </button>
              ) : (
                'No wallets found'
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}