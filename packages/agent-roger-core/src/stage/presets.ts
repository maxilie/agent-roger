import { type StageFunction } from "./stage-function.js";
import stageFn_generateSemanticContextQueries from "./generate-semantic-context-queries/index.js";
import stageFn_generateKeywordContextQueries from "./generate-keyword-context-queries/index.js";
import stageFn_generateSemanticQueryEmbeddings from "./generate-semantic-query-embeddings/index.js";
import stageFn_queryRawContext from "./query-raw-context/index.js";
import stageFn_summarizeContext from "./summarize-context/index.js";
import stageFn_generateStepsAndSuccessCriteria from "./generate-steps-and-success-criteria/index.js";
import stageFn_generateStepPersonalization from "./generate-step-personalization/index.js";
import stageFn_generateSubTasks from "./generate-sub-tasks/index.js";
import stageFn_summarizeSubTaskOutputs from "./summarize-sub-task-outputs/index.js";
import stageFn_validateOutput from "./validate-output/index.js";
import stageFn_decideCorrectiveAction from "./decide-corrective-action/index.js";

const STAGE_PRESETS: { [key: string]: StageFunction } = {
  generateSemanticContextQueries: stageFn_generateSemanticContextQueries,
  generateKeywordContextQueries: stageFn_generateKeywordContextQueries,
  generateSemanticQueryEmbeddings: stageFn_generateSemanticQueryEmbeddings,
  queryRawContext: stageFn_queryRawContext,
  summarizeContext: stageFn_summarizeContext,
  generateStepsAndSuccessCriteria: stageFn_generateStepsAndSuccessCriteria,
  generateStepPersonalization: stageFn_generateStepPersonalization,
  generateSubTasks: stageFn_generateSubTasks,
  summarizeSubTaskOutputs: stageFn_summarizeSubTaskOutputs,
  validateOutput: stageFn_validateOutput,
  decideCorrectiveAction: stageFn_decideCorrectiveAction,
};

export default STAGE_PRESETS;
