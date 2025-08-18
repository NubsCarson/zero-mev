'use client';

interface DataPoint {
  ts: string;
  cnt: number;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
}

export default function LineChart({ data, width = 800, height = 400 }: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const counts = data.map(d => d.cnt);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const countRange = maxCount - minCount || 1;

  const xScale = (index: number) => (index / (data.length - 1 || 1)) * chartWidth;
  const yScale = (value: number) => chartHeight - ((value - minCount) / countRange) * chartHeight;

  const pathData = data
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(point.cnt)}`)
    .join(' ');

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => 
    minCount + (countRange / (yTicks - 1)) * i
  );

  return (
    <svg width={width} height={height} className="bg-gray-800 rounded">
      <g transform={`translate(${padding.left}, ${padding.top})`}>
        {/* Y-axis */}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={chartHeight}
          stroke="currentColor"
          strokeOpacity={0.3}
        />
        
        {/* Y-axis ticks and labels */}
        {yTickValues.map((value, i) => {
          const y = yScale(value);
          return (
            <g key={i}>
              <line
                x1={-5}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text
                x={-10}
                y={y}
                textAnchor="end"
                alignmentBaseline="middle"
                className="text-xs fill-gray-400"
              >
                {value.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* X-axis */}
        <line
          x1={0}
          y1={chartHeight}
          x2={chartWidth}
          y2={chartHeight}
          stroke="currentColor"
          strokeOpacity={0.3}
        />

        {/* X-axis labels */}
        {data.map((point, i) => {
          if (i % Math.ceil(data.length / 6) !== 0) return null;
          const x = xScale(i);
          const date = new Date(point.ts);
          const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          return (
            <text
              key={i}
              x={x}
              y={chartHeight + 20}
              textAnchor="middle"
              className="text-xs fill-gray-400"
            >
              {label}
            </text>
          );
        })}

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />

        {/* Data points */}
        {data.map((point, i) => (
          <circle
            key={i}
            cx={xScale(i)}
            cy={yScale(point.cnt)}
            r={3}
            fill="#3b82f6"
          />
        ))}
      </g>
    </svg>
  );
}