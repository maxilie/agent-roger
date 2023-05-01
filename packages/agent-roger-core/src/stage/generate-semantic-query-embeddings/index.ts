import {
  type EndFn,
  type ErrFn,
  type GetFn,
  type SetFn,
  type StageFunction,
} from "../stage-function";

const stageFn_generateSemanticQueryEmbeddings: StageFunction = async (
  get: GetFn,
  set: SetFn,
  err: ErrFn,
  end: EndFn
) => {
  return await new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, 1000);
  });
};

export default stageFn_generateSemanticQueryEmbeddings;
