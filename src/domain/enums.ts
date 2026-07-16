import { z } from "zod";

/**
 * Zod enums mirror the String columns in schema.prisma. They are the single
 * source of truth for allowed values (the DB stores plain strings for
 * SQLite↔Postgres portability). Validate at every boundary.
 */

export const UserKind = z.enum(["TALENT", "CASTING"]);
export type UserKind = z.infer<typeof UserKind>;

export const ProfileStatus = z.enum(["DRAFT", "ACTIVE"]);
export const MandatStatus = z.enum(["ACTIVE", "REVOKED"]);

export const SubjectType = z.enum(["ARTIST", "ORG"]);
export const SubscriptionStatus = z.enum(["ACTIVE", "PAST_DUE", "CANCELED"]);

export const PlanB2C = z.enum(["FREE", "PRO", "PREMIUM", "ULTIMATE"]);
export type PlanB2C = z.infer<typeof PlanB2C>;
export const PlanB2B = z.enum(["FREE", "PRO", "STUDIO", "ENTERPRISE"]);
export type PlanB2B = z.infer<typeof PlanB2B>;

export const SiretStatus = z.enum(["PENDING", "VERIFIED", "REJECTED"]);
export const MembershipRole = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export const SeatStatus = z.enum(["ACTIVE", "INVITED", "EMPTY"]);

export const ProjectStatus = z.enum([
  "DRAFT",
  "OPEN",
  "SHORTLISTING",
  "CLOSED",
]);
export const CandidatureSource = z.enum(["AGENTAL", "EXTERNAL"]);
export const CandidatureStatus = z.enum([
  "NEW",
  "SHORTLISTED",
  "STARRED",
  "EXCLUDED",
  "SELFTAPE_REQUESTED",
  "INVITED",
  "CONTRACTED",
  "REJECTED",
]);

export const SpecialtyKind = z.enum([
  "figuration",
  "silhouette",
  "seconds-roles",
  "publicite",
  "photo",
  "voix",
  "enfants",
  "createurs",
]);
export type SpecialtyKind = z.infer<typeof SpecialtyKind>;

export const SpecialtyLevel = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "CONFIRMED",
]);

export const MediaType = z.enum(["PHOTO", "VIDEO", "SELFTAPE", "AUDIO"]);
export const SelfTapeStatus = z.enum(["PROCESSING", "READY", "FAILED"]);
export const AvailabilityType = z.enum(["AVAILABLE", "UNAVAILABLE"]);

export const PrefectoralAuthStatus = z.enum([
  "NONE",
  "REQUESTED",
  "GRANTED",
  "REFUSED",
]);
export const MinorState = z.enum([
  "OPENED",
  "DOCS_PENDING",
  "READY",
  "BLOCKED",
]);
