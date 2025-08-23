import { Connection, PublicKey } from '@solana/web3.js';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

export interface VoteAccountInfo {
  isVoteAccount: boolean;
  validatorIdentity?: string;
  commission?: number;
  activatedStake?: number;
}

/**
 * Check if an address is a vote account and get its validator identity
 */
export async function checkVoteAccount(address: string): Promise<VoteAccountInfo> {
  try {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const voteAccounts = await connection.getVoteAccounts();
    
    // Check both current and delinquent vote accounts
    const allVoteAccounts = [...voteAccounts.current, ...voteAccounts.delinquent];
    
    for (const account of allVoteAccounts) {
      if (account.votePubkey === address) {
        return {
          isVoteAccount: true,
          validatorIdentity: account.nodePubkey,
          commission: account.commission,
          activatedStake: account.activatedStake,
        };
      }
    }
    
    return { isVoteAccount: false };
  } catch (error) {
    console.error('Error checking vote account:', error);
    // If we can't check, assume it's not a vote account
    return { isVoteAccount: false };
  }
}

/**
 * Validate if a string is a valid Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}