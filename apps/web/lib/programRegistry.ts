import programList from './programlist.json';

export interface ProgramInfo {
  id: string;
  name: string;
  category: string;
  color: string;
  bgColor: string;
  isKnown: boolean;
}

// Define categories and their colors using distinct, visually appealing colors
const categories = {
  'DEX': { color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/50' },
  'AMM': { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', borderColor: 'border-emerald-500/50' },
  'Perp': { color: 'text-red-400', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/50' },
  'Lending': { color: 'text-purple-400', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-500/50' },
  'Launchpad': { color: 'text-orange-400', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/50' },
  'Gaming': { color: 'text-pink-400', bgColor: 'bg-pink-500/20', borderColor: 'border-pink-500/50' },
  'Infra': { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', borderColor: 'border-cyan-500/50' },
  'Staking': { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-500/50' },
  'Other': { color: 'text-gray-400', bgColor: 'bg-gray-500/20', borderColor: 'border-gray-500/50' },
  'System': { color: 'text-slate-400', bgColor: 'bg-slate-500/20', borderColor: 'border-slate-500/50' },
};

// Categorize programs based on their names
function categorizeProgram(name: string): keyof typeof categories {
  const lowerName = name.toLowerCase();
  
  // Perps
  if (lowerName.includes('perp')) return 'Perp';
  
  // Launchpads
  if (lowerName.includes('pump') || lowerName.includes('launch') || lowerName.includes('boop') || lowerName.includes('virtuals') || lowerName.includes('heaven')) return 'Launchpad';
  
  // Gaming
  if (lowerName.includes('stepn') || lowerName.includes('gaming')) return 'Gaming';
  
  // Infrastructure
  if (lowerName.includes('helium') || lowerName.includes('network')) return 'Infra';
  
  // Staking
  if (lowerName.includes('sanctum') || lowerName.includes('staking') || lowerName.includes('solayer')) return 'Staking';
  
  // AMMs (more specific patterns first)
  if (lowerName.includes('swap') || lowerName.includes('amm') || lowerName.includes('pool') || lowerName.includes('clmm') || lowerName.includes('dlmm')) return 'AMM';
  
  // DEXs (specific protocol names)
  if (lowerName.includes('orca') || lowerName.includes('raydium') || lowerName.includes('openbook') || lowerName.includes('dex') || 
      lowerName.includes('aldrin') || lowerName.includes('phoenix') || lowerName.includes('penguin') || lowerName.includes('goose')) return 'DEX';
  
  // AMMs (protocol-specific names that are AMMs)
  if (lowerName.includes('crema') || lowerName.includes('meteora') || lowerName.includes('lifinity') || 
      lowerName.includes('flux') || lowerName.includes('saros') || lowerName.includes('saber') || 
      lowerName.includes('mercurial') || lowerName.includes('pancake') || lowerName.includes('woofi') ||
      lowerName.includes('stabble') || lowerName.includes('bonding') || lowerName.includes('curve') ||
      lowerName.includes('humidifi') || lowerName.includes('invariant') || lowerName.includes('perena') ||
      lowerName.includes('byreal') || lowerName.includes('solfi') || lowerName.includes('obric') ||
      lowerName.includes('cropper') || lowerName.includes('gamma') || lowerName.includes('dexlab') ||
      lowerName.includes('zerofi') || lowerName.includes('gavel') || lowerName.includes('guac') ||
      lowerName.includes('tessera')) return 'AMM';
  
  // More launchpads/platforms
  if (lowerName.includes('moonit') || lowerName.includes('goon')) return 'Launchpad';
  
  return 'Other';
}

// Well-known system programs
const systemPrograms: Record<string, { name: string; category: keyof typeof categories }> = {
  'Vote111111111111111111111111111111111111111': { name: 'Vote Program', category: 'System' },
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': { name: 'Token Program', category: 'System' },
  '11111111111111111111111111111111': { name: 'System Program', category: 'System' },
  'ComputeBudget111111111111111111111111111111': { name: 'Compute Budget', category: 'System' },
  'BPFLoaderUpgradeab1e11111111111111111111111': { name: 'BPF Loader', category: 'System' },
  'BPFLoader2111111111111111111111111111111111': { name: 'BPF Loader v2', category: 'System' },
  'BPFLoader1111111111111111111111111111111111': { name: 'BPF Loader v1', category: 'System' },
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': { name: 'Associated Token', category: 'System' },
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': { name: 'Memo Program', category: 'System' },
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': { name: 'Memo Program v2', category: 'System' },
};

export function getProgramInfo(programId: string): ProgramInfo {
  // Check if it's a known system program
  if (systemPrograms[programId]) {
    const systemProgram = systemPrograms[programId];
    const categoryStyle = categories[systemProgram.category];
    return {
      id: programId,
      name: systemProgram.name,
      category: systemProgram.category,
      color: categoryStyle.color,
      bgColor: categoryStyle.bgColor,
      isKnown: true,
    };
  }

  // Check if it's in our custom program list
  if (programList[programId as keyof typeof programList]) {
    const name = programList[programId as keyof typeof programList];
    const category = categorizeProgram(name);
    const categoryStyle = categories[category];
    
    return {
      id: programId,
      name,
      category,
      color: categoryStyle.color,
      bgColor: categoryStyle.bgColor,
      isKnown: true,
    };
  }

  // Unknown program
  const categoryStyle = categories.Other;
  return {
    id: programId,
    name: `${programId.slice(0, 8)}...${programId.slice(-8)}`,
    category: 'Other',
    color: categoryStyle.color,
    bgColor: categoryStyle.bgColor,
    isKnown: false,
  };
}

export function formatProgramDisplay(programId: string): { name: string; shortId: string; programInfo: ProgramInfo } {
  const programInfo = getProgramInfo(programId);
  return {
    name: programInfo.name,
    shortId: `${programId.slice(0, 8)}...${programId.slice(-8)}`,
    programInfo,
  };
}