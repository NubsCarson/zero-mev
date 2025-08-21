'use client';

import { useState } from 'react';
import WalletSearchBar from '@/components/WalletSearchBar';
import TimeRangeSelector from '@/components/TimeRangeSelector';
import Link from 'next/link';

export default function WalletHome() {
  const [timeRange, setTimeRange] = useState('24h');

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="flex flex-col space-y-8">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-3xl font-semibold text-gray-100 mb-3">
                Wallet Transaction Tracker
              </h1>
              <p className="text-gray-400 text-base">
                Search for any Solana wallet to analyze its program usage and transaction history
              </p>
            </div>
            
            {/* Search and Time Range */}
            <div className="flex flex-col space-y-4">
              <WalletSearchBar timeRange={timeRange} />
              <div className="flex justify-center">
                <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
              </div>
            </div>
            
            {/* Navigation Link */}
            <div className="flex justify-center text-sm">
              <Link 
                href="/"
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                ← Back to Validator Search
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}