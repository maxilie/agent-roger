import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import * as crypto from "crypto";

export const SWITCH_MEMORY_BANK_STAGE_FNS: { [key: string]: StageFunction } = {
  switchMemoryBank: async (helpers: StageFunctionHelpers) => {
    // get input
    let memoryBankID = "";
    for (const inputVal of Object.values(helpers.initialInputFields || {})) {
      if (
        typeof inputVal != "string" ||
        inputVal.length < memoryBankID.length
      ) {
        continue;
      }
      memoryBankID = inputVal.toLowerCase();
    }
    if (!memoryBankID) memoryBankID = crypto.webcrypto.randomUUID();
    await helpers.switchMemoryBank(memoryBankID);
    helpers.taskResult({
      failed: false,
      taskSummary: `Switched to memory bank ${memoryBankID}.`,
      outputFields: {},
    });
  },
};
