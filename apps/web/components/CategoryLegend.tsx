'use client';

const categories = [
  { name: 'DEX', color: 'text-blue-200', bgColor: 'bg-blue-900/30', description: 'Decentralized Exchanges' },
  { name: 'AMM', color: 'text-green-200', bgColor: 'bg-green-900/30', description: 'Automated Market Makers' },
  { name: 'System', color: 'text-slate-200', bgColor: 'bg-slate-900/30', description: 'Core Solana Programs' },
  { name: 'Launchpad', color: 'text-orange-200', bgColor: 'bg-orange-900/30', description: 'Token Launch Platforms' },
  { name: 'Staking', color: 'text-yellow-200', bgColor: 'bg-yellow-900/30', description: 'Liquid Staking' },
  { name: 'Perp', color: 'text-red-200', bgColor: 'bg-red-900/30', description: 'Perpetual Futures' },
  { name: 'Gaming', color: 'text-pink-200', bgColor: 'bg-pink-900/30', description: 'Gaming & NFTs' },
  { name: 'Infra', color: 'text-cyan-200', bgColor: 'bg-cyan-900/30', description: 'Infrastructure' },
];

export default function CategoryLegend() {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-sm font-semibold mb-3 text-gray-300">Program Categories</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {categories.map((category) => (
          <div key={category.name} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${category.bgColor} border border-opacity-50`}></div>
            <span className={category.color}>{category.name}</span>
            <span className="text-gray-500 text-xs">({category.description})</span>
          </div>
        ))}
      </div>
    </div>
  );
}