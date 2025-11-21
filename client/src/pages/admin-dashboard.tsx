import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Radio, Mic2, CheckCircle, Clock, XCircle, FileText } from "lucide-react";
import type { User, Podcast, Episode } from "@shared/schema";

export default function AdminDashboard() {
  const { data: users, isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: podcasts, isLoading: loadingPodcasts } = useQuery<Podcast[]>({
    queryKey: ["/api/admin/podcasts"],
  });

  const { data: episodes, isLoading: loadingEpisodes } = useQuery<Episode[]>({
    queryKey: ["/api/admin/episodes"],
  });

  const isLoading = loadingUsers || loadingPodcasts || loadingEpisodes;

  // Calculate statistics
  const stats = {
    totalUsers: users?.length || 0,
    activeUsers: users?.filter(u => u.isActive).length || 0,
    admins: users?.filter(u => u.role === "ADMIN").length || 0,
    creators: users?.filter(u => u.role === "CREATOR").length || 0,
    listeners: users?.filter(u => u.role === "LISTENER").length || 0,
    totalPodcasts: podcasts?.length || 0,
    approvedPodcasts: podcasts?.filter(p => p.status === "APPROVED").length || 0,
    pendingPodcasts: podcasts?.filter(p => p.status === "PENDING_APPROVAL").length || 0,
    rejectedPodcasts: podcasts?.filter(p => p.status === "REJECTED").length || 0,
    draftPodcasts: podcasts?.filter(p => p.status === "DRAFT").length || 0,
    totalEpisodes: episodes?.length || 0,
    approvedEpisodes: episodes?.filter(e => e.status === "APPROVED").length || 0,
    pendingEpisodes: episodes?.filter(e => e.status === "PENDING_APPROVAL").length || 0,
    rejectedEpisodes: episodes?.filter(e => e.status === "REJECTED").length || 0,
    draftEpisodes: episodes?.filter(e => e.status === "DRAFT").length || 0,
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-[Outfit]">Panel de Administración</h1>
        <p className="text-muted-foreground mt-1">
          Vista general de la plataforma y contenido pendiente de moderación
        </p>
      </div>

      {/* User Statistics */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Usuarios</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeUsers} activos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administradores</CardTitle>
              <Badge variant="destructive" className="h-5 px-2">ADMIN</Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.admins}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Creadores</CardTitle>
              <Badge variant="default" className="h-5 px-2">CREATOR</Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.creators}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Oyentes</CardTitle>
              <Badge variant="secondary" className="h-5 px-2">LISTENER</Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.listeners}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Podcast Statistics */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Podcasts</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Radio className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalPodcasts}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aprobados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-600">{stats.approvedPodcasts}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-yellow-600">{stats.pendingPodcasts}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rechazados</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-red-600">{stats.rejectedPodcasts}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Borradores</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.draftPodcasts}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Episode Statistics */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Episodios</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Mic2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalEpisodes}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aprobados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-600">{stats.approvedEpisodes}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-yellow-600">{stats.pendingEpisodes}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rechazados</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-red-600">{stats.rejectedEpisodes}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Borradores</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats.draftEpisodes}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pending Actions Alert */}
      {!isLoading && (stats.pendingPodcasts > 0 || stats.pendingEpisodes > 0) && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="text-yellow-600 dark:text-yellow-500">
              Contenido Pendiente de Moderación
            </CardTitle>
            <CardDescription>
              Hay contenido esperando tu revisión
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.pendingPodcasts > 0 && (
              <p className="text-sm">
                • <strong>{stats.pendingPodcasts}</strong> podcast{stats.pendingPodcasts !== 1 ? 's' : ''} pendiente{stats.pendingPodcasts !== 1 ? 's' : ''} de aprobación
              </p>
            )}
            {stats.pendingEpisodes > 0 && (
              <p className="text-sm">
                • <strong>{stats.pendingEpisodes}</strong> episodio{stats.pendingEpisodes !== 1 ? 's' : ''} pendiente{stats.pendingEpisodes !== 1 ? 's' : ''} de aprobación
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
