export type GetFn = <T>(key: string) => T | null;
export type SetFn = (key: string) => void;
export type ErrFn = (err: string | object) => void;
export type EndFn = () => void;
export type StageFunction = (
  get: GetFn,
  set: SetFn,
  err: ErrFn,
  end: EndFn
) => Promise<void>;
