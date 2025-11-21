import { 
  users, 
  podcasts, 
  episodes,
  subscriptions,
  contentInvitations,
  emailConfig,
  passwordResetTokens,
  driveConfig,
  mediaAssets,
  playlists,
  playlistEpisodes,
  type User, 
  type InsertUser,
  type Podcast,
  type InsertPodcast,
  type Episode,
  type InsertEpisode,
  type PodcastWithEpisodes,
  type PodcastForRSS,
  type EpisodeWithPodcast,
  type Subscription,
  type ContentInvitation,
  type InsertContentInvitation,
  type EmailConfig,
  type InsertEmailConfig,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type DriveConfig,
  type InsertDriveConfig,
  type MediaAsset,
  type InsertMediaAsset,
  type Playlist,
  type InsertPlaylist,
  type PlaylistEpisode,
  type InsertPlaylistEpisode,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, sql, inArray } from "drizzle-orm";

// Bulk operation response types
export interface BulkOperationResult {
  successIds: string[];
  failed: { id: string; reason: string }[];
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: Omit<InsertUser, 'password'> & { passwordHash: string }): Promise<User>;
  
  // Podcast operations
  getAllPodcasts(): Promise<Podcast[]>;
  getPodcast(id: string): Promise<Podcast | undefined>;
  getPodcastWithEpisodes(id: string): Promise<PodcastWithEpisodes | undefined>;
  getPodcastForRSS(id: string): Promise<PodcastForRSS | undefined>;
  getPodcastsByOwner(userId: string): Promise<(Podcast & { episodeCount: number })[]>;
  createPodcast(podcast: Omit<Podcast, "id" | "createdAt">): Promise<Podcast>;
  updatePodcast(id: string, data: Partial<Pick<Podcast, "title" | "description" | "coverArtUrl" | "coverArtAssetId" | "category" | "language" | "visibility">>): Promise<Podcast>;
  
  // Episode operations
  getEpisode(id: string): Promise<Episode | undefined>;
  getEpisodeWithPodcast(id: string): Promise<EpisodeWithPodcast | undefined>;
  getEpisodesByPodcast(podcastId: string): Promise<Episode[]>;
  createEpisode(episode: InsertEpisode): Promise<Episode>;
  updateEpisode(id: string, data: Partial<Pick<Episode, "title" | "notes" | "coverArtUrl" | "coverArtAssetId" | "visibility" | "audioUrl" | "audioAssetId" | "duration">>): Promise<Episode>;
  
  // Subscription operations
  subscribeToPodcast(userId: string, podcastId: string): Promise<Subscription>;
  unsubscribeFromPodcast(userId: string, podcastId: string): Promise<void>;
  getUserSubscriptions(userId: string): Promise<Podcast[]>;
  isSubscribed(userId: string, podcastId: string): Promise<boolean>;
  
  // Admin operations - User management
  getAllUsers(): Promise<User[]>;
  updateUserRequiresApproval(userId: string, requiresApproval: boolean): Promise<User>;
  updateUserIsActive(userId: string, isActive: boolean): Promise<User>;
  updateUserRole(userId: string, role: "LISTENER" | "CREATOR" | "ADMIN"): Promise<User>;
  
  // Admin operations - Content moderation
  getAllPodcastsWithOwner(): Promise<(Podcast & { owner: User })[]>;
  getAllEpisodesWithPodcast(): Promise<(Episode & { podcast: Podcast })[]>;
  listPodcastsFiltered(status?: string, ownerId?: string, search?: string): Promise<(Podcast & { owner: User })[]>;
  listEpisodesFiltered(status?: string, podcastId?: string, ownerId?: string, search?: string): Promise<(Episode & { podcast: Podcast & { owner: User } })[]>;
  updatePodcastStatus(podcastId: string, status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED", adminId: string): Promise<Podcast>;
  updateEpisodeStatus(episodeId: string, status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED", adminId: string): Promise<Episode>;
  deletePodcast(podcastId: string): Promise<void>;
  deleteEpisode(episodeId: string): Promise<void>;
  
  // Email configuration operations
  getActiveEmailConfig(): Promise<EmailConfig | undefined>;
  getAllEmailConfigs(): Promise<EmailConfig[]>;
  createEmailConfig(config: Omit<EmailConfig, "id" | "createdAt" | "updatedAt">): Promise<EmailConfig>;
  updateEmailConfig(id: string, config: Partial<Omit<EmailConfig, "id" | "createdAt" | "updatedAt">>): Promise<EmailConfig>;
  deleteEmailConfig(id: string): Promise<void>;
  setActiveEmailConfig(id: string): Promise<EmailConfig>;
  
  // Password reset token operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;
  
  // Email verification operations
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  verifyUserEmail(userId: string): Promise<void>;
  updateUserVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  
  // User profile operations
  updateUserProfile(userId: string, data: { username?: string; email?: string; bio?: string; avatarUrl?: string; website?: string }): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  
  // Media asset operations
  createMediaAsset(asset: Omit<MediaAsset, "id" | "createdAt">): Promise<MediaAsset>;
  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  getMediaAssetByStorageKey(storageKey: string): Promise<MediaAsset | undefined>;
  getMediaAssetsByPodcast(podcastId: string): Promise<MediaAsset[]>;
  getMediaAssetsByEpisode(episodeId: string): Promise<MediaAsset[]>;
  deleteMediaAsset(id: string): Promise<void>;
  
  // Google Drive configuration operations
  getActiveDriveConfig(): Promise<DriveConfig | undefined>;
  getAllDriveConfigs(): Promise<DriveConfig[]>;
  createDriveConfig(config: Omit<DriveConfig, "id" | "createdAt" | "updatedAt">): Promise<DriveConfig>;
  updateDriveConfig(id: string, config: Partial<Omit<DriveConfig, "id" | "createdAt" | "updatedAt">>): Promise<DriveConfig>;
  deleteDriveConfig(id: string): Promise<void>;
  setActiveDriveConfig(id: string): Promise<DriveConfig>;
  
  // Bulk operations
  bulkUpdateUsersRole(ids: string[], role: "LISTENER" | "CREATOR" | "ADMIN"): Promise<BulkOperationResult>;
  bulkUpdateUsersActive(ids: string[], isActive: boolean): Promise<BulkOperationResult>;
  bulkDeleteUsers(ids: string[]): Promise<BulkOperationResult>;
  bulkUpdatePodcastsStatus(ids: string[], status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED", adminId: string): Promise<BulkOperationResult>;
  bulkDeletePodcasts(ids: string[]): Promise<BulkOperationResult>;
  bulkUpdateEpisodesStatus(ids: string[], status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED", adminId: string): Promise<BulkOperationResult>;
  bulkDeleteEpisodes(ids: string[]): Promise<BulkOperationResult>;
  
  // Content invitation operations
  createContentInvitation(invitation: Omit<ContentInvitation, "id" | "createdAt" | "userId"> & { invitedBy: string }): Promise<ContentInvitation>;
  getContentInvitationsByPodcast(podcastId: string): Promise<ContentInvitation[]>;
  getContentInvitationsByEpisode(episodeId: string): Promise<ContentInvitation[]>;
  getContentInvitation(id: string): Promise<ContentInvitation | undefined>;
  deleteContentInvitation(id: string): Promise<void>;
  checkUserHasAccessToPodcast(userId: string | undefined, podcastId: string): Promise<boolean>;
  checkUserHasAccessToEpisode(userId: string | undefined, episodeId: string): Promise<boolean>;
  
  // Playlist operations
  createPlaylist(playlist: Omit<Playlist, "id" | "createdAt" | "updatedAt"> & { userId: string }): Promise<Playlist>;
  getPlaylist(id: string): Promise<Playlist | undefined>;
  getUserPlaylists(userId: string): Promise<Playlist[]>;
  getPublicPlaylists(): Promise<Playlist[]>;
  updatePlaylist(id: string, data: Partial<Pick<Playlist, "name" | "description" | "isPublic">>): Promise<Playlist>;
  deletePlaylist(id: string): Promise<void>;
  addEpisodeToPlaylist(playlistId: string, episodeId: string): Promise<PlaylistEpisode>;
  removeEpisodeFromPlaylist(playlistId: string, episodeId: string): Promise<void>;
  getPlaylistEpisodes(playlistId: string): Promise<Episode[]>;
  isEpisodeInPlaylist(playlistId: string, episodeId: string): Promise<boolean>;
  reorderPlaylistEpisodes(playlistId: string, episodeIds: string[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: Omit<InsertUser, 'password'> & { passwordHash: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Podcast operations
  async getAllPodcasts(): Promise<Podcast[]> {
    return await db.select().from(podcasts);
  }

  async getPodcast(id: string): Promise<Podcast | undefined> {
    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
    return podcast || undefined;
  }

  async getPodcastWithEpisodes(id: string): Promise<PodcastWithEpisodes | undefined> {
    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
    if (!podcast) return undefined;

    const podcastEpisodes = await db.select().from(episodes).where(eq(episodes.podcastId, id));
    
    return {
      ...podcast,
      episodes: podcastEpisodes,
    };
  }

  async getPodcastForRSS(id: string): Promise<PodcastForRSS | undefined> {
    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
    if (!podcast) return undefined;

    const owner = await this.getUser(podcast.ownerId);
    if (!owner) return undefined;

    const podcastEpisodes = await db
      .select()
      .from(episodes)
      .where(eq(episodes.podcastId, id))
      .orderBy(desc(episodes.publishedAt));
    
    return {
      ...podcast,
      owner,
      episodes: podcastEpisodes,
    };
  }

  async getPodcastsByOwner(userId: string): Promise<(Podcast & { episodeCount: number })[]> {
    const result = await db
      .select({
        podcast: podcasts,
        episodeCount: sql<number>`cast(count(${episodes.id}) as int)`,
      })
      .from(podcasts)
      .leftJoin(episodes, eq(podcasts.id, episodes.podcastId))
      .where(eq(podcasts.ownerId, userId))
      .groupBy(podcasts.id)
      .orderBy(desc(podcasts.createdAt));
    
    return result.map(r => ({ ...r.podcast, episodeCount: r.episodeCount }));
  }

  async createPodcast(insertPodcast: Omit<Podcast, "id" | "createdAt">): Promise<Podcast> {
    // Determine status based on owner's requiresApproval setting
    const owner = await this.getUser(insertPodcast.ownerId);
    const status = (owner?.requiresApproval === false) ? "APPROVED" : "PENDING_APPROVAL";
    
    const podcastData: any = {
      ...insertPodcast,
      status,
    };
    
    // If auto-approved, set approval metadata
    if (status === "APPROVED") {
      podcastData.approvedAt = new Date();
      podcastData.approvedBy = insertPodcast.ownerId; // Self-approved
    }
    
    const [podcast] = await db
      .insert(podcasts)
      .values(podcastData)
      .returning();
    return podcast;
  }

  // Episode operations
  async getEpisode(id: string): Promise<Episode | undefined> {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, id));
    return episode || undefined;
  }

  async getEpisodeWithPodcast(id: string): Promise<EpisodeWithPodcast | undefined> {
    const result = await db
      .select({
        episode: episodes,
        podcast: podcasts,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(episodes.id, id));
    
    if (result.length === 0) return undefined;
    
    return {
      ...result[0].episode,
      podcast: result[0].podcast,
    };
  }

  async getEpisodesByPodcast(podcastId: string): Promise<Episode[]> {
    return await db.select().from(episodes).where(eq(episodes.podcastId, podcastId));
  }

  async createEpisode(insertEpisode: InsertEpisode): Promise<Episode> {
    // Get podcast to determine owner
    const podcast = await this.getPodcast(insertEpisode.podcastId);
    if (!podcast) {
      throw new Error("Podcast not found");
    }
    
    // Determine status based on owner's requiresApproval setting
    const owner = await this.getUser(podcast.ownerId);
    const status = (owner?.requiresApproval === false) ? "APPROVED" : "PENDING_APPROVAL";
    
    const episodeData: any = {
      ...insertEpisode,
      status,
    };
    
    // If auto-approved, set approval metadata
    if (status === "APPROVED") {
      episodeData.approvedAt = new Date();
      episodeData.approvedBy = podcast.ownerId; // Self-approved
    }
    
    const [episode] = await db
      .insert(episodes)
      .values(episodeData)
      .returning();
    return episode;
  }

  async updatePodcast(id: string, data: Partial<Pick<Podcast, "title" | "description" | "coverArtUrl" | "coverArtAssetId" | "category" | "language" | "visibility">>): Promise<Podcast> {
    const [updated] = await db
      .update(podcasts)
      .set(data)
      .where(eq(podcasts.id, id))
      .returning();
    
    if (!updated) {
      throw new Error("Podcast not found");
    }
    
    return updated;
  }

  async updateEpisode(id: string, data: Partial<Pick<Episode, "title" | "notes" | "coverArtUrl" | "coverArtAssetId" | "visibility" | "audioUrl" | "audioAssetId" | "duration">>): Promise<Episode> {
    const [updated] = await db
      .update(episodes)
      .set(data)
      .where(eq(episodes.id, id))
      .returning();
    
    if (!updated) {
      throw new Error("Episode not found");
    }
    
    return updated;
  }

  // Subscription operations
  async subscribeToPodcast(userId: string, podcastId: string): Promise<Subscription> {
    // Check if already subscribed
    const existing = await this.isSubscribed(userId, podcastId);
    if (existing) {
      // Return existing subscription
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.podcastId, podcastId)
        ))
        .limit(1);
      return sub;
    }
    
    const [subscription] = await db
      .insert(subscriptions)
      .values({ userId, podcastId })
      .returning();
    return subscription;
  }

  async unsubscribeFromPodcast(userId: string, podcastId: string): Promise<void> {
    await db
      .delete(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.podcastId, podcastId)
      ));
  }

  async getUserSubscriptions(userId: string): Promise<Podcast[]> {
    const result = await db
      .select({ podcast: podcasts })
      .from(subscriptions)
      .innerJoin(podcasts, eq(subscriptions.podcastId, podcasts.id))
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
    
    return result.map(r => r.podcast);
  }

  async isSubscribed(userId: string, podcastId: string): Promise<boolean> {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.podcastId, podcastId)
      ))
      .limit(1);
    
    return !!sub;
  }

  // Admin operations - User management
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRequiresApproval(userId: string, requiresApproval: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ requiresApproval })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserIsActive(userId: string, isActive: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserRole(userId: string, role: "LISTENER" | "CREATOR" | "ADMIN"): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Admin operations - Content moderation
  async getAllPodcastsWithOwner(): Promise<(Podcast & { owner: User })[]> {
    const result = await db
      .select({
        podcast: podcasts,
        owner: users,
      })
      .from(podcasts)
      .innerJoin(users, eq(podcasts.ownerId, users.id))
      .orderBy(desc(podcasts.createdAt));
    
    return result.map(r => ({ ...r.podcast, owner: r.owner }));
  }

  async getAllEpisodesWithPodcast(): Promise<(Episode & { podcast: Podcast })[]> {
    const result = await db
      .select({
        episode: episodes,
        podcast: podcasts,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .orderBy(desc(episodes.publishedAt));
    
    return result.map(r => ({ ...r.episode, podcast: r.podcast }));
  }

  async listPodcastsFiltered(
    status?: string,
    ownerId?: string,
    search?: string
  ): Promise<(Podcast & { owner: User })[]> {
    const conditions = [];
    
    if (status) {
      conditions.push(eq(podcasts.status, status as any));
    }
    if (ownerId) {
      conditions.push(eq(podcasts.ownerId, ownerId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(podcasts.title, `%${search}%`),
          ilike(podcasts.description, `%${search}%`)
        )
      );
    }

    const result = await db
      .select({
        podcast: podcasts,
        owner: users,
      })
      .from(podcasts)
      .innerJoin(users, eq(podcasts.ownerId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(podcasts.createdAt));
    
    return result.map(r => ({ ...r.podcast, owner: r.owner }));
  }

  async listEpisodesFiltered(
    status?: string,
    podcastId?: string,
    ownerId?: string,
    search?: string
  ): Promise<(Episode & { podcast: Podcast & { owner: User } })[]> {
    const conditions = [];
    
    if (status) {
      conditions.push(eq(episodes.status, status as any));
    }
    if (podcastId) {
      conditions.push(eq(episodes.podcastId, podcastId));
    }
    if (ownerId) {
      conditions.push(eq(podcasts.ownerId, ownerId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(episodes.title, `%${search}%`),
          ilike(episodes.notes, `%${search}%`),
          ilike(podcasts.title, `%${search}%`)
        )
      );
    }

    const result = await db
      .select({
        episode: episodes,
        podcast: podcasts,
        owner: users,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .innerJoin(users, eq(podcasts.ownerId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(episodes.publishedAt));
    
    return result.map(r => ({ 
      ...r.episode, 
      podcast: { ...r.podcast, owner: r.owner } 
    }));
  }

  async updatePodcastStatus(
    podcastId: string, 
    status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED", 
    adminId: string
  ): Promise<Podcast> {
    const updateData: any = { status };
    
    if (status === "APPROVED") {
      updateData.approvedAt = new Date();
      updateData.approvedBy = adminId;
    }
    
    const [podcast] = await db
      .update(podcasts)
      .set(updateData)
      .where(eq(podcasts.id, podcastId))
      .returning();
    return podcast;
  }

  async updateEpisodeStatus(
    episodeId: string, 
    status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED", 
    adminId: string
  ): Promise<Episode> {
    const updateData: any = { status };
    
    if (status === "APPROVED") {
      updateData.approvedAt = new Date();
      updateData.approvedBy = adminId;
    }
    
    const [episode] = await db
      .update(episodes)
      .set(updateData)
      .where(eq(episodes.id, episodeId))
      .returning();
    return episode;
  }

  async deletePodcast(podcastId: string): Promise<void> {
    // Delete in transaction: first subscriptions, then episodes, then podcast
    await db.transaction(async (tx) => {
      // Delete subscriptions
      await tx.delete(subscriptions).where(eq(subscriptions.podcastId, podcastId));
      // Delete episodes
      await tx.delete(episodes).where(eq(episodes.podcastId, podcastId));
      // Delete podcast
      await tx.delete(podcasts).where(eq(podcasts.id, podcastId));
    });
  }

  async deleteEpisode(episodeId: string): Promise<void> {
    await db.delete(episodes).where(eq(episodes.id, episodeId));
  }

  // Email configuration operations
  async getActiveEmailConfig(): Promise<EmailConfig | undefined> {
    const [config] = await db
      .select()
      .from(emailConfig)
      .where(eq(emailConfig.isActive, true));
    return config || undefined;
  }

  async getAllEmailConfigs(): Promise<EmailConfig[]> {
    return await db.select().from(emailConfig).orderBy(desc(emailConfig.createdAt));
  }

  async createEmailConfig(config: Omit<EmailConfig, "id" | "createdAt" | "updatedAt">): Promise<EmailConfig> {
    // Deactivate all other configs first if this one is active
    if (config.isActive === true) {
      await db.update(emailConfig).set({ isActive: false });
    }

    const [newConfig] = await db
      .insert(emailConfig)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateEmailConfig(id: string, config: Partial<Omit<EmailConfig, "id" | "createdAt" | "updatedAt">>): Promise<EmailConfig> {
    // If setting this config as active, deactivate all others first
    if (config.isActive === true) {
      await db.update(emailConfig).set({ isActive: false });
    }

    const [updated] = await db
      .update(emailConfig)
      .set({ ...config, updatedAt: new Date() })
      .where(eq(emailConfig.id, id))
      .returning();
    return updated;
  }

  async deleteEmailConfig(id: string): Promise<void> {
    await db.delete(emailConfig).where(eq(emailConfig.id, id));
  }

  async setActiveEmailConfig(id: string): Promise<EmailConfig> {
    // Deactivate all configs
    await db.update(emailConfig).set({ isActive: false });
    
    // Activate the selected one
    const [active] = await db
      .update(emailConfig)
      .set({ isActive: true })
      .where(eq(emailConfig.id, id))
      .returning();
    return active;
  }

  // Password reset token operations
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [resetToken] = await db
      .insert(passwordResetTokens)
      .values(token)
      .returning();
    return resetToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken || undefined;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(sql`${passwordResetTokens.expiresAt} < NOW()`);
  }

  // User profile operations
  async updateUserProfile(userId: string, data: { username?: string; email?: string; bio?: string; avatarUrl?: string; website?: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
  }

  // Email verification operations
  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token));
    return user || undefined;
  }

  async verifyUserEmail(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null
      })
      .where(eq(users.id, userId));
  }

  async updateUserVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        emailVerificationToken: token,
        emailVerificationTokenExpiresAt: expiresAt
      })
      .where(eq(users.id, userId));
  }

  // Media asset operations
  async createMediaAsset(asset: Omit<MediaAsset, "id" | "createdAt">): Promise<MediaAsset> {
    const [newAsset] = await db
      .insert(mediaAssets)
      .values(asset)
      .returning();
    return newAsset;
  }

  async getMediaAsset(id: string): Promise<MediaAsset | undefined> {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id));
    return asset || undefined;
  }

  async getMediaAssetByStorageKey(storageKey: string): Promise<MediaAsset | undefined> {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.storageKey, storageKey));
    return asset || undefined;
  }

  async getMediaAssetsByPodcast(podcastId: string): Promise<MediaAsset[]> {
    return await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.podcastId, podcastId));
  }

  async getMediaAssetsByEpisode(episodeId: string): Promise<MediaAsset[]> {
    return await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.episodeId, episodeId));
  }

  async deleteMediaAsset(id: string): Promise<void> {
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  }

  // Google Drive configuration operations
  async getActiveDriveConfig(): Promise<DriveConfig | undefined> {
    const [config] = await db
      .select()
      .from(driveConfig)
      .where(eq(driveConfig.isActive, true))
      .limit(1);
    return config || undefined;
  }

  async getAllDriveConfigs(): Promise<DriveConfig[]> {
    return await db.select().from(driveConfig).orderBy(desc(driveConfig.createdAt));
  }

  async createDriveConfig(config: Omit<DriveConfig, "id" | "createdAt" | "updatedAt">): Promise<DriveConfig> {
    // Deactivate all other configs first if this one is active
    if (config.isActive === true) {
      await db.update(driveConfig).set({ isActive: false });
    }

    const [newConfig] = await db
      .insert(driveConfig)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateDriveConfig(id: string, config: Partial<Omit<DriveConfig, "id" | "createdAt" | "updatedAt">>): Promise<DriveConfig> {
    // If setting this config as active, deactivate all others first
    if (config.isActive === true) {
      await db.update(driveConfig).set({ isActive: false });
    }

    // Filter out undefined values to avoid overwriting with NULL
    const updateData: any = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(driveConfig)
      .set(updateData)
      .where(eq(driveConfig.id, id))
      .returning();
    return updated;
  }

  async deleteDriveConfig(id: string): Promise<void> {
    await db.delete(driveConfig).where(eq(driveConfig.id, id));
  }

  async setActiveDriveConfig(id: string): Promise<DriveConfig> {
    // Deactivate all configs
    await db.update(driveConfig).set({ isActive: false });
    
    // Activate the selected one
    const [active] = await db
      .update(driveConfig)
      .set({ isActive: true })
      .where(eq(driveConfig.id, id))
      .returning();
    return active;
  }

  // Bulk operations
  async bulkUpdateUsersRole(ids: string[], role: "LISTENER" | "CREATOR" | "ADMIN"): Promise<BulkOperationResult> {
    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      // First, find which users exist
      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, uniqueIds));
      
      const existingIds = existingUsers.map(u => u.id);
      
      // Mark non-existent users as failed
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "User not found" });
        }
      }

      // Update existing users
      if (existingIds.length > 0) {
        const updated = await tx
          .update(users)
          .set({ role })
          .where(inArray(users.id, existingIds))
          .returning({ id: users.id });
        
        successIds.push(...updated.map(u => u.id));
      }
    });

    return { successIds, failed };
  }

  async bulkUpdateUsersActive(ids: string[], isActive: boolean): Promise<BulkOperationResult> {
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, uniqueIds));
      
      const existingIds = existingUsers.map(u => u.id);
      
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "User not found" });
        }
      }

      if (existingIds.length > 0) {
        const updated = await tx
          .update(users)
          .set({ isActive })
          .where(inArray(users.id, existingIds))
          .returning({ id: users.id });
        
        successIds.push(...updated.map(u => u.id));
      }
    });

    return { successIds, failed };
  }

  async bulkDeleteUsers(ids: string[]): Promise<BulkOperationResult> {
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, uniqueIds));
      
      const existingIds = existingUsers.map(u => u.id);
      
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "User not found" });
        }
      }

      if (existingIds.length > 0) {
        // Delete user subscriptions first (cascading)
        await tx.delete(subscriptions).where(inArray(subscriptions.userId, existingIds));
        
        // Delete password reset tokens
        await tx.delete(passwordResetTokens).where(inArray(passwordResetTokens.userId, existingIds));
        
        // Delete users
        const deleted = await tx
          .delete(users)
          .where(inArray(users.id, existingIds))
          .returning({ id: users.id });
        
        successIds.push(...deleted.map(u => u.id));
      }
    });

    return { successIds, failed };
  }

  async bulkUpdatePodcastsStatus(
    ids: string[],
    status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED",
    adminId: string
  ): Promise<BulkOperationResult> {
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      const existingPodcasts = await tx
        .select({ id: podcasts.id })
        .from(podcasts)
        .where(inArray(podcasts.id, uniqueIds));
      
      const existingIds = existingPodcasts.map(p => p.id);
      
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "Podcast not found" });
        }
      }

      if (existingIds.length > 0) {
        const updated = await tx
          .update(podcasts)
          .set({ 
            status,
            approvedBy: adminId,
            approvedAt: new Date(),
          })
          .where(inArray(podcasts.id, existingIds))
          .returning({ id: podcasts.id });
        
        successIds.push(...updated.map(p => p.id));
      }
    });

    return { successIds, failed };
  }

  async bulkDeletePodcasts(ids: string[]): Promise<BulkOperationResult> {
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      const existingPodcasts = await tx
        .select({ id: podcasts.id })
        .from(podcasts)
        .where(inArray(podcasts.id, uniqueIds));
      
      const existingIds = existingPodcasts.map(p => p.id);
      
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "Podcast not found" });
        }
      }

      if (existingIds.length > 0) {
        // Delete cascading: subscriptions, media assets, episodes, then podcasts
        await tx.delete(subscriptions).where(inArray(subscriptions.podcastId, existingIds));
        await tx.delete(mediaAssets).where(inArray(mediaAssets.podcastId, existingIds));
        await tx.delete(episodes).where(inArray(episodes.podcastId, existingIds));
        
        const deleted = await tx
          .delete(podcasts)
          .where(inArray(podcasts.id, existingIds))
          .returning({ id: podcasts.id });
        
        successIds.push(...deleted.map(p => p.id));
      }
    });

    return { successIds, failed };
  }

  async bulkUpdateEpisodesStatus(
    ids: string[],
    status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED",
    adminId: string
  ): Promise<BulkOperationResult> {
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      const existingEpisodes = await tx
        .select({ id: episodes.id })
        .from(episodes)
        .where(inArray(episodes.id, uniqueIds));
      
      const existingIds = existingEpisodes.map(e => e.id);
      
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "Episode not found" });
        }
      }

      if (existingIds.length > 0) {
        const updated = await tx
          .update(episodes)
          .set({ 
            status,
            approvedBy: adminId,
            approvedAt: new Date(),
          })
          .where(inArray(episodes.id, existingIds))
          .returning({ id: episodes.id });
        
        successIds.push(...updated.map(e => e.id));
      }
    });

    return { successIds, failed };
  }

  async bulkDeleteEpisodes(ids: string[]): Promise<BulkOperationResult> {
    const uniqueIds = Array.from(new Set(ids));
    const successIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      const existingEpisodes = await tx
        .select({ id: episodes.id })
        .from(episodes)
        .where(inArray(episodes.id, uniqueIds));
      
      const existingIds = existingEpisodes.map(e => e.id);
      
      for (const id of uniqueIds) {
        if (!existingIds.includes(id)) {
          failed.push({ id, reason: "Episode not found" });
        }
      }

      if (existingIds.length > 0) {
        const deleted = await tx
          .delete(episodes)
          .where(inArray(episodes.id, existingIds))
          .returning({ id: episodes.id });
        
        successIds.push(...deleted.map(e => e.id));
      }
    });

    return { successIds, failed };
  }

  // Content invitation operations
  async createContentInvitation(invitation: Omit<ContentInvitation, "id" | "createdAt" | "userId"> & { invitedBy: string }): Promise<ContentInvitation> {
    // Check if user exists with this email
    const existingUser = await this.getUserByEmail(invitation.email);
    
    const [createdInvitation] = await db
      .insert(contentInvitations)
      .values({
        email: invitation.email,
        userId: existingUser?.id || null,
        podcastId: invitation.podcastId || null,
        episodeId: invitation.episodeId || null,
        invitedBy: invitation.invitedBy,
        expiresAt: invitation.expiresAt || null,
      })
      .returning();
    
    return createdInvitation;
  }

  async getContentInvitationsByPodcast(podcastId: string): Promise<ContentInvitation[]> {
    return await db
      .select()
      .from(contentInvitations)
      .where(eq(contentInvitations.podcastId, podcastId));
  }

  async getContentInvitationsByEpisode(episodeId: string): Promise<ContentInvitation[]> {
    return await db
      .select()
      .from(contentInvitations)
      .where(eq(contentInvitations.episodeId, episodeId));
  }

  async getContentInvitation(id: string): Promise<ContentInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(contentInvitations)
      .where(eq(contentInvitations.id, id));
    return invitation || undefined;
  }

  async deleteContentInvitation(id: string): Promise<void> {
    await db.delete(contentInvitations).where(eq(contentInvitations.id, id));
  }

  async checkUserHasAccessToPodcast(userId: string | undefined, podcastId: string): Promise<boolean> {
    // Get the podcast
    const podcast = await this.getPodcast(podcastId);
    if (!podcast) return false;

    // Owner always has access
    if (userId && podcast.ownerId === userId) return true;

    // Admins always have access
    if (userId) {
      const user = await this.getUser(userId);
      if (user?.role === "ADMIN") return true;
    }

    // Public podcasts are accessible to everyone
    if (podcast.visibility === "PUBLIC") return true;

    // Private/Unlisted podcasts require invitation
    if (!userId) return false; // Not logged in

    // Check if user has been invited
    const user = await this.getUser(userId);
    if (!user) return false;

    const invitations = await db
      .select()
      .from(contentInvitations)
      .where(
        and(
          eq(contentInvitations.podcastId, podcastId),
          or(
            eq(contentInvitations.email, user.email),
            eq(contentInvitations.userId, userId)
          )
        )
      );

    return invitations.length > 0;
  }

  async checkUserHasAccessToEpisode(userId: string | undefined, episodeId: string): Promise<boolean> {
    // Get the episode with its podcast
    const episodeData = await this.getEpisodeWithPodcast(episodeId);
    if (!episodeData) return false;

    const { podcast, ...episode } = episodeData;

    // Owner always has access
    if (userId && podcast.ownerId === userId) return true;

    // Admins always have access
    if (userId) {
      const user = await this.getUser(userId);
      if (user?.role === "ADMIN") return true;
    }

    // Check podcast visibility first
    const hasPodcastAccess = await this.checkUserHasAccessToPodcast(userId, podcast.id);
    if (!hasPodcastAccess) return false;

    // If episode visibility is PUBLIC, and user has podcast access, grant access
    if (episode.visibility === "PUBLIC") return true;

    // Private/Unlisted episodes require specific invitation
    if (!userId) return false; // Not logged in

    const user = await this.getUser(userId);
    if (!user) return false;

    // Check if user has episode-specific invitation
    const invitations = await db
      .select()
      .from(contentInvitations)
      .where(
        and(
          eq(contentInvitations.episodeId, episodeId),
          or(
            eq(contentInvitations.email, user.email),
            eq(contentInvitations.userId, userId)
          )
        )
      );

    return invitations.length > 0;
  }

  // Playlist operations
  async createPlaylist(playlist: Omit<Playlist, "id" | "createdAt" | "updatedAt"> & { userId: string }): Promise<Playlist> {
    const [newPlaylist] = await db
      .insert(playlists)
      .values(playlist)
      .returning();
    return newPlaylist;
  }

  async getPlaylist(id: string): Promise<Playlist | undefined> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, id));
    return playlist || undefined;
  }

  async getUserPlaylists(userId: string): Promise<Playlist[]> {
    return await db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, userId))
      .orderBy(desc(playlists.updatedAt));
  }

  async getPublicPlaylists(): Promise<Playlist[]> {
    return await db
      .select()
      .from(playlists)
      .where(eq(playlists.isPublic, true))
      .orderBy(desc(playlists.updatedAt));
  }

  async updatePlaylist(id: string, data: Partial<Pick<Playlist, "name" | "description" | "isPublic">>): Promise<Playlist> {
    const [updated] = await db
      .update(playlists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playlists.id, id))
      .returning();
    return updated;
  }

  async deletePlaylist(id: string): Promise<void> {
    await db.delete(playlists).where(eq(playlists.id, id));
  }

  async addEpisodeToPlaylist(playlistId: string, episodeId: string): Promise<PlaylistEpisode> {
    // Get current max position
    const existingEpisodes = await db
      .select()
      .from(playlistEpisodes)
      .where(eq(playlistEpisodes.playlistId, playlistId));
    
    const maxPosition = existingEpisodes.length > 0 
      ? Math.max(...existingEpisodes.map(e => e.position)) 
      : -1;

    const [added] = await db
      .insert(playlistEpisodes)
      .values({
        playlistId,
        episodeId,
        position: maxPosition + 1,
      })
      .returning();

    // Update playlist's updatedAt
    await db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));

    return added;
  }

  async removeEpisodeFromPlaylist(playlistId: string, episodeId: string): Promise<void> {
    await db
      .delete(playlistEpisodes)
      .where(
        and(
          eq(playlistEpisodes.playlistId, playlistId),
          eq(playlistEpisodes.episodeId, episodeId)
        )
      );

    // Update playlist's updatedAt
    await db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));
  }

  async getPlaylistEpisodes(playlistId: string): Promise<Episode[]> {
    const result = await db
      .select({
        episode: episodes,
        position: playlistEpisodes.position,
      })
      .from(playlistEpisodes)
      .innerJoin(episodes, eq(playlistEpisodes.episodeId, episodes.id))
      .where(eq(playlistEpisodes.playlistId, playlistId))
      .orderBy(playlistEpisodes.position);

    return result.map(r => r.episode);
  }

  async isEpisodeInPlaylist(playlistId: string, episodeId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(playlistEpisodes)
      .where(
        and(
          eq(playlistEpisodes.playlistId, playlistId),
          eq(playlistEpisodes.episodeId, episodeId)
        )
      );
    return !!result;
  }

  async reorderPlaylistEpisodes(playlistId: string, episodeIds: string[]): Promise<void> {
    // Update positions for all episodes in the playlist
    for (let i = 0; i < episodeIds.length; i++) {
      await db
        .update(playlistEpisodes)
        .set({ position: i })
        .where(
          and(
            eq(playlistEpisodes.playlistId, playlistId),
            eq(playlistEpisodes.episodeId, episodeIds[i])
          )
        );
    }

    // Update playlist's updatedAt
    await db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));
  }
}

export const storage = new DatabaseStorage();
