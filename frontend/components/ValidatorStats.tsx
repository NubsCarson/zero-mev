'use client';

import { useEffect, useState } from 'react';
import { Activity, Boxes, Zap, TrendingUp } from 'lucide-react';
import { getValidatorStats, ValidatorStats } from '@/lib/api';
import { formatNumber, formatCU } from '@/lib/utils';

interface ValidatorStatsProps {
  validatorId: string;
  timeRange: string;
}

export default function ValidatorStatsComponent({ validatorId, timeRange }: ValidatorStatsProps) {
  const [stats, setStats] = useState<ValidatorStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!validatorId) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await getValidatorStats(validatorId, timeRange);
        setStats(data[0] || null);
      } catch (err) {
        setError('Failed to load validator stats');
        console.error('Error fetching validator stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [validatorId, timeRange]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-600">No data available for this validator in the selected time range.</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Blocks Produced',
      value: formatNumber(stats.blocks_produced),
      icon: Boxes,
      color: 'blue',
    },
    {
      title: 'Total Transactions',
      value: formatNumber(stats.total_transactions),
      icon: Activity,
      color: 'green',
    },
    {
      title: 'Compute Units',
      value: formatCU(stats.total_cu_consumed),
      icon: Zap,
      color: 'purple',
    },
    {
      title: 'Avg Tx/Block',
      value: formatNumber(Math.round(stats.avg_transactions_per_block || 0)),
      icon: TrendingUp,
      color: 'orange',
    },
  ];

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: 'text-blue-600 bg-blue-100',
      green: 'text-green-600 bg-green-100',
      purple: 'text-purple-600 bg-purple-100',
      orange: 'text-orange-600 bg-orange-100',
    };
    return colorMap[color] || colorMap.blue;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {statCards.map((card) => (
        <div key={card.title} className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{card.title}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            </div>
            <div className={`p-3 rounded-lg ${getColorClasses(card.color)}`}>
              <card.icon className="h-6 w-6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}