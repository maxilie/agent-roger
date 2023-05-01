// For up to 4 seconds after you change a task's data in SQL, a task runner can overwrite it.
// When updating a task's data from outside of a task runner, change its `lastInteractionMarker`, wait 4 seconds, and ensure the marker is still the same.
export const MAX_UNSYNC_TIME = 40000;
