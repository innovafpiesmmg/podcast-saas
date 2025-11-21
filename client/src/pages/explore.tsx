import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Heart, HeartOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import type { PodcastWithSubscription } from "@shared/schema";

export default function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: podcasts = [], isLoading } = useQuery<PodcastWithSubscription[]>({
    queryKey: ["/api/podcasts"],
  });

  const filteredPodcasts = podcasts.filter((podcast) => {
    const query = searchQuery.toLowerCase();
    return (
      podcast.title.toLowerCase().includes(query) ||
      podcast.description.toLowerCase().includes(query) ||
      podcast.category.toLowerCase().includes(query)
    );
  });

  const handleSubscribe = async (podcastId: string, isSubscribed: boolean) => {
    try {
      if (isSubscribed) {
        await apiRequest("DELETE", `/api/podcasts/${podcastId}/subscribe`);
        toast({
          title: "Desuscrito",
          description: "Te has desuscrito del podcast",
        });
      } else {
        await apiRequest("POST", `/api/podcasts/${podcastId}/subscribe`);
        toast({
          title: "Suscrito",
          description: "Te has suscrito al podcast",
        });
      }
      
      // Invalidate both podcasts and library queries
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/library"] });
    } catch (error: any) {
      if (error.message?.includes("401")) {
        toast({
          variant: "destructive",
          title: "No autenticado",
          description: "Debes iniciar sesión para suscribirte",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo actualizar la suscripción",
        });
      }
    }
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold font-[Outfit] mb-3" data-testid="text-page-title">
            Explorar Podcasts
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Descubre y suscríbete a podcasts de tus creadores favoritos
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar podcasts, categorías..."
            className="pl-10"
            data-testid="input-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="h-48 bg-muted animate-pulse" />
                <CardContent className="p-4">
                  <div className="h-6 bg-muted animate-pulse mb-2" />
                  <div className="h-4 bg-muted animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredPodcasts.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-lg">
            <p className="text-muted-foreground">
              {searchQuery
                ? "No se encontraron podcasts que coincidan con tu búsqueda"
                : "No hay podcasts disponibles aún"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPodcasts.map((podcast) => (
              <Card
                key={podcast.id}
                className="overflow-hidden hover-elevate active-elevate-2"
                data-testid={`card-podcast-${podcast.id}`}
              >
                <Link href={`/podcast/${podcast.id}`}>
                  <div className="cursor-pointer">
                    {podcast.coverArtUrl ? (
                      <img
                        src={podcast.coverArtUrl}
                        alt={podcast.title}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <span className="text-4xl font-bold text-primary/40 font-[Outfit]">
                          {podcast.title.charAt(0)}
                        </span>
                      </div>
                    )}
                    <CardContent className="p-4">
                      <h3 className="font-bold text-lg mb-1 line-clamp-1" data-testid="text-podcast-title">
                        {podcast.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {podcast.description}
                      </p>
                      <span className="inline-block px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                        {podcast.category}
                      </span>
                    </CardContent>
                  </div>
                </Link>
                <CardFooter className="p-4 pt-0">
                  <Button
                    variant={podcast.isSubscribed ? "secondary" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() => handleSubscribe(podcast.id, podcast.isSubscribed || false)}
                    data-testid={`button-subscribe-${podcast.id}`}
                  >
                    {podcast.isSubscribed ? (
                      <>
                        <HeartOff className="h-4 w-4 mr-2" />
                        Desuscribirse
                      </>
                    ) : (
                      <>
                        <Heart className="h-4 w-4 mr-2" />
                        Suscribirse
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
