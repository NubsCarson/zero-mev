'use client';

import { useState } from 'react';
import SearchBar from '@/components/SearchBar';
import TimeRangeSelector from '@/components/TimeRangeSelector';

export default function Home() {
  const [timeRange, setTimeRange] = useState('24h');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="flex flex-col space-y-4">
          <SearchBar timeRange={timeRange} />
          <div className="flex justify-center">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
        </div>
      </div>
    </div>
  );
}
