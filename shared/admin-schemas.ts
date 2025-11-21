import { z } from "zod";

// User management schemas
export const updateUserRoleSchema = z.object({
  role: z.enum(["LISTENER", "CREATOR", "ADMIN"]),
});

export const updateUserApprovalSchema = z.object({
  requiresApproval: z.boolean(),
});

export const updateUserActiveSchema = z.object({
  isActive: z.boolean(),
});

// Content moderation schemas
export const updatePodcastStatusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]),
});

export const updateEpisodeStatusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]),
});

// Query parameter schemas for filtering
export const adminPodcastsQuerySchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]).optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const adminEpisodesQuerySchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]).optional(),
  podcastId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().optional(),
});

// Email configuration schemas
export const createEmailConfigSchema = z.object({
  smtpHost: z.string().min(1, "SMTP host is required"),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().min(1, "SMTP user is required"),
  smtpPassword: z.string().min(1, "SMTP password is required"),
  fromEmail: z.string().email("Invalid email address"),
  fromName: z.string().min(1).default("PodcastHub"),
  isActive: z.boolean().default(false),
});

export const updateEmailConfigSchema = z.object({
  smtpHost: z.string().min(1).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().min(1).optional(),
  smtpPassword: z.string().min(1).optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// Google Drive configuration schemas
const validateServiceAccountKey = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    // Validate it has required Google service account fields
    if (!parsed.type || parsed.type !== 'service_account') {
      return false;
    }
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const createDriveConfigSchema = z.object({
  serviceAccountEmail: z.string().email("Invalid service account email"),
  serviceAccountKey: z.string()
    .min(1, "Service account key is required")
    .refine(validateServiceAccountKey, "Invalid service account key JSON"),
  folderIdImages: z.string().min(1, "Images folder ID is required"),
  folderIdAudio: z.string().min(1, "Audio folder ID is required"),
  isActive: z.boolean().default(false),
});

export const updateDriveConfigSchema = z.object({
  serviceAccountEmail: z.string().email().optional(),
  serviceAccountKey: z.string()
    .min(1)
    .refine(validateServiceAccountKey, "Invalid service account key JSON")
    .optional(),
  folderIdImages: z.string().min(1).optional(),
  folderIdAudio: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const testDriveConfigSchema = z.object({
  serviceAccountEmail: z.string().email("Invalid service account email"),
  serviceAccountKey: z.string()
    .min(1, "Service account key is required")
    .refine(validateServiceAccountKey, "Invalid service account key JSON"),
  folderIdImages: z.string().min(1, "Images folder ID is required"),
  folderIdAudio: z.string().min(1, "Audio folder ID is required"),
});

// TypeScript types
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserApproval = z.infer<typeof updateUserApprovalSchema>;
export type UpdateUserActive = z.infer<typeof updateUserActiveSchema>;
export type UpdatePodcastStatus = z.infer<typeof updatePodcastStatusSchema>;
export type UpdateEpisodeStatus = z.infer<typeof updateEpisodeStatusSchema>;
export type AdminPodcastsQuery = z.infer<typeof adminPodcastsQuerySchema>;
export type AdminEpisodesQuery = z.infer<typeof adminEpisodesQuerySchema>;
export type CreateEmailConfig = z.infer<typeof createEmailConfigSchema>;
export type UpdateEmailConfig = z.infer<typeof updateEmailConfigSchema>;
export type CreateDriveConfig = z.infer<typeof createDriveConfigSchema>;
export type UpdateDriveConfig = z.infer<typeof updateDriveConfigSchema>;
export type TestDriveConfig = z.infer<typeof testDriveConfigSchema>;

// Bulk operations schemas
export const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one ID is required").max(50, "Maximum 50 items per operation"),
});

export const bulkDeleteUsersSchema = bulkIdsSchema;

export const bulkUpdateUsersRoleSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  role: z.enum(["LISTENER", "CREATOR", "ADMIN"]),
});

export const bulkUpdateUsersActiveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  isActive: z.boolean(),
});

export const bulkDeletePodcastsSchema = bulkIdsSchema;

export const bulkUpdatePodcastsStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]),
});

export const bulkDeleteEpisodesSchema = bulkIdsSchema;

export const bulkUpdateEpisodesStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]),
});

// Bulk operation types
export type BulkIds = z.infer<typeof bulkIdsSchema>;
export type BulkDeleteUsers = z.infer<typeof bulkDeleteUsersSchema>;
export type BulkUpdateUsersRole = z.infer<typeof bulkUpdateUsersRoleSchema>;
export type BulkUpdateUsersActive = z.infer<typeof bulkUpdateUsersActiveSchema>;
export type BulkDeletePodcasts = z.infer<typeof bulkDeletePodcastsSchema>;
export type BulkUpdatePodcastsStatus = z.infer<typeof bulkUpdatePodcastsStatusSchema>;
export type BulkDeleteEpisodes = z.infer<typeof bulkDeleteEpisodesSchema>;
export type BulkUpdateEpisodesStatus = z.infer<typeof bulkUpdateEpisodesStatusSchema>;
