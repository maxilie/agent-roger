export const MAX_CONCURRENT_TASKS = 500;
// if a pipeline was called and processed too quickly, we must wait (or else redis will block requests)
export const MIN_TIME_BETWEEN_REDIS_CALLS = 100;
// if a stage function processes instantly and does not advance to the next stage, we must wait (or else the heap could fill up)
export const MIN_TIME_BETWEEN_SAME_STAGE_CALLS = 10;
