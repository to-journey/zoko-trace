import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Message,
  MessageV0,
  PublicKey,
  VersionedTransactionResponse,
} from '@solana/web3.js';

export function parseTokenChanges(tx: VersionedTransactionResponse) {
  if (!tx.meta) return [];

  const getAccount = (index: number) => {
    const staticAccounts = tx.transaction.message.staticAccountKeys;
    if (index < staticAccounts.length) {
      return staticAccounts[index];
    }
    if (
      index >= staticAccounts.length &&
      index <
        staticAccounts.length + (tx.meta.loadedAddresses?.writable?.length || 0)
    ) {
      return tx.meta.loadedAddresses?.writable?.[index - staticAccounts.length];
    }
    return tx.meta.loadedAddresses?.readonly?.[
      index -
        staticAccounts.length -
        (tx.meta.loadedAddresses?.writable?.length || 0)
    ];
  };
  const transfers = [];
  let staticAccountKeys: PublicKey[] = [];
  if (
    tx.transaction.message instanceof Message ||
    tx.transaction.message instanceof MessageV0
  ) {
    // For versioned transactions
    staticAccountKeys = tx.transaction.message.staticAccountKeys;
  }

  // Get all token accounts pre and post balances
  const preTokenBalances = tx.meta.preTokenBalances || [];
  const postTokenBalances = tx.meta.postTokenBalances || [];

  // Create a map for easier lookup
  const balanceChanges = new Map();

  // Map pre-balances
  preTokenBalances.forEach((balance) => {
    if (balance.mint && balance.owner) {
      const key = `${balance.mint}:${balance.owner}`;
      balanceChanges.set(key, {
        mint: balance.mint,
        owner: balance.owner,
        preBalance: balance.uiTokenAmount.uiAmount || 0,
        postBalance: 0,
        address: new PublicKey(getAccount(balance.accountIndex).toBase58()),
      });
    }
  });

  // Update with post-balances
  postTokenBalances.forEach((balance) => {
    if (balance.mint && balance.owner) {
      const key = `${balance.mint}:${balance.owner}`;
      const existing = balanceChanges.get(key);

      if (existing) {
        existing.postBalance = balance.uiTokenAmount.uiAmount || 0;
      } else {
        balanceChanges.set(key, {
          mint: balance.mint,
          owner: balance.owner,
          preBalance: 0,
          postBalance: balance.uiTokenAmount.uiAmount || 0,
          address: new PublicKey(getAccount(balance.accountIndex).toBase58()),
        });
      }
    }
  });

  // Find token program instructions
  let tokenProgramIndex = -1;

  if (
    tx.transaction.message instanceof Message ||
    tx.transaction.message instanceof MessageV0
  ) {
    // For versioned transactions
    tokenProgramIndex = tx.transaction.message.staticAccountKeys.findIndex(
      (key) => key.equals(TOKEN_PROGRAM_ID)
    );
  }

  // Get all logs to find "Transfer" events
  const logs = tx.meta.logMessages || [];

  // Process balance changes
  for (const [key, change] of balanceChanges.entries()) {
    const difference = change.postBalance - change.preBalance;

    if (Math.abs(difference) > 0.000001) {
      // Avoid floating point issues
      transfers.push({
        mint: change.mint,
        owner: change.owner,
        amount: difference,
        direction: difference > 0 ? 'receive' : 'send',
        address: change.address?.toBase58(),
      });
    }
  }

  // Augment with information from logs if possible
  // if (transferLogs.length > 0 && transfers.length > 0) {
  //   // Add logic to match logs with transfers if needed
  //   transfers.forEach((transfer) => {
  //     transfer.logs = transferLogs.filter(
  //       (log) => log.includes(transfer.mint) || log.includes(transfer.owner)
  //     );
  //   });
  // }

  return transfers;
}
