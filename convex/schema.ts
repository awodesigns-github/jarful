import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables, // users, authSessions, authAccounts, ...

  jars: defineTable({
    userId: v.id("users"),
    name: v.optional(v.string()),
    capacity: v.number(), // default 30
    startedAt: v.number(),
    sealedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_startedAt", ["userId", "startedAt"]),

  notes: defineTable({
    userId: v.id("users"),
    jarId: v.id("jars"),
    text: v.string(), // max 140, enforced in mutations
    colour: v.optional(v.string()),
    createdAt: v.number(),
    isFavourite: v.boolean(),
    clientId: v.optional(v.string()), // idempotency key from the device outbox
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_jarId_createdAt", ["jarId", "createdAt"])
    .index("by_userId_isFavourite", ["userId", "isFavourite", "createdAt"])
    .index("by_userId_clientId", ["userId", "clientId"]),

  settings: defineTable({
    userId: v.id("users"),
    reminderTime: v.optional(v.string()), // "HH:mm" local time
    theme: v.union(v.literal("system"), v.literal("light"), v.literal("dark")),
    reducedMotion: v.boolean(),
    haptics: v.boolean(),
    lastRevealedNoteId: v.optional(v.id("notes")),
  }).index("by_userId", ["userId"]),
});
