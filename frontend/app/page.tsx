'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp, Users, Zap } from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import TimeRangeSelector from '@/components/TimeRangeSelector';
import ValidatorStats from '@/components/ValidatorStats';
import ProgramUsageChart from '@/components/ProgramUsageChart';
import { ValidatorSearchResult } from '@/lib/api';

export default function Home() {
  const [selectedValidator, setSelectedValidator] = useState<ValidatorSearchResult | null>(null);
  const [timeRange, setTimeRange] = useState('24h');

  const handleValidatorSelect = (validator: ValidatorSearchResult) => {
    setSelectedValidator(validator);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Solana Validator Analytics
                </h1>
                <p className="text-sm text-gray-600">
                  Real-time validator performance and program usage insights
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>Live Tracking</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4" />
                  <span>Real-time Data</span>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>Performance Insights</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="mb-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Search Validators
            </h2>
            <p className="text-gray-600">
              Enter a validator name or address to analyze its program usage patterns
            </p>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-4">
            <SearchBar onValidatorSelect={handleValidatorSelect} />
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
        </div>

        {/* Results Section */}
        {selectedValidator ? (
          <div className="space-y-8">
            {/* Validator Header */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedValidator.validator_identity}
                  </h3>
                  <p className="text-gray-600 mt-1">
                    {selectedValidator.blocks_produced.toLocaleString()} blocks produced
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Time Range</p>
                  <p className="text-lg font-semibold text-gray-900">{timeRange.toUpperCase()}</p>
                </div>
              </div>
            </div>

            {/* Validator Statistics */}
            <ValidatorStats 
              validatorId={selectedValidator.validator_identity} 
              timeRange={timeRange} 
            />

            {/* Program Usage Chart */}
            <ProgramUsageChart 
              validatorId={selectedValidator.validator_identity} 
              timeRange={timeRange} 
            />
          </div>
        ) : (
          /* Welcome Section */
          <div className="text-center py-16">
            <div className="max-w-2xl mx-auto">
              <div className="p-6 bg-white rounded-2xl shadow-lg">
                <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <BarChart3 className="h-10 w-10 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Discover Validator Insights
                </h3>
                
                <p className="text-gray-600 mb-8 leading-relaxed">
                  Get detailed analytics on Solana validator performance including program usage distribution, 
                  transaction throughput, and compute unit consumption. Search for any validator above to begin exploring.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">Performance Metrics</h4>
                    <p className="text-sm text-gray-600">
                      Track blocks produced, transactions processed, and compute units consumed
                    </p>
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                      <BarChart3 className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">Program Analysis</h4>
                    <p className="text-sm text-gray-600">
                      Visualize which programs are being used most frequently by validators
                    </p>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                      <Zap className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">Real-time Data</h4>
                    <p className="text-sm text-gray-600">
                      Access live blockchain data through Yellowstone gRPC streams
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600">
            <p>© 2024 Solana Validator Analytics. Powered by Yellowstone gRPC and ClickHouse.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
