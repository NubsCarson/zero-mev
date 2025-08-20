'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { searchValidators, ValidatorSearchResult } from '@/lib/api';

interface SearchBarProps {
  onValidatorSelect: (validator: ValidatorSearchResult) => void;
  placeholder?: string;
}

export default function SearchBar({ onValidatorSelect, placeholder = "Search validators..." }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ValidatorSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (query.trim().length > 2) {
        setIsLoading(true);
        try {
          const validators = await searchValidators(query.trim());
          setResults(validators);
          setShowResults(true);
        } catch (error) {
          console.error('Search error:', error);
          setResults([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (validator: ValidatorSearchResult) => {
    setQuery(validator.validator_identity);
    setShowResults(false);
    onValidatorSelect(validator);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white shadow-sm"
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

      {showResults && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              Searching...
            </div>
          ) : results.length > 0 ? (
            results.map((validator) => (
              <button
                key={validator.validator_identity}
                onClick={() => handleSelect(validator)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-blue-50"
              >
                <div className="font-medium text-gray-900">
                  {validator.validator_identity}
                </div>
                <div className="text-sm text-gray-500">
                  {validator.blocks_produced.toLocaleString()} blocks produced
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              No validators found
            </div>
          )}
        </div>
      )}
    </div>
  );
}