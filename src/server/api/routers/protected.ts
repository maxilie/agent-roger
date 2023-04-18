import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

// API endpoints for handling managed users
export const tasksRouter = createTRPCRouter({
  testConnection: protectedProcedure.query(() => {
    console.log("success");
  }),
});
