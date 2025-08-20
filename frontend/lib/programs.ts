// Merge the two program lists from programs.json
import programsData from '../public/programs.json';

// Parse the JSON file which contains two objects
const [list1, list2] = Array.isArray(programsData) ? programsData : [programsData, {}];

// Common Solana system programs and well-known protocols
const systemPrograms: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  'Vote111111111111111111111111111111111111111': 'Vote Program',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Program',
  'AddressLookupTab1e1111111111111111111111111': 'Address Lookup Table Program',
  'BPFLoaderUpgradeab1e11111111111111111111111': 'BPF Loader Upgradeable',
  'BPFLoader2111111111111111111111111111111111': 'BPF Loader v2',
  'BPFLoader1111111111111111111111111111111111': 'BPF Loader v1',
  'Config1111111111111111111111111111111111111': 'Config Program',
  'Feature111111111111111111111111111111111111': 'Feature Program',
  'NativeLoader1111111111111111111111111111111': 'Native Loader',
  'Stake11111111111111111111111111111111111111': 'Stake Program',
  'StakeConfig11111111111111111111111111111111': 'Stake Config Program',
  'SysvarC1ock11111111111111111111111111111111': 'Sysvar Clock',
  'SysvarEpochSchedu1e111111111111111111111111': 'Sysvar Epoch Schedule',
  'SysvarFees111111111111111111111111111111111': 'Sysvar Fees',
  'SysvarRecentB1ockHashes11111111111111111111': 'Sysvar Recent Blockhashes',
  'SysvarRent111111111111111111111111111111111': 'Sysvar Rent',
  'SysvarRewards111111111111111111111111111111': 'Sysvar Rewards',
  'SysvarS1otHashes111111111111111111111111111': 'Sysvar Slot Hashes',
  'SysvarStakeHistory1111111111111111111111111': 'Sysvar Stake History',
  // Well-known DeFi protocols
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter',
  'cjg3oHmg9uuPsP8D6g29NWvhySJkdYdAo9D25PRbKXJ': 'Chainlink Data Feeds Store Program',
  'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH': 'Drift Protocol',
};

// Merge all lists, handling duplicates (system programs first, then list2, then list1)
export const programRegistry: Record<string, string> = {
  ...list2, // Add second list first
  ...list1, // Override with first list values (takes precedence for duplicates)
  ...systemPrograms, // System programs take highest precedence
};

// Generate consistent colors for programs
const colors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-yellow-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-red-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-slate-500',
];

export function getProgramColor(programId: string): string {
  // Use a simple hash to consistently assign colors
  let hash = 0;
  for (let i = 0; i < programId.length; i++) {
    hash = ((hash << 5) - hash) + programId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getProgramName(programId: string): string {
  return programRegistry[programId] || 'Unknown Program';
}

export function isProgramKnown(programId: string): boolean {
  return programId in programRegistry;
}