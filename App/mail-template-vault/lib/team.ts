import { z } from "zod";

export const newMemberInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "member"]).default("member"),
});

export const memberUpdateInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send_link") }),
  z.object({ action: z.literal("set_role"), role: z.enum(["admin", "member"]) }),
  z.object({ action: z.literal("set_active"), active: z.boolean() }),
]);
