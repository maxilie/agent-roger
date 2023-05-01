import { type StageFunction } from "./stage-function";
import stageFn_generateSemanticContextQueries from "./generate-semantic-context-queries";
import stageFn_generateKeywordContextQueries from "./generate-keyword-context-queries";
import stageFn_generateSemanticQueryEmbeddings from "./generate-semantic-query-embeddings";
import stageFn_queryRawContext from "./query-raw-context";
import stageFn_summarizeContext from "./summarize-context";
import stageFn_generateStepsAndSuccessCriteria from "./generate-steps-and-success-criteria";
import stageFn_generateStepPersonalization from "./generate-step-personalization";
import stageFn_generateSubTasks from "./generate-sub-tasks";
import stageFn_summarizeSubTaskOutputs from "./summarize-sub-task-outputs";
import stageFn_validateOutput from "./validate-output";
import stageFn_decideCorrectiveAction from "./decide-corrective-action";

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
