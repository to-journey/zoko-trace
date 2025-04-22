import 'dotenv/config';
import Client, {
  CommitmentLevel,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from '@triton-one/yellowstone-grpc';
import {
  Message,
  MessageV0,
  ParsedTransactionWithMeta,
  PublicKey,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { Idl, Program, Provider } from '@coral-xyz/anchor';
import { SolanaParser } from '@shyft-to/solana-transaction-parser';
import { SubscribeRequestPing } from '@triton-one/yellowstone-grpc/dist/types/grpc/geyser';
import { TransactionFormatter } from './utils/transaction-formatter';
import { SolanaEventParser } from './utils/event-parser';
import { bnLayoutFormatter } from './utils/bn-layout-formatter';
import pumpFunAmmIdl from './idls/pump_amm_0.1.0.json';
import jupyterIdl from './idls/idl.json';
import { getEvents } from './utils/get-events';
import { Jupiter, jupiterIdl } from './idls/jup';
import { intersection, difference } from 'lodash';
import { parseTokenChanges } from './utils/parse-token-transfer';
interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel | undefined;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing | undefined;
}
const SPECFIED_TOKEN = new PublicKey(
  'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump'
);

const POOL_ADDRESS = new PublicKey(
  'D6Rgz1JG2syjsTXGaSAZ39cLffWL4TfabEAAnJHGRrZC'
);

const OPEN_BOOK_PROGRAM_ID = new PublicKey(
  'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'
);
const TXN_FORMATTER = new TransactionFormatter();
const PUMP_FUN_AMM_PROGRAM_ID = new PublicKey(
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
);

const JUPYTER_PROGRAM_ID = new PublicKey(
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
);

export const program = new Program<Jupiter>(jupiterIdl, {} as Provider);

const JUPYTER_IX_PARSER = new SolanaParser([]);
JUPYTER_IX_PARSER.addParserFromIdl(
  JUPYTER_PROGRAM_ID.toBase58(),
  jupyterIdl as Idl
);
const JUPYTER_EVENT_PARSER = new SolanaEventParser([], null);
JUPYTER_EVENT_PARSER.addParserFromIdl(
  JUPYTER_PROGRAM_ID.toBase58(),
  jupyterIdl as Idl
);

const PUMP_FUN_IX_PARSER = new SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(
  PUMP_FUN_AMM_PROGRAM_ID.toBase58(),
  pumpFunAmmIdl as Idl
);
const PUMP_FUN_EVENT_PARSER = new SolanaEventParser([], null);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  PUMP_FUN_AMM_PROGRAM_ID.toBase58(),
  pumpFunAmmIdl as Idl
);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  JUPYTER_PROGRAM_ID.toBase58(),
  jupyterIdl as Idl
);

async function handleStream(client: Client, args: SubscribeRequest) {
  // Subscribe for events
  const stream = await client.subscribe();

  // Create `error` / `end` handler
  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on('error', (error) => {
      console.log('ERROR', error);
      reject(error);
      stream.end();
    });
    stream.on('end', () => {
      resolve();
    });
    stream.on('close', () => {
      resolve();
    });
  });

  // Handle updates
  stream.on('data', (data) => {
    if (data?.transaction) {
      const txn = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now()
      );
      const determineValue = isTransactionFromPool(txn);

      // let parsedTxn = decodeJupyterTxn(txn);
      if (txn) {
        if (determineValue.JUPITER) {
          const events = getEvents(program, txn);
          // const tokenTransfers = parseTokenTransfers(txn);
          // console.log('tokenTransfers', tokenTransfers);
          let swapEvents = events.filter((e) => e.name === 'swapEvent');

          const formattedSwapEvents = swapEvents
            .map((e) => {
              bnLayoutFormatter(e);
              return e;
            })
            .filter(
              (e) =>
                e.data.inputMint === SPECFIED_TOKEN.toBase58() ||
                e.data.outputMint === SPECFIED_TOKEN.toBase58()
            );

          if (formattedSwapEvents.length > 0) {
            console.log('formattedSwapEvents', formattedSwapEvents);
          }
        }

        if (determineValue.PUMP_FUN) {
          let parsedTxn = decodePumpFunTxn(txn);

          if (parsedTxn) {
            console.log(
              'parsedTxn',
              parsedTxn.events.filter((e) => e.pool === POOL_ADDRESS.toBase58())
            );
          }
        }

        const tokenChanges = parseTokenChanges(txn);

        const formattedTokenChanges = tokenChanges.filter(
          (t) => t.mint === SPECFIED_TOKEN.toBase58()
        );
        if (formattedTokenChanges.length > 0) {
          console.log('formattedTokenChanges', formattedTokenChanges);
        }
        if (
          formattedTokenChanges.length > 0 ||
          determineValue.PUMP_FUN ||
          determineValue.JUPITER
        ) {
          console.log(
            new Date(),
            ':',
            `New transaction https://solscan.io/tx/${txn.transaction.signatures[0]} \n`
            // `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`
            // JSON.stringify(parsedTxn, null, 2) + '\n'
          );
          console.log(
            '--------------------------------------------------------------------------------------------------'
          );
        }
      }

      // let parsedTxn = decodePumpFunTxn(txn);
      // if (parsedTxn) {
      //   console.log(
      //     new Date(),
      //     ':',
      //     `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
      //     JSON.stringify(parsedTxn.events[0], null, 2) + '\n'
      //   );
      //   console.log(
      //     '--------------------------------------------------------------------------------------------------'
      //   );
      // }
    }
  });

  // Send subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error('the reason', reason);
    throw reason;
  });

  await streamClosed;
}

async function subscribeCommand(client: Client, args: SubscribeRequest) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      console.error('Stream error, restarting in 1 second...', error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const client = new Client(
  process.env.ENDPOINT!,
  process.env.X_TOKEN,
  undefined
);

const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {
    pumpFun: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [
        // PUMP_FUN_AMM_PROGRAM_ID.toBase58(),
        // JUPYTER_PROGRAM_ID.toBase58(),
        // OPEN_BOOK_PROGRAM_ID.toBase58(),
        SPECFIED_TOKEN.toBase58(),
      ],
      accountExclude: [],
      accountRequired: [],
    },
  },
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  accountsDataSlice: [],
  ping: undefined,
  commitment: CommitmentLevel.CONFIRMED,
};

subscribeCommand(client, req);

function decodePumpFunTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;

  const paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const pumpFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_AMM_PROGRAM_ID)
  );
  if (pumpFunIxs.length === 0) return;
  const events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: pumpFunIxs, events };
  bnLayoutFormatter(result);
  return result;
}

function isTransactionFromPool(
  txn: VersionedTransactionResponse | ParsedTransactionWithMeta
) {
  let returnValue = {
    JUPITER: false,
    PUMP_FUN: false,
    OPEN_BOOK: false,
  };
  try {
    let programIds: string[] = [];
    if (
      txn?.transaction.message instanceof Message ||
      txn?.transaction.message instanceof MessageV0
    ) {
      const accountKeys = txn.transaction.message.staticAccountKeys;
      txn.transaction.message.compiledInstructions.forEach((instruction) => {
        const programId = accountKeys[instruction.programIdIndex];
        if (programId) {
          programIds.push(programId.toBase58());
        }
      });
      programIds.push(
        ...txn.transaction.message.staticAccountKeys.map((v) => v.toBase58())
      );
    } else {
      txn.transaction.message.instructions.forEach((instruction) => {
        programIds.push(instruction.programId.toBase58());
      });
    }
    const lookupAddresses = [];
    // Check for loaded addresses and add them to programIds
    if (txn.meta?.loadedAddresses) {
      if (txn.meta.loadedAddresses.writable) {
        txn.meta.loadedAddresses.writable.forEach((address) => {
          if (address) {
            programIds.push(address.toBase58());
            lookupAddresses.push(address.toBase58());
          }
        });
      }
      if (txn.meta.loadedAddresses.readonly) {
        txn.meta.loadedAddresses.readonly.forEach((address) => {
          if (address) {
            programIds.push(address.toBase58());
            lookupAddresses.push(address.toBase58());
          }
        });
      }
    }
    if (lookupAddresses.includes(SPECFIED_TOKEN.toBase58())) {
      console.log('lookupAddresses', lookupAddresses);
    }
    if (programIds.includes(JUPYTER_PROGRAM_ID.toBase58())) {
      returnValue.JUPITER = true;
    }
    if (programIds.includes(PUMP_FUN_AMM_PROGRAM_ID.toBase58())) {
      returnValue.PUMP_FUN = true;
    }
    if (programIds.includes(OPEN_BOOK_PROGRAM_ID.toBase58())) {
      returnValue.OPEN_BOOK = true;
    }

    return returnValue;
  } catch (e) {
    return returnValue;
  }
}

function decodeJupyterTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;

  const jupyterIxs = JUPYTER_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const parsedIxs = jupyterIxs.filter((ix) =>
    ix.programId.equals(JUPYTER_PROGRAM_ID)
  );

  if (parsedIxs.length === 0) return;
  // const jupyterEvents = JUPYTER_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: parsedIxs };
  bnLayoutFormatter(result);
  return result;
}
