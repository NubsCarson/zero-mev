'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, AlertCircle } from 'lucide-react';
import { searchValidators, triggerValidatorIngestion } from '@/lib/api';
import { checkVoteAccount, isValidSolanaAddress } from '@/lib/solana-utils';

interface SearchBarProps {
  timeRange?: string;
  placeholder?: string;
  onValidatorSelect?: (validatorId: string) => void;
}

export default function SearchBar({ timeRange = '24h', placeholder = "Enter validator address...", onValidatorSelect }: SearchBarProps) {
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
          // Continue with the normal flow
        } else {
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
                    onClick={async () => {
                      setQuery(voteAccountInfo.validatorIdentity!);
                      setError(null);
                      setIsLoading(true);
                      
                      try {
                        // Search for the validator directly
                        const validators = await searchValidators(voteAccountInfo.validatorIdentity!);
                        
                        if (validators.length === 0) {
                          // Trigger ingestion
                          await triggerValidatorIngestion(voteAccountInfo.validatorIdentity!, timeRange);
                        }
                        
                        // Navigate or callback
                        if (onValidatorSelect) {
                          onValidatorSelect(voteAccountInfo.validatorIdentity!);
                        } else {
                          router.push(`/validator/${encodeURIComponent(voteAccountInfo.validatorIdentity!)}?timeRange=${timeRange}`);
                        }
                      } catch (error) {
                        console.error('Failed to search for validator:', error);
                        setError('Failed to search for validator. Please try again.');
                      } finally {
                        setIsLoading(false);
                      }
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
      }
      
      const validators = await searchValidators(validatorId);
      
      if (validators.length === 0) {
        // Validator not found in database, trigger fresh data ingestion
        console.log(`Validator ${validatorId} not found, triggering ingestion...`);
        
        try {
          await triggerValidatorIngestion(validatorId, timeRange);
          
          // Use callback or redirect to validator page based on context
          if (onValidatorSelect) {
            onValidatorSelect(validatorId);
          } else {
            router.push(`/validator/${encodeURIComponent(validatorId)}?timeRange=${timeRange}`);
          }
        } catch (ingestError) {
          console.error('Failed to trigger ingestion:', ingestError);
          setError('Failed to fetch validator data. Please check the address and try again.');
        }
      } else {
        // Use callback or redirect based on context
        const foundValidatorId = validators[0].validator_identity;
        if (onValidatorSelect) {
          onValidatorSelect(foundValidatorId);
        } else {
          router.push(`/validator/${encodeURIComponent(foundValidatorId)}?timeRange=${timeRange}`);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      setError('Failed to search for validator. Please try again.');
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
              placeholder={placeholder}
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