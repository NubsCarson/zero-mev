'use client';

import { cn } from '@/lib/utils';

interface TimeRangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const timeRanges = [
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
];

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex bg-gray-900 rounded-md p-1 border border-gray-700">
      {timeRanges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-sm transition-colors',
            value === range.value
              ? 'bg-gray-700 text-gray-100'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}