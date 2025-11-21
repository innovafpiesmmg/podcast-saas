import { useQuery } from "@tanstack/react-query";
import { PodcastCard } from "@/components/podcast-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Podcast } from "@shared/schema";

export default function Home() {
  const { data: podcasts, isLoading } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  return (
    <div className="min-h-screen pb-32">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-5xl font-bold font-[Outfit] mb-3" data-testid="text-hero-title">
            Descubre Podcasts
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Explora miles de podcasts de tus creadores favoritos. Escucha, aprende y descubre contenido increíble.
          </p>
        </div>
      </div>

      {/* Podcasts Grid */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold font-[Outfit]">Todos los Podcasts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {podcasts?.length || 0} podcasts disponibles
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : podcasts && podcasts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {podcasts.map((podcast) => (
              <PodcastCard key={podcast.id} podcast={podcast} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">
              No hay podcasts disponibles todavía.
            </p>
            <p className="text-sm text-muted-foreground">
              Sé el primero en crear un podcast.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
