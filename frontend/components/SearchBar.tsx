'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { searchValidators, triggerValidatorIngestion } from '@/lib/api';

interface SearchBarProps {
  timeRange?: string;
  placeholder?: string;
  onValidatorSelect?: (validatorId: string) => void;
}

export default function SearchBar({ timeRange = '24h', placeholder = "Enter validator address...", onValidatorSelect }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (query.trim().length === 0) {
      setError('Please enter a validator address');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const validatorId = query.trim();
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