import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPodcastSchema, insertEpisodeSchema, registerSchema, loginSchema, youtubeImportSchema, localImportSchema, insertPlaylistSchema } from "@shared/schema";
import { 
  updateUserRoleSchema, 
  updateUserApprovalSchema, 
  updateUserActiveSchema,
  updatePodcastStatusSchema,
  updateEpisodeStatusSchema,
  adminPodcastsQuerySchema,
  adminEpisodesQuerySchema,
  createEmailConfigSchema,
  updateEmailConfigSchema,
  createDriveConfigSchema,
  updateDriveConfigSchema,
  testDriveConfigSchema,
  bulkDeleteUsersSchema,
  bulkUpdateUsersRoleSchema,
  bulkUpdateUsersActiveSchema,
  bulkDeletePodcastsSchema,
  bulkUpdatePodcastsStatusSchema,
  bulkDeleteEpisodesSchema,
  bulkUpdateEpisodesStatusSchema,
} from "@shared/admin-schemas";
import { generateRSSFeed } from "./rss-generator";
import { getSiteUrl, getEpisodeCanonicalUrl, getEpisodeEmbedUrl, getEpisodeShareUrl, getEmbedIframeCode } from "./url-helpers";
import { resolveEpisodeArtwork, resolveEpisodeAudioUrl, resolvePodcastCoverArtUrl } from "./serializers/episode";
import { getEpisodeForResponse } from "./storage-service";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import { mediaOrchestrator } from "./media-orchestrator";
import { getEmailService } from "./email";
import { 
  getPlaylistMetadata, 
  getPlaylistVideos, 
  downloadAudioFromVideo, 
  downloadThumbnail,
  uploadAudioToStorage,
  uploadImageToStorage,
  cleanupTempFiles
} from "./youtube-import";
import path from "path";
import os from "os";
import fs from "fs";
import { parseFile, parseBuffer } from "music-metadata";

// Middleware to require authentication
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized - Please login" });
  }
  
  try {
    // Check if user is active
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      // User is deactivated, destroy session and clear cookie
      req.session.destroy(() => {});
      res.clearCookie("connect.sid");
      return res.status(403).json({ error: "Forbidden - Account deactivated" });
    }
    next();
  } catch (error) {
    console.error("Error checking user status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Middleware to require admin role
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized - Please login" });
  }
  
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden - Admin access required" });
    }
    next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Multer configuration for regular file uploads (images, single audio)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max (for audio files)
  },
  fileFilter: (req, file, cb) => {
    // Allow images and audio files
    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedAudioMimes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'];
    const allAllowedMimes = [...allowedImageMimes, ...allowedAudioMimes];

    if (allAllowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allAllowedMimes.join(', ')}`));
    }
  },
});

// Multer configuration for bulk local import (disk-based to avoid RAM exhaustion)
const uploadLocalImport = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Use /tmp directory for temporary storage
      cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
      // Generate unique filename to avoid collisions
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, `${file.fieldname}-${uniqueSuffix}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 51, // Max 50 audio files + 1 cover art
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audioFiles') {
      // Only allow MP3 for audio files
      const allowedAudioMimes = ['audio/mpeg', 'audio/mp3'];
      if (allowedAudioMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.mp3')) {
        cb(null, true);
      } else {
        cb(new Error('Only MP3 audio files are allowed'));
      }
    } else if (file.fieldname === 'coverArt') {
      // Allow images for cover art
      const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowedImageMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, or WebP images are allowed for cover art'));
      }
    } else {
      cb(new Error('Unexpected field'));
    }
  },
});

// Multer configuration for single audio file replacement (disk-based)
const uploadSingleAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, `audioFile-${uniqueSuffix}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedAudioMimes = ['audio/mpeg', 'audio/mp3'];
    if (allowedAudioMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.mp3')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos MP3'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Multer error handling middleware - must be registered after upload routes
  const handleMulterError = (error: any, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Images must be ≤2MB, audio files ≤500MB.' });
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Unexpected field name in upload.' });
      }
      return res.status(400).json({ error: `Upload error: ${error.message}` });
    }
    
    // Handle custom file filter errors
    if (error.message && error.message.startsWith('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }
    
    // Pass to next error handler
    next(error);
  };

  // ==================== AUTH ROUTES ====================
  
  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email" });
      }

      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(validatedData.password, 10);
      
      // Generate email verification token (valid for 24 hours)
      const verificationToken = await bcrypt.hash(`${validatedData.email}-${Date.now()}`, 10);
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Create user
      const user = await storage.createUser({
        ...validatedData,
        passwordHash,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: verificationExpiresAt,
      });

      // Set session
      req.session.userId = user.id;
      
      // Send verification email
      try {
        const emailService = await getEmailService(storage);
        const verificationUrl = `${getSiteUrl(req)}/verify-email?token=${encodeURIComponent(verificationToken)}`;
        await emailService.sendEmailVerification(user.email, user.username, verificationUrl);
        console.log(`Verification email sent to ${user.email}`);
        console.log(`Verification URL: ${verificationUrl}`);
      } catch (emailError) {
        // Log error but don't fail registration
        console.error(`Failed to send verification email to ${user.email}:`, emailError);
      }
      
      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error registering user:", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Set session
      req.session.userId = user.id;
      
      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // ==================== PROFILE ROUTES ====================
  
  // Get user profile
  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Update user profile
  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const updateSchema = z.object({
        username: z.string().min(3).max(50).optional(),
        email: z.string().email().optional(),
        bio: z.string().max(500).optional(),
        avatarUrl: z.string().url().optional().or(z.literal("")),
        website: z.string().url().optional().or(z.literal("")),
      });

      const validatedData = updateSchema.parse(req.body);

      // Check if username or email already exists (if being updated)
      if (validatedData.username) {
        const existingUser = await storage.getUserByUsername(validatedData.username);
        if (existingUser && existingUser.id !== req.session.userId) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      if (validatedData.email) {
        const existingUser = await storage.getUserByEmail(validatedData.email);
        if (existingUser && existingUser.id !== req.session.userId) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }

      const updatedUser = await storage.updateUserProfile(req.session.userId!, validatedData);
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Change password
  app.patch("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const passwordSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
      });

      const validatedData = passwordSchema.parse(req.body);

      // Verify current password
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValidPassword = await bcrypt.compare(validatedData.currentPassword, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password and update
      const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 10);
      await storage.updateUserPassword(req.session.userId!, newPasswordHash);

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // Request password reset
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email("Invalid email address"),
      });

      const { email } = schema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      // Always return success even if user doesn't exist (security best practice)
      if (!user) {
        return res.json({ message: "If an account exists with that email, a password reset link has been sent." });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Save token to database
      await storage.createPasswordResetToken({
        token: resetToken,
        userId: user.id,
        expiresAt,
      });

      // Send password reset email
      const resetUrl = `${getSiteUrl(req)}/reset-password?token=${resetToken}`;
      
      try {
        const emailService = await getEmailService(storage);
        await emailService.sendPasswordResetEmail(user.email, user.username, resetUrl);
        console.log(`Password reset email sent to ${email}`);
      } catch (emailError) {
        // Log error but don't fail the request (for security, don't reveal if email failed)
        console.error(`Failed to send password reset email to ${email}:`, emailError);
        // Still log the reset URL for development/debugging
        console.log(`Reset URL (email failed): ${resetUrl}`);
      }

      res.json({ message: "If an account exists with that email, a password reset link has been sent." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error requesting password reset:", error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const schema = z.object({
        token: z.string().min(1, "Token is required"),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      });

      const { token, newPassword } = schema.parse(req.body);

      // Get token from database
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (resetToken.expiresAt < new Date()) {
        return res.status(400).json({ error: "Reset token has expired" });
      }

      // Check if token has already been used
      if (resetToken.usedAt) {
        return res.status(400).json({ error: "Reset token has already been used" });
      }

      // Hash new password and update user
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(resetToken.userId, passwordHash);

      // Mark token as used
      await storage.markPasswordResetTokenUsed(token);

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error resetting password:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Verify email with token
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const schema = z.object({
        token: z.string().min(1, "Token is required"),
      });

      const { token } = schema.parse(req.body);

      // Find user by verification token
      const user = await storage.getUserByVerificationToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      // Check if token is expired
      if (user.emailVerificationTokenExpiresAt && user.emailVerificationTokenExpiresAt < new Date()) {
        return res.status(400).json({ error: "Verification token has expired" });
      }

      // Check if email is already verified
      if (user.emailVerified) {
        return res.json({ message: "Email already verified" });
      }

      // Mark email as verified and clear token
      await storage.verifyUserEmail(user.id);

      res.json({ message: "Email verified successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error verifying email:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }

      // Generate new verification token (valid for 24 hours)
      const verificationToken = await bcrypt.hash(`${user.email}-${Date.now()}`, 10);
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Update user with new token
      await storage.updateUserVerificationToken(user.id, verificationToken, verificationExpiresAt);

      // Send verification email
      try {
        const emailService = await getEmailService(storage);
        const verificationUrl = `${getSiteUrl(req)}/verify-email?token=${encodeURIComponent(verificationToken)}`;
        await emailService.sendEmailVerification(user.email, user.username, verificationUrl);
        console.log(`Verification email resent to ${user.email}`);
        console.log(`Verification URL: ${verificationUrl}`);
      } catch (emailError) {
        console.error(`Failed to resend verification email to ${user.email}:`, emailError);
        return res.status(500).json({ error: "Failed to send verification email" });
      }

      res.json({ message: "Verification email sent" });
    } catch (error) {
      console.error("Error resending verification email:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // ==================== UPLOAD ROUTES ====================
  
  // Upload cover art image (protected - requires authentication)
  app.post("/api/uploads/cover", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Validate file type is image
      const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedImageMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, and WebP images are allowed." });
      }

      // Validate file size (2MB for images)
      const maxImageSize = 2 * 1024 * 1024; // 2MB
      if (req.file.size > maxImageSize) {
        return res.status(400).json({ error: "File too large. Maximum size for images is 2MB." });
      }

      // Optional: podcastId from query/body for linking
      const podcastId = req.body.podcastId || req.query.podcastId as string | undefined;

      // Save file using media orchestrator
      const asset = await mediaOrchestrator.saveCoverArt(req.file, req.session.userId!, podcastId);

      res.status(201).json({
        id: asset.id,
        assetId: asset.id, // Add assetId for frontend compatibility
        publicUrl: asset.publicUrl,
        storageProvider: asset.storageProvider,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      });
    } catch (error) {
      console.error("Error uploading cover art:", error);
      res.status(500).json({ error: "Failed to upload cover art" });
    }
  });

  // Upload episode audio (protected - requires authentication)
  app.post("/api/uploads/audio", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Validate file type is audio
      const allowedAudioMimes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'];
      if (!allowedAudioMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Only MP3, M4A, and WAV audio files are allowed." });
      }

      // Validate file size (500MB for audio)
      const maxAudioSize = 500 * 1024 * 1024; // 500MB
      if (req.file.size > maxAudioSize) {
        return res.status(400).json({ error: "File too large. Maximum size for audio is 500MB." });
      }

      // Optional: episodeId and podcastId from query/body for linking
      const episodeId = req.body.episodeId || req.query.episodeId as string | undefined;
      const podcastId = req.body.podcastId || req.query.podcastId as string | undefined;

      // Save file using media orchestrator
      const asset = await mediaOrchestrator.saveEpisodeAudio(req.file, req.session.userId!, episodeId, podcastId);

      // Extract duration from audio file
      let duration = 0;
      try {
        const metadata = await parseBuffer(req.file.buffer, req.file.mimetype);
        duration = Math.round(metadata.format.duration || 0);
      } catch (metadataError) {
        console.warn(`Could not extract duration from ${req.file.originalname}:`, metadataError);
      }

      res.status(201).json({
        id: asset.id,
        assetId: asset.id, // Add assetId for frontend compatibility
        publicUrl: asset.publicUrl,
        storageProvider: asset.storageProvider,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        duration, // Add duration for frontend
      });
    } catch (error) {
      console.error("Error uploading audio:", error);
      res.status(500).json({ error: "Failed to upload audio" });
    }
  });

  // Serve media files (supports both local storage and Google Drive)
  app.get("/media/:type/:filename", async (req, res) => {
    try {
      const { type, filename } = req.params;
      
      // Validate type
      if (type !== 'images' && type !== 'audio') {
        return res.status(400).json({ error: "Invalid media type" });
      }

      // Construct storage key
      const storageKey = `${type}/${filename}`;

      // Look up asset in database
      const asset = await storage.getMediaAssetByStorageKey(storageKey);
      
      if (!asset) {
        return res.status(404).json({ error: "File not found in database" });
      }

      // Set content type from database
      res.setHeader('Content-Type', asset.mimeType);
      
      // Use media orchestrator to stream the file (supports both LOCAL and GOOGLE_DRIVE)
      try {
        const { stream } = await mediaOrchestrator.streamMedia(asset.id);
        
        // Handle stream errors to prevent server crash
        stream.on('error', (streamError) => {
          console.error(`Stream error for asset ${asset.id}:`, streamError);
          if (!res.headersSent) {
            res.status(404).json({ error: "File not found on storage" });
          }
        });
        
        stream.pipe(res);
      } catch (streamError: any) {
        console.error(`Error streaming asset ${asset.id}:`, streamError);
        if (!res.headersSent) {
          return res.status(404).json({ error: "File not found on storage" });
        }
      }
    } catch (error) {
      console.error("Error serving media:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to serve media" });
      }
    }
  });

  // ==================== PODCAST ROUTES ====================
  
  // Get all podcasts
  app.get("/api/podcasts", async (req, res) => {
    try {
      const allPodcasts = await storage.getAllPodcasts();
      
      // Check access for each podcast (visibility + invitations)
      const accessChecks = await Promise.all(
        allPodcasts.map(async (p) => ({
          podcast: p,
          hasVisibilityAccess: await storage.checkUserHasAccessToPodcast(req.session.userId, p.id),
        }))
      );
      
      // Filter by visibility access first
      const visibilityFilteredPodcasts = accessChecks
        .filter(({ hasVisibilityAccess }) => hasVisibilityAccess)
        .map(({ podcast }) => podcast);
      
      // Then filter by moderation status
      let isAdmin = false;
      let currentUserId: string | undefined;
      if (req.session.userId) {
        const user = await storage.getUser(req.session.userId);
        isAdmin = user?.role === "ADMIN";
        currentUserId = req.session.userId;
      }
      
      const podcasts = visibilityFilteredPodcasts.filter(p => {
        // Admins see everything
        if (isAdmin) return true;
        // Owners see their own podcasts regardless of moderation status
        if (currentUserId && p.ownerId === currentUserId) return true;
        // Everyone else only sees approved podcasts (moderation)
        return p.status === "APPROVED";
      });
      
      // Enrich podcasts with cover art URLs from assets
      const enrichedPodcasts = await Promise.all(
        podcasts.map(async (podcast) => {
          // Resolve cover art URL from asset if needed
          let coverArtAsset = null;
          if (podcast.coverArtAssetId && !podcast.coverArtUrl) {
            coverArtAsset = await storage.getMediaAsset(podcast.coverArtAssetId);
          }
          const coverArtUrl = resolvePodcastCoverArtUrl(podcast, coverArtAsset);
          
          return {
            ...podcast,
            coverArtUrl,
          };
        })
      );
      
      // If user is authenticated, add subscription status
      if (req.session.userId) {
        const podcastsWithSubscription = await Promise.all(
          enrichedPodcasts.map(async (podcast) => ({
            ...podcast,
            isSubscribed: await storage.isSubscribed(req.session.userId!, podcast.id),
          }))
        );
        return res.json(podcastsWithSubscription);
      }
      
      res.json(enrichedPodcasts);
    } catch (error) {
      console.error("Error fetching podcasts:", error);
      res.status(500).json({ error: "Failed to fetch podcasts" });
    }
  });

  // Get user's own podcasts
  app.get("/api/my-podcasts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const userPodcasts = await storage.getPodcastsByOwner(userId);
      
      // Enrich podcasts with cover art URLs from assets
      const enrichedPodcasts = await Promise.all(
        userPodcasts.map(async (podcast) => {
          // Resolve cover art URL from asset if needed
          let coverArtAsset = null;
          if (podcast.coverArtAssetId && !podcast.coverArtUrl) {
            coverArtAsset = await storage.getMediaAsset(podcast.coverArtAssetId);
          }
          const coverArtUrl = resolvePodcastCoverArtUrl(podcast, coverArtAsset);
          
          return {
            ...podcast,
            coverArtUrl,
          };
        })
      );
      
      res.json(enrichedPodcasts);
    } catch (error) {
      console.error("Error fetching user podcasts:", error);
      res.status(500).json({ error: "Failed to fetch user podcasts" });
    }
  });

  // Get single podcast with episodes (including share/embed URLs)
  app.get("/api/podcasts/:id", async (req, res) => {
    try {
      const podcast = await storage.getPodcastWithEpisodes(req.params.id);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      // Check access using visibility + invitations + moderation status
      const hasAccess = await storage.checkUserHasAccessToPodcast(req.session.userId, req.params.id);
      
      if (!hasAccess) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      // Also check moderation status (approved content, or owner/admin can see draft/pending)
      let hasModerationAccess = podcast.status === "APPROVED";
      if (req.session.userId) {
        const user = await storage.getUser(req.session.userId);
        const isAdmin = user?.role === "ADMIN";
        const isOwner = podcast.ownerId === req.session.userId;
        hasModerationAccess = hasModerationAccess || isAdmin || isOwner;
      }
      
      if (!hasModerationAccess) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      // Filter episodes: check both visibility and moderation status for each episode
      const accessibleEpisodes = [];
      for (const episode of podcast.episodes) {
        const hasEpisodeAccess = await storage.checkUserHasAccessToEpisode(req.session.userId, episode.id);
        
        // Also check episode moderation status
        let hasEpisodeModerationAccess = episode.status === "APPROVED";
        if (req.session.userId) {
          const user = await storage.getUser(req.session.userId);
          const isAdmin = user?.role === "ADMIN";
          const isOwner = podcast.ownerId === req.session.userId;
          hasEpisodeModerationAccess = hasEpisodeModerationAccess || isAdmin || isOwner;
        }
        
        if (hasEpisodeAccess && hasEpisodeModerationAccess) {
          accessibleEpisodes.push(episode);
        }
      }
      
      const filteredEpisodes = accessibleEpisodes;
      
      // Resolve podcast cover art URL from asset if needed
      let podcastCoverArtAsset = null;
      if (podcast.coverArtAssetId && !podcast.coverArtUrl) {
        podcastCoverArtAsset = await storage.getMediaAsset(podcast.coverArtAssetId);
      }
      const podcastCoverArtUrl = resolvePodcastCoverArtUrl(podcast, podcastCoverArtAsset);
      
      // Enrich episodes with share/embed URLs and audio URLs
      const siteUrl = getSiteUrl(req);
      const episodesWithUrls = await Promise.all(
        filteredEpisodes.map(async (episode) => {
          // Resolve audio URL from asset if needed
          let audioAsset = null;
          if (episode.audioAssetId && !episode.audioUrl) {
            audioAsset = await storage.getMediaAsset(episode.audioAssetId);
          }
          const audioUrl = resolveEpisodeAudioUrl(episode, audioAsset);
          
          return {
            ...episode,
            audioUrl,
            canonicalUrl: getEpisodeCanonicalUrl(siteUrl, podcast.id, episode.id),
            embedUrl: getEpisodeEmbedUrl(siteUrl, episode.id),
            shareUrl: getEpisodeShareUrl(siteUrl, podcast.id, episode.id),
            embedCode: getEmbedIframeCode(getEpisodeEmbedUrl(siteUrl, episode.id), episode.title),
          };
        })
      );
      
      res.json({
        ...podcast,
        coverArtUrl: podcastCoverArtUrl,
        episodes: episodesWithUrls,
      });
    } catch (error) {
      console.error("Error fetching podcast:", error);
      res.status(500).json({ error: "Failed to fetch podcast" });
    }
  });

  // Get RSS feed for podcast
  app.get("/api/podcasts/:id/rss", async (req, res) => {
    try {
      const podcast = await storage.getPodcastForRSS(req.params.id);
      if (!podcast) {
        return res.status(404).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Podcast not found</error>");
      }
      
      // RSS feeds are public - only include approved podcast if not approved
      if (podcast.status !== "APPROVED") {
        return res.status(404).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Podcast not found</error>");
      }
      
      // Filter to only include approved episodes in RSS feed
      const approvedEpisodes = podcast.episodes.filter(e => e.status === "APPROVED");
      
      // Enrich episodes with effective cover art (fallback to podcast cover)
      const enrichedEpisodes = approvedEpisodes.map(episode => {
        const { coverArtUrl, coverArtAssetId } = resolveEpisodeArtwork(episode, podcast);
        return {
          ...episode,
          effectiveCoverArtUrl: coverArtUrl,
          effectiveCoverArtAssetId: coverArtAssetId,
        };
      });
      
      const podcastWithEnrichedEpisodes = {
        ...podcast,
        episodes: enrichedEpisodes,
      };

      // Generate site URL from request
      const siteUrl = getSiteUrl(req);
      const feedUrl = `${siteUrl}/api/podcasts/${podcast.id}/rss`;
      
      // Generate RSS XML
      const rssXml = generateRSSFeed(podcastWithEnrichedEpisodes, feedUrl, siteUrl);
      
      // Set headers with ETag based on latest approved episode
      const latestEpisodeTimestamp = approvedEpisodes.length > 0
        ? new Date(approvedEpisodes[0].publishedAt).getTime()
        : podcast.createdAt.getTime();
      
      res.set({
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "ETag": `"${podcast.id}-${latestEpisodeTimestamp}"`,
      });
      
      res.send(rssXml);
    } catch (error) {
      console.error("Error generating RSS feed:", error);
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Failed to generate RSS feed</error>");
    }
  });

  // Import podcast from RSS feed (protected - requires authentication)
  app.post("/api/podcasts/import-rss", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        rssUrl: z.string().url("Invalid RSS URL"),
      });

      const { rssUrl } = schema.parse(req.body);
      const userId = req.session.userId!;

      // Define iTunes interfaces for type-safe RSS parsing
      interface ItunesFeed {
        itunesImage?: { href: string };
        itunesCategory?: string | { $: { text: string } };
      }
      
      interface ItunesItem {
        itunesDuration?: string | number;
        itunesImage?: { href: string };
      }
      
      // Import rss-parser dynamically with typed generics
      const Parser = (await import("rss-parser")).default;
      const parser = new Parser<ItunesFeed, ItunesItem>({
        customFields: {
          feed: [['itunes:image', 'itunesImage'], ['itunes:category', 'itunesCategory']],
          item: [['itunes:duration', 'itunesDuration'], ['itunes:image', 'itunesImage']],
        },
      });

      // Fetch and parse the RSS feed
      const feed = await parser.parseURL(rssUrl);

      if (!feed || !feed.title) {
        return res.status(400).json({ 
          error: "Feed RSS inválido - falta el título",
          message: "Feed RSS inválido - falta el título"
        });
      }

      // Check if podcast with same title already exists for this user
      const existingPodcasts = await storage.getPodcastsByOwner(userId);
      const duplicate = existingPodcasts.find(p => 
        p.title.toLowerCase().trim() === (feed.title || "").toLowerCase().trim()
      );
      
      if (duplicate) {
        return res.status(409).json({ 
          error: "Ya tienes un podcast con este nombre",
          message: "Ya tienes un podcast con este nombre",
          existingPodcastId: duplicate.id 
        });
      }

      // Extract cover art with proper iTunes handling
      let coverArtUrl: string | null = null;
      if (feed.image?.url) {
        coverArtUrl = feed.image.url;
      } else if (feed.itunesImage?.href) {
        coverArtUrl = feed.itunesImage.href;
      } else if (feed.itunes?.image) {
        coverArtUrl = feed.itunes.image;
      }

      // Extract category
      let category = "General";
      if (feed.itunesCategory) {
        const cat = feed.itunesCategory;
        category = typeof cat === 'string' ? cat : (cat.$ && cat.$.text) || "General";
      } else if (feed.itunes?.categories && feed.itunes.categories.length > 0) {
        category = feed.itunes.categories[0];
      }

      // Validate podcast data with schema
      const podcastValidation = insertPodcastSchema.safeParse({
        title: feed.title.trim(),
        description: (feed.description || feed.title).trim(),
        coverArtUrl: coverArtUrl || "",
        category,
        language: feed.language || "es",
      });

      if (!podcastValidation.success) {
        return res.status(400).json({ 
          error: "Datos inválidos en el feed RSS",
          message: "Datos inválidos en el feed RSS",
          details: podcastValidation.error.errors 
        });
      }

      // Create the podcast
      const podcastData = {
        ...podcastValidation.data,
        coverArtUrl: podcastValidation.data.coverArtUrl || null,
        coverArtAssetId: null,
        ownerId: userId,
        status: "PENDING_APPROVAL" as const,
        approvedAt: null,
        approvedBy: null,
      };

      const podcast = await storage.createPodcast(podcastData);

      // Import episodes from feed
      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      if (feed.items && feed.items.length > 0) {
        // Limit to first 50 episodes to avoid overwhelming the system
        const itemsToImport = feed.items.slice(0, 50);

        for (const item of itemsToImport) {
          try {
            // Extract audio URL from enclosure
            const audioUrl = item.enclosure?.url || item.link;
            
            if (!audioUrl || !item.title) {
              skippedCount++;
              continue;
            }

            // Parse duration with improved handling
            let durationSeconds: number | undefined = undefined;
            const itunesDuration = item.itunesDuration;
            
            if (itunesDuration) {
              const duration = itunesDuration;
              if (typeof duration === 'string') {
                if (duration.includes(':')) {
                  // Format: HH:MM:SS or MM:SS
                  const parts = duration.split(':').map(Number);
                  if (parts.length === 3) {
                    durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                  } else if (parts.length === 2) {
                    durationSeconds = parts[0] * 60 + parts[1];
                  }
                } else {
                  // Format: seconds as string
                  durationSeconds = parseInt(duration) || undefined;
                }
              } else if (typeof duration === 'number') {
                durationSeconds = duration;
              }
            }

            // Extract episode cover art
            let episodeCoverArt: string | null = null;
            if (item.itunesImage?.href) {
              episodeCoverArt = item.itunesImage.href;
            } else if (item.enclosure?.type?.startsWith('image/')) {
              episodeCoverArt = item.enclosure.url;
            }

            // Validate episode data
            const episodeValidation = insertEpisodeSchema.safeParse({
              podcastId: podcast.id,
              title: item.title.trim(),
              notes: (item.contentSnippet || item.content || item.title).trim(),
              audioUrl,
              coverArtUrl: episodeCoverArt || "",
              duration: durationSeconds,
            });

            if (!episodeValidation.success) {
              errors.push(`Episode "${item.title}": ${episodeValidation.error.errors[0].message}`);
              skippedCount++;
              continue;
            }

            await storage.createEpisode(episodeValidation.data);
            importedCount++;
          } catch (episodeError: any) {
            console.error(`Error importing episode "${item.title}":`, episodeError);
            errors.push(`Episode "${item.title}": ${episodeError.message}`);
            skippedCount++;
          }
        }
      }

      res.status(201).json({
        podcast,
        imported: importedCount,
        skipped: skippedCount,
        totalInFeed: feed.items?.length || 0,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        message: `Podcast imported successfully with ${importedCount} episode${importedCount !== 1 ? 's' : ''}`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      
      // Handle RSS parsing errors with more detail
      if (error.message?.includes('404')) {
        return res.status(404).json({ error: "RSS feed not found at the provided URL" });
      }
      if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
        return res.status(400).json({ error: "Cannot reach the RSS feed URL - please check the address" });
      }
      if (error.message?.includes('Invalid XML')) {
        return res.status(400).json({ error: "The URL does not contain valid RSS feed data" });
      }
      
      console.error("Error importing RSS feed:", error);
      res.status(500).json({ 
        error: "Failed to import RSS feed", 
        detail: error.message 
      });
    }
  });

  // Preview YouTube playlist before importing (protected - ADMIN only)
  app.get("/api/import-youtube/preview", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "ADMIN") {
        return res.status(403).json({ error: "Solo administradores pueden importar desde YouTube" });
      }

      const { playlistUrl, maxVideos } = req.query;
      
      if (!playlistUrl || typeof playlistUrl !== 'string') {
        return res.status(400).json({ error: "playlistUrl es requerida" });
      }

      const maxVids = maxVideos ? parseInt(maxVideos as string) : 10;
      
      // Get playlist metadata
      const playlistMetadata = await getPlaylistMetadata(playlistUrl);
      
      // Get playlist videos
      const videos = await getPlaylistVideos(playlistMetadata.playlistId, maxVids);

      res.json({
        playlist: {
          title: playlistMetadata.title,
          description: playlistMetadata.description,
          channelTitle: playlistMetadata.channelTitle,
          thumbnailUrl: playlistMetadata.thumbnailUrl,
        },
        videos: videos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          duration: v.duration,
          publishedAt: v.publishedAt,
        })),
        totalVideos: videos.length,
      });
    } catch (error: any) {
      console.error("Error fetching YouTube playlist:", error);
      
      if (error.message?.includes('YOUTUBE_API_KEY')) {
        return res.status(500).json({ 
          error: "YouTube API no configurada",
          message: "El administrador debe configurar la API de YouTube para usar esta función"
        });
      }

      if (error.message?.includes('Playlist no encontrada')) {
        return res.status(404).json({ 
          error: "Playlist no encontrada",
          message: "Verifica que la URL sea correcta y que la playlist sea pública"
        });
      }

      res.status(500).json({ 
        error: "Error al obtener información de la playlist", 
        detail: error.message 
      });
    }
  });

  // Import podcast from YouTube playlist (protected - ADMIN only)
  app.post("/api/import-youtube", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ error: "Solo administradores pueden importar desde YouTube" });
    }
    try {
      const validatedData = youtubeImportSchema.parse(req.body);
      const userId = req.session.userId!;

      // Get playlist metadata
      const playlistMetadata = await getPlaylistMetadata(validatedData.playlistUrl);

      // Check if podcast with same title already exists for this user
      const existingPodcasts = await storage.getPodcastsByOwner(userId);
      const podcastTitle = validatedData.podcastTitle || playlistMetadata.title;
      const duplicate = existingPodcasts.find(p => 
        p.title.toLowerCase().trim() === podcastTitle.toLowerCase().trim()
      );
      
      if (duplicate) {
        return res.status(409).json({ 
          error: "Ya tienes un podcast con este nombre",
          message: "Ya tienes un podcast con este nombre",
          existingPodcastId: duplicate.id 
        });
      }

      // Get playlist videos
      let videos = await getPlaylistVideos(playlistMetadata.playlistId, validatedData.maxVideos);

      // Filter by selected video IDs if provided
      if (validatedData.selectedVideoIds && validatedData.selectedVideoIds.length > 0) {
        videos = videos.filter(v => validatedData.selectedVideoIds!.includes(v.videoId));
      }

      if (videos.length === 0) {
        return res.status(400).json({
          error: "No hay videos seleccionados para importar",
          message: "Debes seleccionar al menos un video para importar"
        });
      }

      // Create temporary directory for downloads
      const tempDir = path.join(os.tmpdir(), `youtube-import-${Date.now()}`);
      const tempFiles: string[] = [];

      try {
        // Download and upload podcast cover art if available
        let coverArtAssetId: string | null = null;
        if (playlistMetadata.thumbnailUrl) {
          try {
            const thumbnailFilename = `playlist-${playlistMetadata.playlistId}.jpg`;
            const thumbnailPath = await downloadThumbnail(
              playlistMetadata.thumbnailUrl, 
              tempDir, 
              thumbnailFilename
            );
            tempFiles.push(thumbnailPath);
            
            coverArtAssetId = await uploadImageToStorage(thumbnailPath, thumbnailFilename, userId);
          } catch (thumbError) {
            console.error("Error downloading playlist thumbnail:", thumbError);
            // Continue without cover art
          }
        }

        // Create the podcast
        const podcast = await storage.createPodcast({
          title: podcastTitle,
          description: validatedData.podcastDescription || playlistMetadata.description || `Podcast importado desde YouTube: ${playlistMetadata.channelTitle}`,
          coverArtUrl: null,
          coverArtAssetId,
          category: "YouTube Import",
          language: "es",
          ownerId: userId,
          status: "PENDING_APPROVAL" as const,
          visibility: validatedData.visibility as any,
          approvedAt: null,
          approvedBy: null,
        });

        // Import episodes
        let importedCount = 0;
        let skippedCount = 0;
        const errors: string[] = [];

        for (const video of videos) {
          try {
            // Add delay between downloads to avoid rate limiting (except first video)
            if (importedCount > 0) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            }

            // Download audio from video
            const { audioPath, filename } = await downloadAudioFromVideo(video.videoId, tempDir);
            tempFiles.push(audioPath);

            // Upload audio to storage
            const audioAssetId = await uploadAudioToStorage(
              audioPath,
              filename,
              userId,
              undefined, // episodeId - will be filled after creation
              podcast.id
            );

            // Download episode cover art if different from podcast
            let episodeCoverArtAssetId: string | null = null;
            if (video.thumbnailUrl && video.thumbnailUrl !== playlistMetadata.thumbnailUrl) {
              try {
                const episodeThumbFilename = `video-${video.videoId}.jpg`;
                const episodeThumbPath = await downloadThumbnail(
                  video.thumbnailUrl,
                  tempDir,
                  episodeThumbFilename
                );
                tempFiles.push(episodeThumbPath);
                
                episodeCoverArtAssetId = await uploadImageToStorage(
                  episodeThumbPath,
                  episodeThumbFilename,
                  userId,
                  podcast.id
                );
              } catch (thumbError) {
                console.error(`Error downloading thumbnail for video ${video.videoId}:`, thumbError);
                // Continue without episode-specific cover art
              }
            }

            // Create episode
            await storage.createEpisode({
              podcastId: podcast.id,
              title: video.title,
              notes: video.description || video.title,
              audioUrl: undefined,
              audioAssetId,
              coverArtUrl: undefined,
              coverArtAssetId: episodeCoverArtAssetId,
              duration: video.duration,
              status: "PENDING_APPROVAL" as const,
              visibility: validatedData.visibility as any,
              publishedAt: video.publishedAt?.toISOString(),
              approvedAt: null,
              approvedBy: null,
            });

            importedCount++;
          } catch (episodeError: any) {
            console.error(`Error importing video "${video.title}":`, episodeError);
            errors.push(`Video "${video.title}": ${episodeError.message}`);
            skippedCount++;
          }
        }

        // Cleanup temp files
        await cleanupTempFiles(tempFiles);

        res.status(201).json({
          podcast,
          imported: importedCount,
          skipped: skippedCount,
          totalRequested: validatedData.maxVideos,
          totalAvailable: videos.length,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
          message: `Podcast creado exitosamente con ${importedCount} episodio${importedCount !== 1 ? 's' : ''}`,
        });
      } catch (importError) {
        // Cleanup temp files on error
        await cleanupTempFiles(tempFiles);
        throw importError;
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: error.errors });
      }

      console.error("Error importing from YouTube:", error);
      
      // Handle specific YouTube errors
      if (error.message?.includes('YOUTUBE_API_KEY')) {
        return res.status(500).json({ 
          error: "YouTube API no configurada",
          message: "El administrador debe configurar la API de YouTube para usar esta función"
        });
      }

      if (error.message?.includes('Playlist no encontrada')) {
        return res.status(404).json({ 
          error: "Playlist no encontrada",
          message: "Verifica que la URL sea correcta y que la playlist sea pública"
        });
      }

      res.status(500).json({ 
        error: "Error al importar desde YouTube", 
        detail: error.message 
      });
    }
  });

  // Import podcast from local folder - multiple MP3 files (protected - ADMIN only)
  app.post("/api/import-local", requireAuth, uploadLocalImport.fields([
    { name: 'audioFiles', maxCount: 50 },
    { name: 'coverArt', maxCount: 1 }
  ]), async (req, res) => {
    const tempFiles: string[] = [];
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "ADMIN") {
        return res.status(403).json({ error: "Solo administradores pueden importar carpetas locales" });
      }

      const userId = req.session.userId!;
      const files = req.files as { audioFiles?: Express.Multer.File[], coverArt?: Express.Multer.File[] };
      
      if (!files.audioFiles || files.audioFiles.length === 0) {
        return res.status(400).json({ error: "Debes subir al menos un archivo de audio" });
      }

      // Collect all temp file paths for cleanup
      files.audioFiles.forEach(file => tempFiles.push(file.path));
      if (files.coverArt?.[0]) {
        tempFiles.push(files.coverArt[0].path);
      }

      // Validate metadata
      const validatedData = localImportSchema.parse(req.body);

      // Check if podcast with same title already exists for this user
      const existingPodcasts = await storage.getPodcastsByOwner(userId);
      const duplicate = existingPodcasts.find(p => 
        p.title.toLowerCase().trim() === validatedData.podcastTitle.toLowerCase().trim()
      );
      
      if (duplicate) {
        return res.status(409).json({ 
          error: "Ya tienes un podcast con este nombre",
          message: "Ya tienes un podcast con este nombre",
          existingPodcastId: duplicate.id 
        });
      }

      // Upload cover art if provided
      let coverArtAssetId: string | null = null;
      if (files.coverArt && files.coverArt[0]) {
        // Read file from disk into buffer (disk storage doesn't have .buffer)
        const coverBuffer = fs.readFileSync(files.coverArt[0].path);
        const coverWithBuffer = {
          ...files.coverArt[0],
          buffer: coverBuffer
        };
        const coverArt = await mediaOrchestrator.saveCoverArt(coverWithBuffer, userId);
        coverArtAssetId = coverArt.id;
      }

      // Create the podcast
      const podcast = await storage.createPodcast({
        title: validatedData.podcastTitle,
        description: validatedData.podcastDescription,
        coverArtUrl: null,
        coverArtAssetId,
        category: validatedData.category,
        language: validatedData.language,
        ownerId: userId,
        status: "PENDING_APPROVAL" as const,
        visibility: validatedData.visibility as any,
        approvedAt: null,
        approvedBy: null,
      });

      // Import episodes from audio files
      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const audioFile of files.audioFiles) {
        try {
          // Extract metadata from audio file to get duration
          let duration = 0;
          try {
            const metadata = await parseFile(audioFile.path);
            duration = Math.round(metadata.format.duration || 0);
          } catch (metadataError) {
            console.warn(`Could not extract duration from ${audioFile.originalname}:`, metadataError);
          }

          // Read file from disk into buffer (disk storage doesn't have .buffer)
          const fileBuffer = fs.readFileSync(audioFile.path);
          
          // Create file object with buffer for storage service
          const fileWithBuffer = {
            ...audioFile,
            buffer: fileBuffer
          };
          
          // Upload audio file
          const audioAsset = await mediaOrchestrator.saveEpisodeAudio(
            fileWithBuffer,
            userId,
            undefined, // episodeId - will be filled after creation
            podcast.id
          );

          // Extract episode title from filename (remove extension)
          const episodeTitle = audioFile.originalname.replace(/\.[^/.]+$/, "");

          // Create episode
          await storage.createEpisode({
            podcastId: podcast.id,
            title: episodeTitle,
            notes: `Episodio importado desde archivo local: ${audioFile.originalname}`,
            audioUrl: undefined,
            audioAssetId: audioAsset.id,
            coverArtUrl: undefined,
            coverArtAssetId: null,
            duration: duration,
            status: "PENDING_APPROVAL" as const,
            visibility: validatedData.visibility as any,
            publishedAt: new Date(),
            approvedAt: null,
            approvedBy: null,
          });

          importedCount++;
        } catch (episodeError: any) {
          console.error(`Error importing audio file "${audioFile.originalname}":`, episodeError);
          errors.push(`Archivo "${audioFile.originalname}": ${episodeError.message}`);
          skippedCount++;
        }
      }

      res.status(201).json({
        podcast,
        imported: importedCount,
        skipped: skippedCount,
        totalFiles: files.audioFiles.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        message: `Podcast creado exitosamente con ${importedCount} episodio${importedCount !== 1 ? 's' : ''}`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: error.errors });
      }

      console.error("Error importing from local folder:", error);
      res.status(500).json({ 
        error: "Error al importar archivos locales", 
        detail: error.message 
      });
    } finally {
      // Clean up temporary files from disk
      for (const filePath of tempFiles) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          console.error(`Failed to cleanup temp file ${filePath}:`, cleanupError);
        }
      }
    }
  });

  // Create podcast (protected - requires authentication)
  app.post("/api/podcasts", requireAuth, async (req, res) => {
    try {
      // Parse request body (ownerId is omitted from schema)
      const validatedData = insertPodcastSchema.parse(req.body);
      
      // Create podcast with authenticated user as owner
      const podcastData = {
        title: validatedData.title,
        description: validatedData.description,
        coverArtUrl: validatedData.coverArtUrl || null,
        coverArtAssetId: null,
        category: validatedData.category,
        language: validatedData.language,
        visibility: validatedData.visibility || "PUBLIC",
        ownerId: req.session.userId!,
        status: "PENDING_APPROVAL" as const, // Will be determined by createPodcast based on user settings
        approvedAt: null,
        approvedBy: null,
      };
      
      const podcast = await storage.createPodcast(podcastData);
      res.status(201).json(podcast);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating podcast:", error);
      res.status(500).json({ error: "Failed to create podcast" });
    }
  });

  // Update podcast (protected - requires authentication and ownership)
  app.patch("/api/podcasts/:id", requireAuth, async (req, res) => {
    try {
      const podcastId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify the podcast exists and belongs to the authenticated user (or user is admin)
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const user = await storage.getUser(userId);
      const isOwner = podcast.ownerId === userId;
      const isAdmin = user?.role === "ADMIN";
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - You can only edit your own podcasts" });
      }
      
      // Validate and update allowed fields
      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        coverArtUrl: z.string().nullable().optional(),
        coverArtAssetId: z.string().nullable().optional(),
        category: z.string().optional(),
        language: z.string().optional(),
        visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).optional(),
      });
      
      const validatedData = updateSchema.parse(req.body);
      const updated = await storage.updatePodcast(podcastId, validatedData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating podcast:", error);
      res.status(500).json({ error: "Failed to update podcast" });
    }
  });

  // Subscribe to podcast (protected - requires authentication)
  app.post("/api/podcasts/:id/subscribe", requireAuth, async (req, res) => {
    try {
      const podcastId = req.params.id;
      const userId = req.session.userId!;
      
      // Check if podcast exists
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const subscription = await storage.subscribeToPodcast(userId, podcastId);
      res.status(201).json(subscription);
    } catch (error) {
      console.error("Error subscribing to podcast:", error);
      res.status(500).json({ error: "Failed to subscribe to podcast" });
    }
  });

  // Unsubscribe from podcast (protected - requires authentication)
  app.delete("/api/podcasts/:id/subscribe", requireAuth, async (req, res) => {
    try {
      const podcastId = req.params.id;
      const userId = req.session.userId!;
      
      await storage.unsubscribeFromPodcast(userId, podcastId);
      res.status(204).send();
    } catch (error) {
      console.error("Error unsubscribing from podcast:", error);
      res.status(500).json({ error: "Failed to unsubscribe from podcast" });
    }
  });

  // Get user's library (subscribed podcasts)
  app.get("/api/library", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const podcasts = await storage.getUserSubscriptions(userId);
      res.json(podcasts);
    } catch (error) {
      console.error("Error fetching library:", error);
      res.status(500).json({ error: "Failed to fetch library" });
    }
  });

  // ==================== PLAYLIST ROUTES ====================

  // Create playlist
  app.post("/api/playlists", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const validatedData = insertPlaylistSchema.parse(req.body);
      
      const playlist = await storage.createPlaylist({ ...validatedData, userId });
      res.status(201).json(playlist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating playlist:", error);
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  // Get user's playlists
  app.get("/api/playlists", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const playlists = await storage.getUserPlaylists(userId);
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  // Get public playlists
  app.get("/api/playlists/public", async (req, res) => {
    try {
      const playlists = await storage.getPublicPlaylists();
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching public playlists:", error);
      res.status(500).json({ error: "Failed to fetch public playlists" });
    }
  });

  // Get single playlist with episodes
  app.get("/api/playlists/:id", async (req, res) => {
    try {
      const playlistId = req.params.id;
      const playlist = await storage.getPlaylist(playlistId);
      
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      // Check access: public playlists are accessible to everyone, private ones only to owner
      if (!playlist.isPublic && playlist.userId !== req.session.userId) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      const episodes = await storage.getPlaylistEpisodes(playlistId);
      
      res.json({ ...playlist, episodes });
    } catch (error) {
      console.error("Error fetching playlist:", error);
      res.status(500).json({ error: "Failed to fetch playlist" });
    }
  });

  // Update playlist
  app.patch("/api/playlists/:id", requireAuth, async (req, res) => {
    try {
      const playlistId = req.params.id;
      const userId = req.session.userId!;
      
      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (playlist.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      });

      const validatedData = updateSchema.parse(req.body);
      const updated = await storage.updatePlaylist(playlistId, validatedData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating playlist:", error);
      res.status(500).json({ error: "Failed to update playlist" });
    }
  });

  // Delete playlist
  app.delete("/api/playlists/:id", requireAuth, async (req, res) => {
    try {
      const playlistId = req.params.id;
      const userId = req.session.userId!;
      
      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (playlist.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deletePlaylist(playlistId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  // Add episode to playlist
  app.post("/api/playlists/:id/episodes", requireAuth, async (req, res) => {
    try {
      const playlistId = req.params.id;
      const userId = req.session.userId!;
      const { episodeId } = req.body;

      if (!episodeId) {
        return res.status(400).json({ error: "Episode ID is required" });
      }

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (playlist.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Check if episode exists
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Check if already in playlist
      const exists = await storage.isEpisodeInPlaylist(playlistId, episodeId);
      if (exists) {
        return res.status(409).json({ error: "Episode already in playlist" });
      }

      const playlistEpisode = await storage.addEpisodeToPlaylist(playlistId, episodeId);
      res.status(201).json(playlistEpisode);
    } catch (error) {
      console.error("Error adding episode to playlist:", error);
      res.status(500).json({ error: "Failed to add episode to playlist" });
    }
  });

  // Remove episode from playlist
  app.delete("/api/playlists/:id/episodes/:episodeId", requireAuth, async (req, res) => {
    try {
      const playlistId = req.params.id;
      const episodeId = req.params.episodeId;
      const userId = req.session.userId!;

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (playlist.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.removeEpisodeFromPlaylist(playlistId, episodeId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing episode from playlist:", error);
      res.status(500).json({ error: "Failed to remove episode from playlist" });
    }
  });

  // Reorder playlist episodes
  app.put("/api/playlists/:id/reorder", requireAuth, async (req, res) => {
    try {
      const playlistId = req.params.id;
      const userId = req.session.userId!;
      const { episodeIds } = req.body;

      if (!Array.isArray(episodeIds)) {
        return res.status(400).json({ error: "Episode IDs must be an array" });
      }

      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (playlist.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.reorderPlaylistEpisodes(playlistId, episodeIds);
      res.status(204).send();
    } catch (error) {
      console.error("Error reordering playlist:", error);
      res.status(500).json({ error: "Failed to reorder playlist" });
    }
  });

  // Get single episode
  app.get("/api/episodes/:id", async (req, res) => {
    try {
      // Get user info if authenticated
      let userRole: string | undefined;
      if (req.session.userId) {
        const user = await storage.getUser(req.session.userId);
        userRole = user?.role;
      }
      
      // Fetch enriched episode with access control
      const result = await getEpisodeForResponse(
        req.params.id,
        req.session.userId,
        userRole
      );
      
      if (!result) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      if (!result.hasAccess) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Generate URLs for sharing and embedding
      const siteUrl = getSiteUrl(req);
      const canonicalUrl = getEpisodeCanonicalUrl(siteUrl, result.episode.podcastId, result.episode.id);
      const embedUrl = getEpisodeEmbedUrl(siteUrl, result.episode.id);
      const shareUrl = getEpisodeShareUrl(siteUrl, result.episode.podcastId, result.episode.id);
      const embedCode = getEmbedIframeCode(embedUrl, result.episode.title);
      
      res.json({
        ...result.episode,
        canonicalUrl,
        embedUrl,
        shareUrl,
        embedCode,
      });
    } catch (error) {
      console.error("Error fetching episode:", error);
      res.status(500).json({ error: "Failed to fetch episode" });
    }
  });

  // Create episode (protected - requires authentication)
  app.post("/api/episodes", requireAuth, async (req, res) => {
    try {
      const validatedData = insertEpisodeSchema.parse(req.body);
      
      // Verify the podcast exists and belongs to the authenticated user
      const podcast = await storage.getPodcast(validatedData.podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      if (podcast.ownerId !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden - You can only add episodes to your own podcasts" });
      }
      
      // Ensure audioFileSize is provided or can be fetched
      let audioFileSize = validatedData.audioFileSize;
      
      if (!audioFileSize) {
        // Attempt to fetch Content-Length if not provided
        try {
          const headResponse = await fetch(validatedData.audioUrl, { method: "HEAD" });
          const contentLength = headResponse.headers.get("content-length");
          
          if (contentLength && !isNaN(parseInt(contentLength))) {
            audioFileSize = parseInt(contentLength);
            console.log(`Auto-fetched audioFileSize: ${audioFileSize} bytes for ${validatedData.audioUrl}`);
          } else {
            return res.status(400).json({ 
              error: "Unable to determine audio file size. Please provide audioFileSize or ensure the audio URL returns a Content-Length header." 
            });
          }
        } catch (error) {
          console.error(`Failed to fetch audioFileSize for ${validatedData.audioUrl}:`, error);
          return res.status(400).json({ 
            error: "Unable to fetch audio file size. Please provide audioFileSize or ensure the audio URL is accessible." 
          });
        }
      }
      
      const episode = await storage.createEpisode({
        ...validatedData,
        audioFileSize,
        publishedAt: validatedData.publishedAt ? new Date(validatedData.publishedAt) : undefined,
      });
      res.status(201).json(episode);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating episode:", error);
      res.status(500).json({ error: "Failed to create episode" });
    }
  });

  // Update episode (protected - requires authentication and ownership)
  app.patch("/api/episodes/:id", requireAuth, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify the episode exists and belongs to the authenticated user (or user is admin)
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Get podcast to check ownership
      const podcast = await storage.getPodcast(episode.podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const user = await storage.getUser(userId);
      const isOwner = podcast.ownerId === userId;
      const isAdmin = user?.role === "ADMIN";
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - You can only edit episodes from your own podcasts" });
      }
      
      // Validate and update allowed fields (metadata only, not audio files)
      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        notes: z.string().optional(),
        coverArtUrl: z.string().nullable().optional(),
        coverArtAssetId: z.string().nullable().optional(),
        visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).optional(),
      });
      
      const validatedData = updateSchema.parse(req.body);
      const updated = await storage.updateEpisode(episodeId, validatedData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating episode:", error);
      res.status(500).json({ error: "Failed to update episode" });
    }
  });

  // Upload new audio file for existing episode
  app.post("/api/episodes/:id/audio", requireAuth, uploadSingleAudio.single("audioFile"), async (req, res) => {
    const tempFiles: string[] = [];
    try {
      const userId = req.session.userId!;
      const episodeId = req.params.id;
      
      // Verify the episode exists
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episodio no encontrado" });
      }
      
      // Get podcast to check ownership
      const podcast = await storage.getPodcast(episode.podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast no encontrado" });
      }
      
      // Verify user is owner or admin
      const user = await storage.getUser(userId);
      const isOwner = podcast.ownerId === userId;
      const isAdmin = user?.role === "ADMIN";
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "No tienes permiso para modificar este episodio" });
      }
      
      // Verify audio file was uploaded
      const audioFile = req.file;
      if (!audioFile) {
        return res.status(400).json({ error: "Debes subir un archivo de audio" });
      }
      
      // Add temp file for cleanup
      tempFiles.push(audioFile.path);
      
      // Extract duration from MP3 metadata
      let duration = 0;
      try {
        const metadata = await parseFile(audioFile.path);
        duration = Math.round(metadata.format.duration || 0);
      } catch (metadataError) {
        console.warn(`Could not extract duration from ${audioFile.originalname}:`, metadataError);
      }
      
      // Read file from disk into buffer
      const fileBuffer = fs.readFileSync(audioFile.path);
      const fileWithBuffer = {
        ...audioFile,
        buffer: fileBuffer
      };
      
      // Upload new audio file
      const audioAsset = await mediaOrchestrator.saveEpisodeAudio(
        fileWithBuffer,
        userId,
        episodeId,
        podcast.id
      );
      
      // Delete old audio asset if it exists
      if (episode.audioAssetId) {
        try {
          await mediaOrchestrator.deleteMediaAsset(episode.audioAssetId);
        } catch (deleteError) {
          console.warn(`Could not delete old audio asset ${episode.audioAssetId}:`, deleteError);
        }
      }
      
      // Update episode with new audio file
      const updated = await storage.updateEpisode(episodeId, {
        audioAssetId: audioAsset.id,
        audioUrl: undefined, // Clear old URL, will be resolved from asset
        duration,
      });
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error uploading new audio file:", error);
      res.status(500).json({ 
        error: "Error al subir el archivo de audio", 
        detail: error.message 
      });
    } finally {
      // Clean up temporary files
      for (const filePath of tempFiles) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupError) {
          console.error(`Failed to cleanup temp file ${filePath}:`, cleanupError);
        }
      }
    }
  });

  // Embed route - Returns responsive iframe-optimized HTML5 audio player
  app.get("/embed/episode/:id", async (req, res) => {
    try {
      // Use centralized helper for enriched episode with cover art fallback
      let viewerId: string | undefined;
      let userRole: string | undefined;
      
      if (req.session?.userId) {
        const user = await storage.getUser(req.session.userId);
        viewerId = req.session.userId;
        userRole = user?.role;
      }
      
      const result = await getEpisodeForResponse(req.params.id, viewerId, userRole);
      
      if (!result) {
        res.status(404);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
          <!DOCTYPE html>
          <html lang="es">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Episodio no encontrado</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 200px;
                  margin: 0;
                  background: #f5f5f5;
                  color: #333;
                }
              </style>
            </head>
            <body>
              <p>Episodio no encontrado</p>
            </body>
          </html>
        `);
      }
      
      const { episode, podcast, hasAccess } = result;
      
      // IMPORTANT: Embed routes are public iframe surfaces with stricter approval requirements.
      // Authenticated users (admin/owners/delegated roles): trust hasAccess from getEpisodeForResponse.
      // Public users (unauthenticated): require BOTH episode AND podcast to be approved to prevent
      // leaking embargoed branding/audio via iframe embedding.
      let embedHasAccess = hasAccess;
      if (!viewerId) {
        // Public users require both podcast and episode to be approved
        embedHasAccess = embedHasAccess && podcast?.status === "APPROVED";
      }
      
      if (!embedHasAccess) {
        res.status(404);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`
          <!DOCTYPE html>
          <html lang="es">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Episodio no encontrado</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 200px;
                  margin: 0;
                  background: #f5f5f5;
                  color: #333;
                }
              </style>
            </head>
            <body>
              <p>Episodio no encontrado</p>
            </body>
          </html>
        `);
      }
      
      // Generate URLs
      const siteUrl = getSiteUrl(req);
      const canonicalUrl = getEpisodeCanonicalUrl(siteUrl, episode.podcastId, episode.id);
      
      // Escape HTML entities for safe rendering (requires non-null string input)
      const escapeHtml = (str: string) => str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      // Provide safe defaults before escaping
      const safeEpisodeTitle = episode.title || 'Episodio sin título';
      const safePodcastTitle = podcast?.title || 'Podcast';
      const safeDescription = episode.notes ? episode.notes.substring(0, 200) : safeEpisodeTitle;
      // Use enriched episode's effective cover art (with automatic podcast fallback)
      const safeCoverArtUrl = episode.effectiveCoverArtUrl || '';
      const safeAudioUrl = episode.audioUrl || '';

      const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(safeEpisodeTitle)} - ${escapeHtml(safePodcastTitle)}</title>
    
    <!-- Open Graph meta tags -->
    <meta property="og:type" content="music.song">
    <meta property="og:title" content="${escapeHtml(safeEpisodeTitle)}">
    <meta property="og:description" content="${escapeHtml(safeDescription)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    ${safeCoverArtUrl ? `<meta property="og:image" content="${escapeHtml(safeCoverArtUrl)}">` : ''}
    <meta property="og:audio" content="${escapeHtml(safeAudioUrl)}">
    
    <!-- Twitter Card meta tags -->
    <meta name="twitter:card" content="player">
    <meta name="twitter:title" content="${escapeHtml(safeEpisodeTitle)}">
    <meta name="twitter:description" content="${escapeHtml(safeDescription)}">
    ${safeCoverArtUrl ? `<meta name="twitter:image" content="${escapeHtml(safeCoverArtUrl)}">` : ''}
    
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background: #ffffff;
        overflow: hidden;
      }
      
      .player-container {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        max-width: 420px;
        height: 200px;
        margin: 0 auto;
        background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
        border-radius: 8px;
      }
      
      .cover-art {
        width: 120px;
        height: 120px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
        background: rgba(0, 0, 0, 0.1);
      }
      
      .player-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        color: white;
      }
      
      .episode-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      
      .podcast-title {
        font-size: 13px;
        opacity: 0.9;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      audio {
        width: 100%;
        height: 40px;
        outline: none;
      }
      
      .cta-link {
        display: inline-block;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
        border-radius: 6px;
        color: white;
        text-decoration: none;
        font-size: 12px;
        font-weight: 600;
        transition: background 0.2s;
        text-align: center;
      }
      
      .cta-link:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      
      @media (max-width: 380px) {
        .cover-art {
          width: 80px;
          height: 80px;
        }
        .episode-title {
          font-size: 14px;
        }
        .podcast-title {
          font-size: 12px;
        }
      }
    </style>
  </head>
  <body>
    <div class="player-container">
      ${safeCoverArtUrl && safeCoverArtUrl.trim() ? `<img src="${escapeHtml(safeCoverArtUrl)}" alt="${escapeHtml(safePodcastTitle)}" class="cover-art">` : ''}
      <div class="player-content">
        <h2 class="episode-title">${escapeHtml(safeEpisodeTitle)}</h2>
        ${podcast ? `<p class="podcast-title">${escapeHtml(safePodcastTitle)}</p>` : ''}
        <audio controls preload="metadata">
          <source src="${escapeHtml(safeAudioUrl)}" type="audio/mpeg">
          Tu navegador no soporta el elemento de audio.
        </audio>
        <a href="${escapeHtml(canonicalUrl)}" target="_blank" class="cta-link" rel="noopener noreferrer">
          Ver episodio completo →
        </a>
      </div>
    </div>
  </body>
</html>`;

      // Set appropriate headers for iframe embedding (allow all origins for multitenant use)
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // Use CSP frame-ancestors instead of deprecated X-Frame-Options
      res.setHeader('Content-Security-Policy', "frame-ancestors *;");
      res.send(html);
    } catch (error) {
      console.error("Error in embed route:", error);
      res.status(500).send("Error loading episode");
    }
  });

  // ==================== CONTENT INVITATION ROUTES ====================
  
  // Create invitation for a podcast
  app.post("/api/podcasts/:id/invitations", requireAuth, async (req, res) => {
    try {
      const podcastId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify podcast exists and user is the owner
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "ADMIN";
      const isOwner = podcast.ownerId === userId;
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - Only the podcast owner can invite users" });
      }
      
      // Validate request body
      const invitationSchema = z.object({
        email: z.string().email("Invalid email address"),
        expiresAt: z.string().datetime().optional(),
      });
      
      const validatedData = invitationSchema.parse(req.body);
      
      // Create invitation
      const invitation = await storage.createContentInvitation({
        email: validatedData.email,
        podcastId,
        episodeId: null,
        invitedBy: userId,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
      });
      
      // TODO: Send invitation email using email service
      // const emailService = getEmailService();
      // await emailService.sendInvitationEmail(...)
      
      res.status(201).json(invitation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating podcast invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });
  
  // Get invitations for a podcast
  app.get("/api/podcasts/:id/invitations", requireAuth, async (req, res) => {
    try {
      const podcastId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify podcast exists and user is the owner
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "ADMIN";
      const isOwner = podcast.ownerId === userId;
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - Only the podcast owner can view invitations" });
      }
      
      const invitations = await storage.getContentInvitationsByPodcast(podcastId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching podcast invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });
  
  // Create invitation for an episode
  app.post("/api/episodes/:id/invitations", requireAuth, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify episode exists and user is the owner
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const podcast = await storage.getPodcast(episode.podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "ADMIN";
      const isOwner = podcast.ownerId === userId;
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - Only the podcast owner can invite users to episodes" });
      }
      
      // Validate request body
      const invitationSchema = z.object({
        email: z.string().email("Invalid email address"),
        expiresAt: z.string().datetime().optional(),
      });
      
      const validatedData = invitationSchema.parse(req.body);
      
      // Create invitation
      const invitation = await storage.createContentInvitation({
        email: validatedData.email,
        podcastId: null,
        episodeId,
        invitedBy: userId,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
      });
      
      // TODO: Send invitation email using email service
      
      res.status(201).json(invitation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating episode invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });
  
  // Get invitations for an episode
  app.get("/api/episodes/:id/invitations", requireAuth, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify episode exists and user is the owner
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const podcast = await storage.getPodcast(episode.podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "ADMIN";
      const isOwner = podcast.ownerId === userId;
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - Only the podcast owner can view episode invitations" });
      }
      
      const invitations = await storage.getContentInvitationsByEpisode(episodeId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching episode invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });
  
  // Create an invitation (generic endpoint that accepts podcastId or episodeId)
  app.post("/api/invitations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      
      // Validate request body - exactly one of podcastId or episodeId must be present
      const invitationSchema = z.object({
        email: z.string().email("Invalid email address"),
        podcastId: z.string().optional(),
        episodeId: z.string().optional(),
        expiresAt: z.string().datetime().optional(),
      }).refine(
        data => (data.podcastId && !data.episodeId) || (!data.podcastId && data.episodeId),
        { message: "Exactly one of podcastId or episodeId must be provided" }
      );
      
      const validatedData = invitationSchema.parse(req.body);
      
      // Verify permissions based on content type
      if (validatedData.podcastId) {
        // Verify podcast exists and user is the owner
        const podcast = await storage.getPodcast(validatedData.podcastId);
        if (!podcast) {
          return res.status(404).json({ error: "Podcast not found" });
        }
        
        const user = await storage.getUser(userId);
        const isAdmin = user?.role === "ADMIN";
        const isOwner = podcast.ownerId === userId;
        
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ error: "Forbidden - Only the podcast owner can invite users" });
        }
        
        // Create podcast invitation
        const invitation = await storage.createContentInvitation({
          email: validatedData.email,
          podcastId: validatedData.podcastId,
          episodeId: null,
          invitedBy: userId,
          expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
        });
        
        return res.status(201).json(invitation);
      } else if (validatedData.episodeId) {
        // Verify episode exists and user is the owner
        const episode = await storage.getEpisode(validatedData.episodeId);
        if (!episode) {
          return res.status(404).json({ error: "Episode not found" });
        }
        
        const podcast = await storage.getPodcast(episode.podcastId);
        if (!podcast) {
          return res.status(404).json({ error: "Podcast not found" });
        }
        
        const user = await storage.getUser(userId);
        const isAdmin = user?.role === "ADMIN";
        const isOwner = podcast.ownerId === userId;
        
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ error: "Forbidden - Only the podcast owner can invite users to episodes" });
        }
        
        // Create episode invitation
        const invitation = await storage.createContentInvitation({
          email: validatedData.email,
          podcastId: null,
          episodeId: validatedData.episodeId,
          invitedBy: userId,
          expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
        });
        
        return res.status(201).json(invitation);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });
  
  // Delete an invitation
  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      const invitationId = req.params.id;
      const userId = req.session.userId!;
      
      // Verify invitation exists
      const invitation = await storage.getContentInvitation(invitationId);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      
      // Verify user is the one who created the invitation or is admin
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "ADMIN";
      const isInviter = invitation.invitedBy === userId;
      
      if (!isInviter && !isAdmin) {
        return res.status(403).json({ error: "Forbidden - You can only delete invitations you created" });
      }
      
      await storage.deleteContentInvitation(invitationId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  
  // User Management
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Exclude password hashes from response
      const usersWithoutPasswords = users.map(({ passwordHash: _, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const validatedData = updateUserRoleSchema.parse(req.body);
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent demoting the last admin
      if (user.role === "ADMIN" && validatedData.role !== "ADMIN") {
        const allUsers = await storage.getAllUsers();
        const adminCount = allUsers.filter(u => u.role === "ADMIN").length;
        if (adminCount <= 1) {
          return res.status(400).json({ error: "Cannot demote the last admin" });
        }
      }
      
      const updatedUser = await storage.updateUserRole(userId, validatedData.role);
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });
  
  app.patch("/api/admin/users/:id/requires-approval", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const validatedData = updateUserApprovalSchema.parse(req.body);
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const updatedUser = await storage.updateUserRequiresApproval(userId, validatedData.requiresApproval);
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating user approval status:", error);
      res.status(500).json({ error: "Failed to update user approval status" });
    }
  });
  
  app.patch("/api/admin/users/:id/active", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const validatedData = updateUserActiveSchema.parse(req.body);
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent self-deactivation
      if (userId === req.session.userId && !validatedData.isActive) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }
      
      const updatedUser = await storage.updateUserIsActive(userId, validatedData.isActive);
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating user active status:", error);
      res.status(500).json({ error: "Failed to update user active status" });
    }
  });
  
  // Podcast Moderation
  app.get("/api/admin/podcasts", requireAdmin, async (req, res) => {
    try {
      const query = adminPodcastsQuerySchema.parse(req.query);
      const podcasts = await storage.listPodcastsFiltered(
        query.status,
        query.ownerId,
        query.search
      );
      res.json(podcasts);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching podcasts for admin:", error);
      res.status(500).json({ error: "Failed to fetch podcasts" });
    }
  });
  
  app.patch("/api/admin/podcasts/:id/status", requireAdmin, async (req, res) => {
    try {
      const podcastId = req.params.id;
      const validatedData = updatePodcastStatusSchema.parse(req.body);
      
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      const updatedPodcast = await storage.updatePodcastStatus(
        podcastId,
        validatedData.status,
        req.session.userId!
      );
      res.json(updatedPodcast);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating podcast status:", error);
      res.status(500).json({ error: "Failed to update podcast status" });
    }
  });
  
  app.delete("/api/admin/podcasts/:id", requireAdmin, async (req, res) => {
    try {
      const podcastId = req.params.id;
      
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      await storage.deletePodcast(podcastId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting podcast:", error);
      res.status(500).json({ error: "Failed to delete podcast" });
    }
  });
  
  // Episode Moderation
  app.get("/api/admin/episodes", requireAdmin, async (req, res) => {
    try {
      const query = adminEpisodesQuerySchema.parse(req.query);
      const episodes = await storage.listEpisodesFiltered(
        query.status,
        query.podcastId,
        query.ownerId,
        query.search
      );
      res.json(episodes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching episodes for admin:", error);
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });
  
  app.patch("/api/admin/episodes/:id/status", requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const validatedData = updateEpisodeStatusSchema.parse(req.body);
      
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const updatedEpisode = await storage.updateEpisodeStatus(
        episodeId,
        validatedData.status,
        req.session.userId!
      );
      res.json(updatedEpisode);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating episode status:", error);
      res.status(500).json({ error: "Failed to update episode status" });
    }
  });
  
  app.delete("/api/admin/episodes/:id", requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      await storage.deleteEpisode(episodeId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting episode:", error);
      res.status(500).json({ error: "Failed to delete episode" });
    }
  });

  // Bulk operations - Users
  app.post("/api/admin/users/bulk-update-role", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkUpdateUsersRoleSchema.parse(req.body);
      const result = await storage.bulkUpdateUsersRole(validatedData.ids, validatedData.role);
      res.json({
        message: `Updated ${result.successIds.length} user(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk updating user roles:", error);
      res.status(500).json({ error: "Failed to bulk update user roles" });
    }
  });

  app.post("/api/admin/users/bulk-update-active", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkUpdateUsersActiveSchema.parse(req.body);
      const result = await storage.bulkUpdateUsersActive(validatedData.ids, validatedData.isActive);
      res.json({
        message: `Updated ${result.successIds.length} user(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk updating user active status:", error);
      res.status(500).json({ error: "Failed to bulk update user active status" });
    }
  });

  app.post("/api/admin/users/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkDeleteUsersSchema.parse(req.body);
      const result = await storage.bulkDeleteUsers(validatedData.ids);
      res.json({
        message: `Deleted ${result.successIds.length} user(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk deleting users:", error);
      res.status(500).json({ error: "Failed to bulk delete users" });
    }
  });

  // Bulk operations - Podcasts
  app.post("/api/admin/podcasts/bulk-update-status", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkUpdatePodcastsStatusSchema.parse(req.body);
      const result = await storage.bulkUpdatePodcastsStatus(
        validatedData.ids,
        validatedData.status,
        req.session.userId!
      );
      res.json({
        message: `Updated ${result.successIds.length} podcast(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk updating podcast status:", error);
      res.status(500).json({ error: "Failed to bulk update podcast status" });
    }
  });

  app.post("/api/admin/podcasts/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkDeletePodcastsSchema.parse(req.body);
      const result = await storage.bulkDeletePodcasts(validatedData.ids);
      res.json({
        message: `Deleted ${result.successIds.length} podcast(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk deleting podcasts:", error);
      res.status(500).json({ error: "Failed to bulk delete podcasts" });
    }
  });

  // Bulk operations - Episodes
  app.post("/api/admin/episodes/bulk-update-status", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkUpdateEpisodesStatusSchema.parse(req.body);
      const result = await storage.bulkUpdateEpisodesStatus(
        validatedData.ids,
        validatedData.status,
        req.session.userId!
      );
      res.json({
        message: `Updated ${result.successIds.length} episode(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk updating episode status:", error);
      res.status(500).json({ error: "Failed to bulk update episode status" });
    }
  });

  app.post("/api/admin/episodes/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const validatedData = bulkDeleteEpisodesSchema.parse(req.body);
      const result = await storage.bulkDeleteEpisodes(validatedData.ids);
      res.json({
        message: `Deleted ${result.successIds.length} episode(s)`,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk deleting episodes:", error);
      res.status(500).json({ error: "Failed to bulk delete episodes" });
    }
  });

  // Email configuration endpoints
  app.get("/api/admin/email-config", requireAdmin, async (req, res) => {
    try {
      const configs = await storage.getAllEmailConfigs();
      // Mask password in response for security
      const maskedConfigs = configs.map(config => ({
        ...config,
        smtpPassword: "********",
      }));
      res.json(maskedConfigs);
    } catch (error) {
      console.error("Error fetching email configs:", error);
      res.status(500).json({ error: "Failed to fetch email configurations" });
    }
  });

  app.get("/api/admin/email-config/active", requireAdmin, async (req, res) => {
    try {
      const config = await storage.getActiveEmailConfig();
      if (!config) {
        return res.status(404).json({ error: "No active email configuration found" });
      }
      // Mask password in response for security
      res.json({
        ...config,
        smtpPassword: "********",
      });
    } catch (error) {
      console.error("Error fetching active email config:", error);
      res.status(500).json({ error: "Failed to fetch active email configuration" });
    }
  });

  app.post("/api/admin/email-config", requireAdmin, async (req, res) => {
    try {
      const validatedData = createEmailConfigSchema.parse(req.body);
      const newConfig = await storage.createEmailConfig(validatedData);
      
      // Mask password in response for security
      res.status(201).json({
        ...newConfig,
        smtpPassword: "********",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating email config:", error);
      res.status(500).json({ error: "Failed to create email configuration" });
    }
  });

  app.patch("/api/admin/email-config/:id", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.id;
      const validatedData = updateEmailConfigSchema.parse(req.body);
      
      const existingConfig = await storage.getAllEmailConfigs();
      if (!existingConfig.find(c => c.id === configId)) {
        return res.status(404).json({ error: "Email configuration not found" });
      }
      
      const updatedConfig = await storage.updateEmailConfig(configId, validatedData);
      
      // Mask password in response for security
      res.json({
        ...updatedConfig,
        smtpPassword: "********",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating email config:", error);
      res.status(500).json({ error: "Failed to update email configuration" });
    }
  });

  app.patch("/api/admin/email-config/:id/activate", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.id;
      const activeConfig = await storage.setActiveEmailConfig(configId);
      
      // Mask password in response for security
      res.json({
        ...activeConfig,
        smtpPassword: "********",
      });
    } catch (error) {
      console.error("Error activating email config:", error);
      res.status(500).json({ error: "Failed to activate email configuration" });
    }
  });

  app.delete("/api/admin/email-config/:id", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.id;
      
      const existingConfig = await storage.getAllEmailConfigs();
      if (!existingConfig.find(c => c.id === configId)) {
        return res.status(404).json({ error: "Email configuration not found" });
      }
      
      await storage.deleteEmailConfig(configId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting email config:", error);
      res.status(500).json({ error: "Failed to delete email configuration" });
    }
  });

  // Google Drive configuration endpoints
  app.get("/api/admin/drive-config", requireAdmin, async (req, res) => {
    try {
      const configs = await storage.getAllDriveConfigs();
      // Mask service account key in response for security
      const maskedConfigs = configs.map(config => ({
        ...config,
        serviceAccountKey: undefined,
        hasServiceAccountKey: !!config.serviceAccountKey,
      }));
      res.json(maskedConfigs);
    } catch (error) {
      console.error("Error fetching drive configs:", error);
      res.status(500).json({ error: "Failed to fetch Google Drive configurations" });
    }
  });

  app.get("/api/admin/drive-config/active", requireAdmin, async (req, res) => {
    try {
      const config = await storage.getActiveDriveConfig();
      if (!config) {
        return res.status(404).json({ error: "No active Google Drive configuration found" });
      }
      // Mask service account key in response for security
      res.json({
        ...config,
        serviceAccountKey: undefined,
        hasServiceAccountKey: !!config.serviceAccountKey,
      });
    } catch (error) {
      console.error("Error fetching active drive config:", error);
      res.status(500).json({ error: "Failed to fetch active Google Drive configuration" });
    }
  });

  app.post("/api/admin/drive-config", requireAdmin, async (req, res) => {
    try {
      const validatedData = createDriveConfigSchema.parse(req.body);
      
      // Force isActive to true for new configs to ensure exactly one active config
      const newConfig = await storage.createDriveConfig({
        ...validatedData,
        isActive: true,
      });
      
      // Clear media orchestrator cache to reload Drive adapter
      await mediaOrchestrator.clearCache();
      
      // Mask service account key in response for security
      res.status(201).json({
        ...newConfig,
        serviceAccountKey: undefined,
        hasServiceAccountKey: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating drive config:", error);
      res.status(500).json({ error: "Failed to create Google Drive configuration" });
    }
  });

  app.patch("/api/admin/drive-config/:id", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.id;
      const validatedData = updateDriveConfigSchema.parse(req.body);
      
      const allConfigs = await storage.getAllDriveConfigs();
      const existingConfig = allConfigs.find(c => c.id === configId);
      if (!existingConfig) {
        return res.status(404).json({ error: "Google Drive configuration not found" });
      }
      
      // Prevent deactivating the sole active configuration
      if (validatedData.isActive === false && existingConfig.isActive) {
        const activeConfigs = allConfigs.filter(c => c.isActive);
        if (activeConfigs.length === 1) {
          return res.status(400).json({ error: "Cannot deactivate the only active Google Drive configuration" });
        }
      }
      
      // Filter out empty/whitespace-only strings to prevent accidental field clearing
      const sanitizedData = Object.fromEntries(
        Object.entries(validatedData).filter(([_, value]) => {
          if (typeof value === "string") {
            return value.trim().length > 0;
          }
          return value !== undefined && value !== null;
        })
      );
      
      const updatedConfig = await storage.updateDriveConfig(configId, sanitizedData);
      
      // Clear media orchestrator cache to reload Drive adapter
      await mediaOrchestrator.clearCache();
      
      // Mask service account key in response for security
      res.json({
        ...updatedConfig,
        serviceAccountKey: undefined,
        hasServiceAccountKey: !!updatedConfig.serviceAccountKey,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating drive config:", error);
      res.status(500).json({ error: "Failed to update Google Drive configuration" });
    }
  });

  app.patch("/api/admin/drive-config/:id/activate", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.id;
      const activeConfig = await storage.setActiveDriveConfig(configId);
      
      // Clear media orchestrator cache to reload Drive adapter
      await mediaOrchestrator.clearCache();
      
      // Mask service account key in response for security
      res.json({
        ...activeConfig,
        serviceAccountKey: undefined,
        hasServiceAccountKey: !!activeConfig.serviceAccountKey,
      });
    } catch (error) {
      console.error("Error activating drive config:", error);
      res.status(500).json({ error: "Failed to activate Google Drive configuration" });
    }
  });

  app.delete("/api/admin/drive-config/:id", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.id;
      
      const existingConfig = await storage.getAllDriveConfigs();
      if (!existingConfig.find(c => c.id === configId)) {
        return res.status(404).json({ error: "Google Drive configuration not found" });
      }
      
      await storage.deleteDriveConfig(configId);
      
      // Clear media orchestrator cache to reload Drive adapter
      await mediaOrchestrator.clearCache();
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting drive config:", error);
      res.status(500).json({ error: "Failed to delete Google Drive configuration" });
    }
  });

  app.post("/api/admin/drive-config/test", requireAdmin, async (req, res) => {
    try {
      const validatedData = testDriveConfigSchema.parse(req.body);
      
      // Test the connection directly using Google Drive API
      const { google } = await import("googleapis");
      
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(validatedData.serviceAccountKey),
        scopes: ["https://www.googleapis.com/auth/drive"],
      });

      const drive = google.drive({ version: "v3", auth });
      
      // Test access to both folders
      const imagesFolderCheck = await drive.files.get({
        fileId: validatedData.folderIdImages,
        fields: "id, name",
      });
      
      const audioFolderCheck = await drive.files.get({
        fileId: validatedData.folderIdAudio,
        fields: "id, name",
      });
      
      res.json({ 
        success: true, 
        message: `Conexión exitosa. Carpetas encontradas: "${imagesFolderCheck.data.name}" y "${audioFolderCheck.data.name}"` 
      });
    } catch (error: any) {
      console.error("Error testing drive config:", error);
      
      // Map Google Drive API errors to user-friendly messages
      const errorMessage = error.code === 404 
        ? "Carpeta no encontrada. Verifica los IDs de carpeta."
        : error.code === 403
        ? "Permiso denegado. Asegúrate de que la cuenta de servicio tenga acceso a las carpetas."
        : error.message || "Error al conectar con Google Drive";
      
      res.status(400).json({ error: errorMessage });
    }
  });

  // Test the active saved configuration
  app.post("/api/admin/drive-config/test-saved", requireAdmin, async (req, res) => {
    try {
      const configs = await storage.getAllDriveConfigs();
      const activeConfig = configs.find(c => c.isActive);
      
      if (!activeConfig) {
        return res.status(404).json({ error: "No hay configuración de Google Drive activa guardada" });
      }
      
      console.log("🔍 Testing Drive config with:");
      console.log("  - Email:", activeConfig.serviceAccountEmail);
      console.log("  - Images folder ID:", activeConfig.folderIdImages);
      console.log("  - Audio folder ID:", activeConfig.folderIdAudio);
      
      // Test the connection directly using Google Drive API
      const { google } = await import("googleapis");
      
      const parsedCredentials = JSON.parse(activeConfig.serviceAccountKey);
      console.log("  - Service account from key:", parsedCredentials.client_email);
      
      const auth = new google.auth.GoogleAuth({
        credentials: parsedCredentials,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });

      const drive = google.drive({ version: "v3", auth });
      
      console.log("🔍 Checking images folder...");
      // Test access to both folders
      const imagesFolderCheck = await drive.files.get({
        fileId: activeConfig.folderIdImages,
        fields: "id, name, permissions",
      });
      console.log("✅ Images folder found:", imagesFolderCheck.data.name);
      
      console.log("🔍 Checking audio folder...");
      const audioFolderCheck = await drive.files.get({
        fileId: activeConfig.folderIdAudio,
        fields: "id, name, permissions",
      });
      console.log("✅ Audio folder found:", audioFolderCheck.data.name);
      
      res.json({ 
        success: true, 
        message: `Conexión exitosa. Carpetas encontradas: "${imagesFolderCheck.data.name}" y "${audioFolderCheck.data.name}"` 
      });
    } catch (error: any) {
      console.error("❌ Error testing saved drive config:");
      console.error("  - Error code:", error.code);
      console.error("  - Error message:", error.message);
      console.error("  - Full error:", JSON.stringify(error, null, 2));
      
      // Map Google Drive API errors to user-friendly messages
      const errorMessage = error.code === 404 
        ? "Carpeta no encontrada. Verifica los IDs de carpeta."
        : error.code === 403
        ? `Permiso denegado. Asegúrate de que la cuenta de servicio (${error.config?.credentials?.client_email || 'service account'}) tenga acceso a las carpetas con permisos de Editor.`
        : error.message || "Error al conectar con Google Drive";
      
      res.status(400).json({ error: errorMessage });
    }
  });

  // Emergency endpoint to reset admin password (use only once in production)
  app.post("/api/emergency/reset-admin-password", async (req, res) => {
    try {
      // Security: Only allow if ADMIN_PASSWORD is set in environment
      if (!process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: "Emergency reset not configured" });
      }

      // Get admin email from environment or default
      const adminEmail = process.env.ADMIN_EMAIL || "admin@podcasthub.local";
      
      // Find admin user
      const user = await storage.getUserByEmail(adminEmail);
      if (!user) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      if (user.role !== "ADMIN") {
        return res.status(403).json({ error: "User is not an admin" });
      }

      // Hash the new password from environment
      const newPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      
      // Update password
      await storage.updateUserPassword(user.id, newPasswordHash);
      
      res.json({ 
        message: "Admin password reset successfully",
        email: adminEmail,
        note: "You can now login with the password from ADMIN_PASSWORD environment variable"
      });
    } catch (error) {
      console.error("Error resetting admin password:", error);
      res.status(500).json({ error: "Failed to reset admin password" });
    }
  });

  // Register Multer error handler (must be after all routes)
  app.use(handleMulterError);

  const httpServer = createServer(app);
  return httpServer;
}
