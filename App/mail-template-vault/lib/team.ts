import { randomInt } from "node:crypto";
import { z } from "zod";

export const newMemberInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "member"]).default("member"),
});

export const memberUpdateInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset_password") }),
  z.object({ action: z.literal("set_role"), role: z.enum(["admin", "member"]) }),
  z.object({ action: z.literal("set_active"), active: z.boolean() }),
]);

// Letters and digits that are easy to read aloud or retype, with every class the password rules need.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const pick = (set: string) => set[randomInt(set.length)];

export function temporaryPassword(length = 16) {
  const all = LOWER + UPPER + DIGITS;
  const characters = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (characters.length < length) characters.push(pick(all));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join("");
}
