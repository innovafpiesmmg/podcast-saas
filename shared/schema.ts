import { sql } from "drizzle-orm";
import { pgTable, text, varchar, pgEnum, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User role enum: LISTENER, CREATOR, or ADMIN
export const userRoleEnum = pgEnum("user_role", ["LISTENER", "CREATOR", "ADMIN"]);

// Content status enum for moderation workflow
export const contentStatusEnum = pgEnum("content_status", ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]);

// Media asset type enum
export const mediaAssetTypeEnum = pgEnum("media_asset_type", ["COVER_ART", "EPISODE_AUDIO"]);

// Storage provider enum
export const storageProviderEnum = pgEnum("storage_provider", ["LOCAL", "GOOGLE_DRIVE"]);

// Visibility enum for podcasts and episodes
export const visibilityEnum = pgEnum("visibility", ["PRIVATE", "UNLISTED", "PUBLIC"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("LISTENER"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  website: text("website"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiresAt: timestamp("email_verification_token_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Podcasts table
export const podcasts = pgTable("podcasts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  coverArtUrl: text("cover_art_url"), // Legacy: kept for backwards compatibility
  coverArtAssetId: varchar("cover_art_asset_id", { length: 36 }), // New: reference to media_assets
  category: text("category").notNull().default("Technology"),
  language: text("language").notNull().default("es"),
  status: contentStatusEnum("status").notNull().default("APPROVED"), // Moderation status
  visibility: visibilityEnum("visibility").notNull().default("PUBLIC"), // Privacy: PRIVATE, UNLISTED, PUBLIC
  ownerId: varchar("owner_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"), // When admin approved this content
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id), // Which admin approved
});

// Episodes table
export const episodes = pgTable("episodes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  notes: text("notes").notNull(),
  coverArtUrl: text("cover_art_url"), // Legacy: episode-specific cover (fallback to podcast cover if null)
  coverArtAssetId: varchar("cover_art_asset_id", { length: 36 }), // New: reference to media_assets
  audioUrl: text("audio_url"), // Legacy: kept for backwards compatibility
  audioAssetId: varchar("audio_asset_id", { length: 36 }), // New: reference to media_assets
  audioFileSize: integer("audio_file_size"), // Legacy: now stored in media_assets
  duration: integer("duration").notNull().default(0), // Duration in seconds
  status: contentStatusEnum("status").notNull().default("APPROVED"), // Moderation status
  visibility: visibilityEnum("visibility").notNull().default("PUBLIC"), // Privacy: PRIVATE, UNLISTED, PUBLIC
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  podcastId: varchar("podcast_id", { length: 36 }).notNull().references(() => podcasts.id),
  approvedAt: timestamp("approved_at"), // When admin approved this content
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id), // Which admin approved
});

// Subscriptions table - users subscribe to podcasts
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  podcastId: varchar("podcast_id", { length: 36 }).notNull().references(() => podcasts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userPodcastUnique: {
    columns: [table.userId, table.podcastId],
    name: "subscriptions_user_podcast_unique"
  }
}));

// Content invitations table - grant access to private/unlisted content
export const contentInvitations = pgTable("content_invitations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(), // Email of invited user (may not have account yet)
  userId: varchar("user_id", { length: 36 }).references(() => users.id), // Linked user if they register/login
  podcastId: varchar("podcast_id", { length: 36 }).references(() => podcasts.id), // Null if episode-specific
  episodeId: varchar("episode_id", { length: 36 }).references(() => episodes.id), // Null if podcast-wide
  invitedBy: varchar("invited_by", { length: 36 }).notNull().references(() => users.id), // Creator who invited
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiration
}, (table) => ({
  emailPodcastUnique: {
    columns: [table.email, table.podcastId],
    name: "content_invitations_email_podcast_unique"
  },
  emailEpisodeUnique: {
    columns: [table.email, table.episodeId],
    name: "content_invitations_email_episode_unique"
  }
}));

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Playlists table - user-created playlists
export const playlists = pgTable("playlists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Playlist episodes table - many-to-many relationship between playlists and episodes
export const playlistEpisodes = pgTable("playlist_episodes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  playlistId: varchar("playlist_id", { length: 36 }).notNull().references(() => playlists.id, { onDelete: "cascade" }),
  episodeId: varchar("episode_id", { length: 36 }).notNull().references(() => episodes.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0), // Order in playlist
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => ({
  playlistEpisodeUnique: {
    columns: [table.playlistId, table.episodeId],
    name: "playlist_episodes_playlist_episode_unique"
  }
}));

// Email configuration table - admin configures SMTP settings
export const emailConfig = pgTable("email_config", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUser: text("smtp_user").notNull(),
  smtpPassword: text("smtp_password").notNull(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull().default("PodcastHub"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Google Drive configuration table - admin configures Google Drive integration
export const driveConfig = pgTable("drive_config", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  serviceAccountEmail: text("service_account_email").notNull(),
  serviceAccountKey: text("service_account_key").notNull(), // JSON key file content
  folderIdImages: text("folder_id_images").notNull(), // Drive folder ID for images
  folderIdAudio: text("folder_id_audio").notNull(), // Drive folder ID for audio
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Media assets table - stores all uploaded files
export const mediaAssets = pgTable("media_assets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id", { length: 36 }).notNull().references(() => users.id),
  podcastId: varchar("podcast_id", { length: 36 }).references(() => podcasts.id), // Optional: link to podcast
  episodeId: varchar("episode_id", { length: 36 }).references(() => episodes.id), // Optional: link to episode
  type: mediaAssetTypeEnum("type").notNull(),
  storageProvider: storageProviderEnum("storage_provider").notNull().default("LOCAL"),
  storageKey: text("storage_key").notNull(), // Local: relative path, Drive: file ID
  publicUrl: text("public_url"), // Public URL for accessing the asset
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksum: text("checksum"), // MD5 or SHA256 for integrity
  visibility: text("visibility").notNull().default("public"), // public or private
  status: contentStatusEnum("status").notNull().default("APPROVED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sessions table for express-session with connect-pg-simple
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  podcasts: many(podcasts),
}));

export const podcastsRelations = relations(podcasts, ({ one, many }) => ({
  owner: one(users, {
    fields: [podcasts.ownerId],
    references: [users.id],
  }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  podcast: one(podcasts, {
    fields: [episodes.podcastId],
    references: [podcasts.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  podcast: one(podcasts, {
    fields: [subscriptions.podcastId],
    references: [podcasts.id],
  }),
}));

export const contentInvitationsRelations = relations(contentInvitations, ({ one }) => ({
  user: one(users, {
    fields: [contentInvitations.userId],
    references: [users.id],
  }),
  podcast: one(podcasts, {
    fields: [contentInvitations.podcastId],
    references: [podcasts.id],
  }),
  episode: one(episodes, {
    fields: [contentInvitations.episodeId],
    references: [episodes.id],
  }),
  inviter: one(users, {
    fields: [contentInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  owner: one(users, {
    fields: [mediaAssets.ownerId],
    references: [users.id],
  }),
  podcast: one(podcasts, {
    fields: [mediaAssets.podcastId],
    references: [podcasts.id],
  }),
  episode: one(episodes, {
    fields: [mediaAssets.episodeId],
    references: [episodes.id],
  }),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(users, {
    fields: [playlists.userId],
    references: [users.id],
  }),
  playlistEpisodes: many(playlistEpisodes),
}));

export const playlistEpisodesRelations = relations(playlistEpisodes, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistEpisodes.playlistId],
    references: [playlists.id],
  }),
  episode: one(episodes, {
    fields: [playlistEpisodes.episodeId],
    references: [episodes.id],
  }),
}));

// Zod schemas for inserts
export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true, createdAt: true, passwordHash: true })
  .extend({
    password: z.string().min(8, "Password must be at least 8 characters"),
    bio: z.string().optional(),
    avatarUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
    website: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  });

export const insertPodcastSchema = createInsertSchema(podcasts)
  .omit({ id: true, createdAt: true, coverArtUrl: true, ownerId: true, category: true, language: true, status: true, visibility: true, approvedAt: true, approvedBy: true })
  .extend({
    coverArtUrl: z.union([z.string().url(), z.string().startsWith("/"), z.literal(""), z.null()]).optional(),
    category: z.string().min(1).default("Technology"),
    language: z.string().min(2).regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*(-[xX]-[a-zA-Z0-9]+)?$/, "Must be a valid BCP-47 language code").default("es"),
    visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PUBLIC"),
  });

export const insertEpisodeSchema = createInsertSchema(episodes)
  .omit({ id: true, audioFileSize: true, coverArtUrl: true, coverArtAssetId: true, audioUrl: true, audioAssetId: true, status: true, visibility: true, approvedAt: true, approvedBy: true })
  .extend({
    title: z.string().min(1, "Title is required"),
    notes: z.string().optional(),
    publishedAt: z.string().datetime().optional(), // Optional: custom publish date
    coverArtUrl: z.union([z.string().url(), z.string().startsWith("/"), z.literal(""), z.null()]).optional(), // Optional: episode-specific cover
    coverArtAssetId: z.string().uuid().optional().nullable(), // Optional: asset reference for cover
    audioUrl: z.union([z.string().url(), z.string().startsWith("/"), z.literal(""), z.null()]).optional(), // Optional: can use audioAssetId instead
    audioAssetId: z.string().uuid().optional().nullable(), // Optional: asset reference for audio
    audioFileSize: z.number().int().positive().optional(),
    visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PUBLIC"),
    status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]).optional(),
    approvedAt: z.string().datetime().optional().nullable(),
    approvedBy: z.string().uuid().optional().nullable(),
  });

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens)
  .omit({ id: true, createdAt: true, usedAt: true });

export const insertEmailConfigSchema = createInsertSchema(emailConfig)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    smtpHost: z.string().min(1, "SMTP host is required"),
    smtpPort: z.number().int().min(1).max(65535).default(587),
    smtpUser: z.string().min(1, "SMTP user is required"),
    smtpPassword: z.string().min(1, "SMTP password is required"),
    fromEmail: z.string().email("Invalid email address"),
    fromName: z.string().min(1).default("PodcastHub"),
  });

export const insertDriveConfigSchema = createInsertSchema(driveConfig)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    serviceAccountEmail: z.string().email("Invalid email address"),
    serviceAccountKey: z.string().min(1, "Service account key is required"),
    folderIdImages: z.string().min(1, "Images folder ID is required"),
    folderIdAudio: z.string().min(1, "Audio folder ID is required"),
  });

export const insertMediaAssetSchema = createInsertSchema(mediaAssets)
  .omit({ id: true, createdAt: true, publicUrl: true });

export const insertPlaylistSchema = createInsertSchema(playlists)
  .omit({ id: true, createdAt: true, updatedAt: true, userId: true })
  .extend({
    name: z.string().min(1, "Playlist name is required").max(200, "Playlist name is too long"),
    description: z.string().max(1000, "Description is too long").optional(),
    isPublic: z.boolean().default(false),
  });

export const insertPlaylistEpisodeSchema = createInsertSchema(playlistEpisodes)
  .omit({ id: true, addedAt: true })
  .extend({
    playlistId: z.string().uuid("Invalid playlist ID"),
    episodeId: z.string().uuid("Invalid episode ID"),
    position: z.number().int().min(0).default(0),
  });

export const insertContentInvitationSchema = createInsertSchema(contentInvitations)
  .omit({ id: true, createdAt: true, userId: true, invitedBy: true })
  .extend({
    email: z.string().email("Invalid email address"),
    podcastId: z.string().uuid().optional(),
    episodeId: z.string().uuid().optional(),
    expiresAt: z.date().optional(),
  })
  .refine(data => data.podcastId || data.episodeId, {
    message: "Either podcastId or episodeId must be provided",
  })
  .refine(data => !(data.podcastId && data.episodeId), {
    message: "Cannot provide both podcastId and episodeId - invitation must target exactly one",
  });

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = insertUserSchema;

// YouTube import schema (deprecated - YouTube blocks automated downloads)
export const youtubeImportSchema = z.object({
  playlistUrl: z.string().url("Invalid URL").refine(
    (url) => url.includes('youtube.com') || url.includes('youtu.be'),
    { message: "Must be a YouTube URL" }
  ),
  maxVideos: z.coerce.number().int().min(1).max(50).default(10),
  selectedVideoIds: z.array(z.string()).optional(), // Optional: if provided, only import these videos
  podcastTitle: z.string().min(1, "Podcast title is required").optional(),
  podcastDescription: z.string().optional(),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PUBLIC"),
});

// Local folder import schema
export const localImportSchema = z.object({
  podcastTitle: z.string().min(1, "Título del podcast requerido"),
  podcastDescription: z.string().min(1, "Descripción del podcast requerida"),
  category: z.string().min(1).default("Technology"),
  language: z.string().min(2).default("es"),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PUBLIC"),
  // Files will be handled by multer, not in Zod schema
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Podcast = typeof podcasts.$inferSelect;
export type InsertPodcast = z.infer<typeof insertPodcastSchema>;
export type Episode = typeof episodes.$inferSelect;
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type EmailConfig = typeof emailConfig.$inferSelect;
export type InsertEmailConfig = z.infer<typeof insertEmailConfigSchema>;
export type DriveConfig = typeof driveConfig.$inferSelect;
export type InsertDriveConfig = z.infer<typeof insertDriveConfigSchema>;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;
export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type PlaylistEpisode = typeof playlistEpisodes.$inferSelect;
export type InsertPlaylistEpisode = z.infer<typeof insertPlaylistEpisodeSchema>;

// Extended types for API responses
export type PodcastWithEpisodes = Podcast & { episodes: Episode[] };
export type PodcastWithOwner = Podcast & { owner: User };
export type PodcastForRSS = Podcast & { owner: User; episodes: Episode[] };
export type EpisodeWithPodcast = Episode & { podcast: Podcast };
export type EpisodeWithUrls = Episode & {
  canonicalUrl: string;
  embedUrl: string;
  shareUrl: string;
  embedCode: string;
};

export type PodcastWithEpisodesAndUrls = Podcast & {
  episodes: EpisodeWithUrls[];
};

export type EpisodeWithPodcastAndUrls = Episode & {
  podcast: Podcast;
  canonicalUrl: string;
  embedUrl: string;
  shareUrl: string;
  embedCode: string;
};

export type Subscription = typeof subscriptions.$inferSelect;
export type PodcastWithSubscription = Podcast & { isSubscribed?: boolean };
export type ContentInvitation = typeof contentInvitations.$inferSelect;
export type InsertContentInvitation = z.infer<typeof insertContentInvitationSchema>;
