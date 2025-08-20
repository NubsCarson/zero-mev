'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { getValidatorProgramUsage, ProgramUsage } from '@/lib/api';
import { formatNumber, formatPercentage, getCategoryColor, truncateAddress } from '@/lib/utils';

interface ProgramUsageChartProps {
  validatorId: string;
  timeRange: string;
}

const COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
  '#6366F1', '#14B8A6', '#F97316', '#84CC16', '#EC4899',
];

export default function ProgramUsageChart({ validatorId, timeRange }: ProgramUsageChartProps) {
  const [programUsage, setProgramUsage] = useState<ProgramUsage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'pie' | 'bar'>('pie');

  useEffect(() => {
    const fetchProgramUsage = async () => {
      if (!validatorId) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await getValidatorProgramUsage(validatorId, timeRange);
        setProgramUsage(data);
      } catch (err) {
        setError('Failed to load program usage data');
        console.error('Error fetching program usage:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgramUsage();
  }, [validatorId, timeRange]);

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow animate-pulse">
        <div className="h-6 bg-gray-200 rounded mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
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

  if (programUsage.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Program Usage</h3>
        <div className="text-center py-8">
          <p className="text-gray-500">No program usage data available.</p>
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const topPrograms = programUsage.slice(0, 10);
  
  const pieData = topPrograms.map((program, index) => ({
    name: program.program_name || truncateAddress(program.program_id),
    value: program.avg_percentage,
    invocations: program.total_invocations,
    category: program.category,
    color: COLORS[index % COLORS.length],
  }));

  const barData = topPrograms.map((program) => ({
    name: program.program_name || truncateAddress(program.program_id, 6),
    percentage: program.avg_percentage,
    invocations: program.total_invocations,
    category: program.category,
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{payload: {name: string; value?: number; percentage?: number; invocations: number; category?: string}}>; label?: string }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-md">
          <p className="font-semibold">{data.name}</p>
          <p className="text-sm text-gray-600">
            Percentage: {formatPercentage(data.value || data.percentage || 0)}
          </p>
          <p className="text-sm text-gray-600">
            Invocations: {formatNumber(data.invocations)}
          </p>
          {data.category && (
            <span className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${getCategoryColor(data.category)}`}>
              {data.category}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Program Usage Distribution</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setViewType('pie')}
            className={`px-3 py-1 text-sm rounded-md ${
              viewType === 'pie'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Pie Chart
          </button>
          <button
            onClick={() => setViewType('bar')}
            className={`px-3 py-1 text-sm rounded-md ${
              viewType === 'bar'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Bar Chart
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {viewType === 'pie' ? (
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${formatPercentage(value)}`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            ) : (
              <BarChart data={barData}>
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  interval={0}
                />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="percentage" fill="#3B82F6" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          <h4 className="font-medium text-gray-900 mb-3">Top Programs</h4>
          {topPrograms.map((program, index) => (
            <div key={program.program_id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {program.program_name || truncateAddress(program.program_id)}
                  </p>
                  {program.category && (
                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${getCategoryColor(program.category)}`}>
                      {program.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {formatPercentage(program.avg_percentage)}
                </p>
                <p className="text-xs text-gray-500">
                  {formatNumber(program.total_invocations)} calls
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}