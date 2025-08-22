'use client';

import { useState } from 'react';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import TimeRangeSelector from '@/components/TimeRangeSelector';
import { BlacklistManager } from '@/components/BlacklistManager';

export default function Home() {
  const [timeRange, setTimeRange] = useState('24h');

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="flex flex-col space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-gray-100 mb-3">
              Search for a Validator
            </h1>
            <p className="text-gray-400 text-base">
            </p>
            <div className="mt-4">
              <Link 
                href="/wallet-discovery"
                className="inline-flex items-center px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm text-gray-300 transition-colors"
              >
                Switch to Wallet Discovery →
              </Link>
            </div>
          </div>
          
          {/* Search and Time Range */}
          <div className="flex flex-col space-y-4">
            <SearchBar timeRange={timeRange} />
            <div className="flex justify-center">
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>
          </div>
          
          {/* Blacklist Manager */}
          <div className="flex justify-center">
            <BlacklistManager />
          </div>
        </div>
      </div>
    </div>
  );
}