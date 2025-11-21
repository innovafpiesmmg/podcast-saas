# Design Guidelines: Multitenant Podcast Platform

## Design Approach
**Reference-Based**: Drawing inspiration from Spotify (audio playback), Substack (creator-focused content), and Anchor (podcast management). This platform serves both content creators and listeners, requiring a dual-interface design approach.

## Core Design Principles
- **Creator Empowerment**: Dashboard-focused design for podcast creators with analytics prominence
- **Listener Simplicity**: Clean, distraction-free listening experience
- **Embeddable First**: Lightweight, portable player design that works anywhere

---

## Typography
**Primary Font**: Inter (Google Fonts) - modern, highly legible for data/dashboards
**Accent Font**: Outfit (Google Fonts) - friendly, approachable for podcast titles

**Hierarchy**:
- Podcast Titles: text-3xl font-bold (Outfit)
- Episode Titles: text-xl font-semibold (Inter)
- Body Text: text-base font-normal (Inter)
- Metadata (duration, date): text-sm font-medium text-gray-500

---

## Layout System
**Spacing Units**: Consistent use of Tailwind units: **2, 4, 6, 12, 16, 24**
- Tight spacing (p-2, gap-2): Within cards, between related elements
- Standard spacing (p-4, p-6): Card padding, form fields
- Generous spacing (p-12, p-16, p-24): Section dividers, hero areas

**Container Strategy**:
- Dashboard content: max-w-7xl mx-auto
- Episode cards: max-w-3xl for optimal readability
- Embed player: 100% width, responsive

---

## Component Library

### 1. Embeddable Episode Player (Priority)
**Design**: Minimalist, brand-agnostic HTML5 player
- Height: h-24 (compact mode) or h-32 (expanded with waveform)
- Layout: Horizontal flex with album art (if available), play/pause, progress bar, time stamps
- Controls: Native browser audio controls initially, custom SVG play/pause button
- Background: Subtle gradient or solid with rounded-lg borders
- No branding unless explicitly added via query params

### 2. Creator Dashboard
**Layout**: Sidebar navigation (w-64) + main content area
- Sidebar: Podcast list, analytics, settings, upload new episode
- Main Area: Episode list (table or card grid), analytics charts
- Stats Cards: Grid layout (grid-cols-3) showing total plays, subscribers, latest episode performance

### 3. Episode Cards
**Design**: Horizontal card layout
- Left: Square album art (w-24 h-24, rounded-lg)
- Center: Title, description preview (2-line clamp), metadata
- Right: Play button (w-12 h-12, circular), duration badge, menu (3-dot)
- Hover: Subtle shadow elevation, play button color shift

### 4. Podcast Cover Art
**Specifications**:
- Square aspect ratio (1:1)
- Sizes: Thumbnail (96x96), Card (192x192), Hero (512x512)
- Rounded corners: rounded-lg for cards, rounded-xl for hero displays
- Fallback: Gradient with podcast initials if no image uploaded

### 5. Audio Waveform (Enhancement)
**Visual**: Thin bars representing audio amplitude
- Placement: Above/below progress bar in player
- Interaction: Clickable for seeking to specific timestamp
- Style: Subtle, monochromatic bars with active section highlighted

### 6. Forms (Upload Episode)
**Layout**: Single column, max-w-2xl
- Large dropzone for audio file (drag & drop, h-48 with dashed border)
- Text inputs: Title, description (textarea h-32)
- Cover art uploader (secondary, smaller dropzone)
- Submit: Large primary button (w-full on mobile, w-auto on desktop)

---

## Icons
**Library**: Heroicons (outline for UI, solid for active states)
- Play/Pause: Circle icons (musical note inside)
- Upload: Cloud arrow up
- Analytics: Chart bar
- Settings: Cog
- Menu: Ellipsis vertical

---

## Navigation Patterns

### Creator Interface
**Top Bar**: Logo left, search center, profile/settings right
**Sidebar**: Vertical nav with icons + labels
- Dashboard
- My Podcasts
- Analytics
- Upload Episode
- Settings

### Listener Interface (Future)
**Top Bar**: Logo, Browse, Library, Search, Profile
**Content**: Podcast grid (grid-cols-2 md:grid-cols-4 lg:grid-cols-6)

---

## Data Visualization (Analytics)
**Chart Types**:
- Line chart: Plays over time (7/30/90 day views)
- Bar chart: Top episodes by plays
- Donut chart: Listener demographics (if available)

**Style**: Clean, minimal gridlines, prominent data labels

---

## Animations
**Minimal Use**:
- Play button: Scale on press (scale-95 active:scale-90)
- Card hover: Subtle translate-y-1 lift
- Waveform: Pulse animation during playback
- NO page transitions, NO scroll-triggered animations

---

## Images

**Hero Section** (Marketing/Landing Page if built):
- Large hero image showing podcast recording setup or diverse creators
- Size: Full-width, h-[60vh], with overlay gradient for text readability
- CTA buttons over hero: Blurred background (backdrop-blur-md bg-white/20)

**Dashboard**: No hero image needed, function-first interface

**Episode Cards**: Always display podcast cover art (square, left-aligned)

---

## Accessibility
- All audio players: Full keyboard navigation (space to play/pause, arrow keys for seek)
- Form inputs: Proper labels, error states with clear messaging
- Focus states: Visible ring-2 ring-offset-2 on all interactive elements
- Color contrast: WCAG AA minimum for all text

---

## Responsive Breakpoints
- Mobile (default): Single column layouts, full-width players
- Tablet (md:768px): 2-column grids, sidebar collapses to icon-only
- Desktop (lg:1024px): Full sidebar, 3-4 column grids, expanded player controls

This foundation prioritizes the embeddable player while providing a scalable framework for the full creator/listener platform.