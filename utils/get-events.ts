import { Event, Program, utils } from '@coral-xyz/anchor';
import { PublicKey, VersionedTransactionResponse } from '@solana/web3.js';
import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { Jupiter } from '../idls/jup';
const JUPYTER_PROGRAM_ID = new PublicKey(
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
);
export function getEvents(
  program: Program<Jupiter>,
  transactionResponse: VersionedTransactionResponse
) {
  let events: Event[] = [];

  if (transactionResponse && transactionResponse.meta) {
    let { meta } = transactionResponse;
    const accountKeys =
      transactionResponse.transaction.message.staticAccountKeys;
    // transactionResponse.transaction.message.compiledInstructions.forEach((instruction) => {
    //   const programId = accountKeys[instruction.programIdIndex];
    //   if (programId) {
    //     programIds.push(programId.toBase58());
    //   }
    // });
    meta.innerInstructions?.map((ix) => {
      ix.instructions.map((iix) => {
        const programId = accountKeys[iix.programIdIndex];
        if (!programId?.equals(JUPYTER_PROGRAM_ID)) return;

        if (!('data' in iix)) return; // Guard in case it is a parsed decoded instruction

        const ixData = utils.bytes.bs58.decode(iix.data);
        const eventData = utils.bytes.base64.encode(ixData.subarray(8));
        const event = program.coder.events.decode(eventData);
        if (!event) return;

        events.push(event);
      });
    });
  }

  return events;
}
