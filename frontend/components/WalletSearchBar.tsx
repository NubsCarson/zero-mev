'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, AlertCircle } from 'lucide-react';
import { checkVoteAccount, isValidSolanaAddress } from '@/lib/solana-utils';

interface WalletSearchBarProps {
  timeRange: string;
}

export default function WalletSearchBar({ timeRange }: WalletSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | React.ReactNode>(null);

  const handleSearch = async () => {
    if (query.trim().length === 0) {
      setError('Please enter a validator address');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const validatorId = query.trim();
      
      // First check if this is a valid Solana address
      if (!isValidSolanaAddress(validatorId)) {
        setError('Invalid Solana address format');
        setIsLoading(false);
        return;
      }
      
      // Check if this is a vote account
      const voteAccountInfo = await checkVoteAccount(validatorId);
      
      if (voteAccountInfo.isVoteAccount) {
        // If the vote account's validator identity is the same as the input, 
        // it means this is a validator that also has a vote account, so proceed normally
        if (voteAccountInfo.validatorIdentity === validatorId) {
          // This is a validator identity that happens to also be a vote account, proceed normally
          router.push(`/wallet-discovery/${encodeURIComponent(validatorId)}?timeRange=${timeRange}`);
          setIsLoading(false);
          return;
        }
        
        // This is a vote account, show error with validator identity
        const errorMsg = voteAccountInfo.validatorIdentity 
          ? `This is a vote account. The validator identity is: ${voteAccountInfo.validatorIdentity}`
          : 'This is a vote account, but the validator identity could not be determined.';
        
        setError(
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <div>{errorMsg}</div>
              {voteAccountInfo.validatorIdentity && (
                <button
                  onClick={() => {
                    setQuery(voteAccountInfo.validatorIdentity!);
                    setError(null);
                    // Navigate directly instead of triggering handleSearch to avoid recursion
                    router.push(`/wallet-discovery/${encodeURIComponent(voteAccountInfo.validatorIdentity!)}?timeRange=${timeRange}`);
                  }}
                  className="mt-2 text-blue-400 hover:text-blue-300 underline text-sm"
                >
                  Search for this validator instead
                </button>
              )}
            </div>
          </div>
        );
        setIsLoading(false);
        return;
      }
      
      // Navigate to wallet discovery page with validator query
      router.push(`/wallet-discovery/${encodeURIComponent(validatorId)}?timeRange=${timeRange}`);
    } catch (error) {
      console.error('Search error:', error);
      setError('Failed to search for wallets. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setError(null);
  };

  return (
    <div className="w-full max-w-6xl">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter validator address to find wallets..."
              className="w-full pl-10 pr-10 py-3 border border-gray-700 rounded-md focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-gray-100 bg-gray-900 placeholder-gray-400"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-6 py-3 bg-gray-800 text-gray-100 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {error && (
          <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-md p-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}