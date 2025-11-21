import { useQuery } from "@tanstack/react-query";
import { Library as LibraryIcon, HeartOff } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Podcast } from "@shared/schema";

export default function Library() {
  const { toast } = useToast();

  const { data: podcasts = [], isLoading } = useQuery<Podcast[]>({
    queryKey: ["/api/library"],
  });

  const handleUnsubscribe = async (podcastId: string) => {
    try {
      await apiRequest("DELETE", `/api/podcasts/${podcastId}/subscribe`);
      
      toast({
        title: "Desuscrito",
        description: "Te has desuscrito del podcast",
      });
      
      // Invalidate both queries
      queryClient.invalidateQueries({ queryKey: ["/api/library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts"] });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo desuscribir del podcast",
      });
    }
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold font-[Outfit] mb-3" data-testid="text-page-title">
            Mi Biblioteca
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Tus podcasts favoritos en un solo lugar
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="h-48 bg-muted animate-pulse" />
                <CardContent className="p-4">
                  <div className="h-6 bg-muted animate-pulse mb-2" />
                  <div className="h-4 bg-muted animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : podcasts.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-lg">
            <LibraryIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">Tu biblioteca está vacía</p>
            <p className="text-sm text-muted-foreground mb-4">
              Los podcasts a los que te suscribas aparecerán aquí
            </p>
            <Link href="/explore">
              <Button data-testid="button-explore">Explorar Podcasts</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {podcasts.map((podcast) => (
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
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => handleUnsubscribe(podcast.id)}
                    data-testid={`button-unsubscribe-${podcast.id}`}
                  >
                    <HeartOff className="h-4 w-4 mr-2" />
                    Desuscribirse
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
