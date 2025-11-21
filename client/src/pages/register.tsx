import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2 } from "lucide-react";
import podcastImage from "@assets/Podcast_1763056132847.png";
import logoImage from "@assets/favicon_1763064849361.png";

export default function Register() {
  const [, setLocation] = useLocation();
  const { register, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"LISTENER" | "CREATOR">("LISTENER");

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await register(username, email, password, role);
      toast({
        title: "¡Cuenta creada!",
        description: "Tu cuenta ha sido creada exitosamente",
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al registrarse",
        description: error.message || "No se pudo crear la cuenta",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Register form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <img 
              src={logoImage} 
              alt="PodcastHub Logo" 
              className="w-20 h-20"
              data-testid="img-logo"
            />
            <div className="text-center">
              <h1 className="text-3xl font-bold">PodcastHub</h1>
              <p className="text-muted-foreground">Tu plataforma de podcasts</p>
            </div>
          </div>

          {/* Register Card */}
          <Card className="w-full border-0 shadow-none">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/10">
                  <UserPlus className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Crear Cuenta</CardTitle>
                  <CardDescription>Completa el formulario para unirte</CardDescription>
                </div>
              </div>
            </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Nombre de usuario</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="tu_usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="input-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Tipo de cuenta</Label>
                <Select value={role} onValueChange={(value: "LISTENER" | "CREATOR") => setRole(value)}>
                  <SelectTrigger id="role" data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LISTENER" data-testid="select-listener">Oyente</SelectItem>
                    <SelectItem value="CREATOR" data-testid="select-creator">Creador de Contenido</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Los creadores pueden publicar podcasts
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                data-testid="button-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  "Crear Cuenta"
                )}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-primary hover:underline font-medium" data-testid="link-login">
                  Inicia sesión aquí
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
        </div>
      </div>

      {/* Right side - Image */}
      <div className="hidden lg:block flex-1 relative overflow-hidden">
        <img 
          src={podcastImage} 
          alt="Podcast platform" 
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    </div>
  );
}
