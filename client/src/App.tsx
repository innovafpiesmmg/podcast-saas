import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider } from "@/components/auth-provider";
import { ProtectedRoute } from "@/components/protected-route";
import { UserMenu } from "@/components/user-menu";
import { Footer } from "@/components/footer";
import { Radio } from "lucide-react";
import Home from "@/pages/home";
import PodcastDetail from "@/pages/podcast-detail";
import EpisodeDetail from "@/pages/episode-detail";
import CreatePodcast from "@/pages/create-podcast";
import EditPodcast from "@/pages/edit-podcast";
import AddEpisode from "@/pages/add-episode";
import EditEpisode from "@/pages/edit-episode";
import MyPodcasts from "@/pages/my-podcasts";
import Explore from "@/pages/explore";
import Library from "@/pages/library";
import Settings from "@/pages/settings";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import VerifyEmail from "@/pages/verify-email";
import EmergencyReset from "@/pages/emergency-reset";
import ImportRSS from "@/pages/import-rss";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminUsers from "@/pages/admin-users";
import AdminPodcasts from "@/pages/admin-podcasts";
import AdminEpisodes from "@/pages/admin-episodes";
import AdminEmailConfig from "@/pages/admin-email-config";
import AdminDriveConfig from "@/pages/admin-drive-config";
import Profile from "@/pages/profile";
import ManageInvitations from "@/pages/manage-invitations";
import UserGuide from "@/pages/user-guide";
import ImportYouTube from "@/pages/import-youtube";
import ImportLocal from "@/pages/import-local";
import MyPlaylists from "@/pages/my-playlists";
import PlaylistDetail from "@/pages/playlist-detail";
import NotFound from "@/pages/not-found";

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === "/login" || location === "/register" || location === "/forgot-password" || location.startsWith("/reset-password") || location.startsWith("/verify-email") || location === "/emergency-reset";

  // Auth pages (no sidebar)
  if (isAuthPage) {
    return (
      <div className="min-h-screen w-full flex flex-col">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <div className="flex-1">
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/register" component={Register} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/emergency-reset" component={EmergencyReset} />
          </Switch>
        </div>
        <Footer />
      </div>
    );
  }

  // Main app pages (with sidebar)
  return (
    <div className="flex flex-col h-screen w-full">
      {/* Header arriba de todo */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background z-50 shrink-0">
        <div className="flex items-center gap-4">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Radio className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold font-[Outfit]">PodcastHub</span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      {/* Sidebar y contenido debajo del header */}
      <div className="flex flex-1 overflow-hidden relative">
        <AppSidebar />
        <main className="flex-1 overflow-auto flex flex-col">
          <div className="flex-1">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/podcast/:podcastId/add-episode">
                <ProtectedRoute requireRole="CREATOR">
                  <AddEpisode />
                </ProtectedRoute>
              </Route>
              <Route path="/podcast/:id" component={PodcastDetail} />
              <Route path="/episode/:id" component={EpisodeDetail} />
              <Route path="/my-podcasts">
                <ProtectedRoute requireRole="CREATOR">
                  <MyPodcasts />
                </ProtectedRoute>
              </Route>
              <Route path="/import-rss">
                <ProtectedRoute requireRole="CREATOR">
                  <ImportRSS />
                </ProtectedRoute>
              </Route>
              <Route path="/import-youtube">
                <ProtectedRoute requireRole="ADMIN">
                  <ImportYouTube />
                </ProtectedRoute>
              </Route>
              <Route path="/import-local">
                <ProtectedRoute requireRole="ADMIN">
                  <ImportLocal />
                </ProtectedRoute>
              </Route>
              <Route path="/create">
                <ProtectedRoute requireRole="CREATOR">
                  <CreatePodcast />
                </ProtectedRoute>
              </Route>
              <Route path="/edit-podcast/:id">
                <ProtectedRoute requireRole="CREATOR">
                  <EditPodcast />
                </ProtectedRoute>
              </Route>
              <Route path="/edit-episode/:id">
                <ProtectedRoute requireRole="CREATOR">
                  <EditEpisode />
                </ProtectedRoute>
              </Route>
              <Route path="/manage-invitations/:contentType/:id">
                <ProtectedRoute requireRole="CREATOR">
                  <ManageInvitations />
                </ProtectedRoute>
              </Route>
              <Route path="/explore" component={Explore} />
              <Route path="/library" component={Library} />
              <Route path="/my-playlists">
                <ProtectedRoute>
                  <MyPlaylists />
                </ProtectedRoute>
              </Route>
              <Route path="/playlists/:id" component={PlaylistDetail} />
              <Route path="/settings" component={Settings} />
              <Route path="/user-guide" component={UserGuide} />
              <Route path="/profile">
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              </Route>
              <Route path="/admin">
                <ProtectedRoute requireRole="ADMIN">
                  <AdminDashboard />
                </ProtectedRoute>
              </Route>
              <Route path="/admin/users">
                <ProtectedRoute requireRole="ADMIN">
                  <AdminUsers />
                </ProtectedRoute>
              </Route>
              <Route path="/admin/podcasts">
                <ProtectedRoute requireRole="ADMIN">
                  <AdminPodcasts />
                </ProtectedRoute>
              </Route>
              <Route path="/admin/episodes">
                <ProtectedRoute requireRole="ADMIN">
                  <AdminEpisodes />
                </ProtectedRoute>
              </Route>
              <Route path="/admin/email-config">
                <ProtectedRoute requireRole="ADMIN">
                  <AdminEmailConfig />
                </ProtectedRoute>
              </Route>
              <Route path="/admin/drive-config">
                <ProtectedRoute requireRole="ADMIN">
                  <AdminDriveConfig />
                </ProtectedRoute>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AuthProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <Router />
            </SidebarProvider>
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
