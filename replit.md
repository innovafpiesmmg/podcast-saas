# Multitenant Podcast Platform

## Overview
This platform is a full-stack TypeScript multitenant podcast solution enabling creators to publish, manage, and distribute podcasts. It offers listeners a streamlined experience with embeddable audio players and RSS feed support. Inspired by Spotify and Substack, the platform focuses on empowering creators through intuitive dashboards and broad content reach. Its core purpose is to simplify podcast creation and consumption, catering to both content creators and their audience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React with TypeScript (Vite), styled with Tailwind CSS and shadcn/ui (New York style) built on Radix UI. Design is responsive, with a focus on creator dashboards and listener simplicity. Visual consistency is maintained through gradient hero backgrounds and custom branding (favicon, Inter/Outfit fonts, HSL color palette).

### Technical Implementations
- **Frontend**: React (Vite), Wouter for routing, TanStack Query for state management, shadcn/ui, Tailwind CSS.
- **Backend**: Express.js (Node.js), RESTful API, Zod for validation.
- **Database**: PostgreSQL (Neon) with Drizzle ORM for type-safe schema and migrations.
- **Authentication**: Session-based with PostgreSQL store, bcryptjs for passwords, three-tier role system (ADMIN, CREATOR, LISTENER), `requireAuth` middleware for security.
- **Multitenancy**: Achieved via `ownerId` foreign keys and cross-tenant protection.
- **RSS Feed**: Generates RSS 2.0 feeds with iTunes extensions, including dynamic URLs and ETag caching.
- **Embedding**: Dedicated episode pages with embeddable HTML5 players and rich meta tags (Open Graph, Twitter Card).
- **Cover Art Fallback**: Centralized logic ensures episodes inherit podcast cover art if none is specified, enhancing visual consistency across all content delivery methods (API, RSS, embeds).
- **Subscription System**: Allows users to subscribe/unsubscribe from podcasts with real-time UI updates and unique constraint enforcement.
- **User Profile**: Users can manage their profile and change passwords through dedicated pages and secure API endpoints.
- **Password Recovery**: Implemented with secure, single-use, time-limited tokens and an API for requesting and resetting passwords.
- **Email System**: 
  - Admin-configurable SMTP settings using Nodemailer for sending various notifications (password resets, welcome emails, email verification, content approvals, new episode notifications)
  - `getEmailService()` helper function provides graceful fallback to MockEmailService when no active SMTP configuration exists
  - Email failures are logged but don't block critical operations (registration, password reset) for security and reliability
  - Welcome emails sent automatically on user registration
  - Password reset emails include secure, single-use tokens with expiration (1 hour)
  - **Email Verification System**: 
    - Verification emails sent automatically upon registration with 24-hour expiration tokens
    - Users can resend verification emails if expired or not received
    - Dedicated `/verify-email` page for token-based verification
    - Email verification status tracked in user profile (`emailVerified` field)
- **Media Serving**: 
  - Production-ready `/media/:type/:filename` endpoint with database-driven asset lookup via `getMediaAssetByStorageKey()`
  - Multi-storage support through `mediaOrchestrator.streamMedia()` handles both LOCAL and GOOGLE_DRIVE providers seamlessly
  - Correct Content-Type headers set from database metadata
  - Efficient streaming with proper error handling for missing assets
- **Admin Panel**: Comprehensive admin interface for user, podcast, and episode moderation, including content approval workflows (DRAFT, PENDING_APPROVAL, APPROVED, REJECTED), role management, and email configuration.
  - **Bulk Management Operations**: Production-ready multi-select system across admin users, podcasts, and episodes pages:
    - Checkbox-based selection with "select all" toggle
    - Bulk actions: delete, approve/reject (content), activate/deactivate (users)
    - Maximum 50 items per bulk operation with UUID validation
    - Protected AlertDialogs prevent double-submit via disabled controls during pending operations
    - Structured error handling: operations return successIds/failed arrays, UI shows separate toasts with specific identifiers (usernames, titles)
    - Smart selection management: successful IDs auto-removed, failed IDs preserved for retry
    - Selection auto-resets when filters change (statusFilter, searchQuery) to prevent stale selections
    - Select-all checkbox only checked when items exist AND all are selected (prevents checked state with empty tables)
- **Content Management**: Creators and admins can edit podcast and episode metadata, including cover art.
- **File Upload System**: Supports cover images and audio files with immediate upload to either local storage or Google Drive, including size limits and type validation.
- **Creator Workflow**: Dedicated "My Podcasts" section for creators to manage their content and add new episodes, with clear status indicators for moderation.
- **Privacy Control System**: 
  - Three visibility levels: PRIVATE (creator only), UNLISTED (invite-only via email), PUBLIC (everyone)
  - Separate `visibility` field from `moderationStatus` for independent access control and content approval workflows
  - Email-based invitation system (`contentInvitations` table) for UNLISTED/PRIVATE content at both podcast and episode levels
  - Access control methods (`checkUserHasAccessToPodcast`, `checkUserHasAccessToEpisode`) verify visibility + invitations before serving content
  - REST API endpoints for invitation management:
    - POST `/api/invitations` (accepts `podcastId` OR `episodeId` in body)
    - GET `/api/podcasts/:id/invitations` and `/api/episodes/:id/invitations`
    - DELETE `/api/invitations/:id`
  - Dedicated `/manage-invitations` page for creators to add/remove email invitations with real-time updates
  - Visibility controls integrated into all creator forms (create-podcast, edit-podcast, add-episode, add-episode, edit-episode) with Lock/Users/Globe icons
  - "Gestionar Invitaciones" buttons appear on podcast-detail and episode-detail pages only for owners when content is UNLISTED/PRIVATE
- **Episode Search & Filtering**:
  - Real-time search functionality filters episodes by title and notes (case-insensitive)
  - Inline clear button (X) appears when search has text for quick reset
  - Sort options: date (newest/oldest first), alphabetical (A-Z/Z-A), listened status
  - Listened episode tracking: AudioPlayer automatically marks episodes as "listened" after 80% playback completion
  - LocalStorage persistence for listened episodes with live UI updates via custom window events
  - Empty state message with clear-search button when no results found
  - Responsive layout: stacked on mobile, horizontal on desktop
  - `insertEpisodeSchema` accepts optional `publishedAt` field for custom publish dates during episode creation
- **Playlist System**:
  - Users can create, edit, and delete personal playlists to organize favorite episodes
  - Database schema: `playlists` table (id, name, description, userId, isPublic, createdAt, updatedAt) and `playlistEpisodes` junction table (playlistId, episodeId, position)
  - Public/private visibility: playlists can be shared publicly or kept private
  - Episode management: add, remove, and reorder episodes within playlists via drag-and-drop or manual position updates
  - API endpoints for full CRUD operations:
    - POST/GET/PATCH/DELETE `/api/playlists` and `/api/playlists/:id`
    - POST/DELETE `/api/playlists/:id/episodes/:episodeId`
    - PUT `/api/playlists/:id/reorder` for episode reordering
  - Frontend pages:
    - `/my-playlists`: Manage user's playlists (create, edit, delete, view)
    - `/playlists/:id`: View playlist details with integrated audio player for each episode
  - AddToPlaylistButton component: Quick-add episodes to playlists from episode detail pages
  - Share functionality: Public playlists generate shareable URLs
  - Seamless audio playback: AudioPlayer integrated in playlist view for continuous listening
- **User Guide / Manual de Uso**:
  - Comprehensive interactive manual accessible from avatar menu
  - Three role-specific tabs with collapsible accordion sections:
    - **Oyentes (Listeners)**: Exploring podcasts, subscribing, searching episodes, playback controls, sharing, profile management
    - **Creadores (Creators)**: Creating podcasts, adding episodes, privacy controls, invitations, editing, RSS distribution, moderation states, best practices
    - **Administradores (Admins)**: Admin panel navigation, user management, content moderation (podcasts/episodes), email configuration, Google Drive setup, bulk operations, moderation best practices
  - Clear step-by-step instructions with nested lists for complex workflows
  - Accessible at `/user-guide` route
- **Local Folder Import** (Admin-only):
  - Bulk upload system allowing import of multiple MP3 files as podcast episodes
  - Supports up to 50 audio files simultaneously via multipart/form-data
  - Episode titles auto-generated from filenames, editable post-import
  - Optional podcast cover art upload
  - Endpoint: POST `/api/import-local` with FormData (audioFiles[], coverArt, metadata)
  - Schema validation via `localImportSchema` from shared/schema.ts
  - Frontend: `/import-local` page with drag-and-drop interface
- **RSS Import** (Creator/Admin):
  - Import podcasts from external RSS feeds
  - Fetches metadata and episode links (audio not downloaded locally)
  - Configurable episode limit (default 10, max 50)
  - Content requires admin approval before publication

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL serverless).
- **Fonts**: Google Fonts (Inter, Outfit).
- **Images**: Unsplash (for seed data).
- **Audio Hosting**: External services (e.g., CDN, cloud storage) for `audioUrl`.
- **UI Libraries**: Radix UI, Lucide React, Class Variance Authority (CVA), Embla Carousel.
- **Form Handling**: React Hook Form with Zod resolver.
- **Date Utilities**: date-fns.
- **Cloud Storage (Optional)**: Google Drive API (for DriveStorageAdapter).