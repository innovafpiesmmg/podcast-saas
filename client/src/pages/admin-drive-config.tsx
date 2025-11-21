import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Cloud, FolderOpen, Key, CheckCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DriveConfigResponse {
  id: string;
  serviceAccountEmail: string;
  folderIdImages: string;
  folderIdAudio: string;
  hasServiceAccountKey: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const validateServiceAccountKey = (value: string | undefined) => {
  if (!value || value.trim() === "") {
    return true; // Allow empty (for updates)
  }
  
  try {
    const parsed = JSON.parse(value);
    // Validate it has required Google service account fields
    if (!parsed.type || parsed.type !== 'service_account') {
      return false;
    }
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const driveConfigSchema = z.object({
  serviceAccountEmail: z.string().email("Email de cuenta de servicio inválido"),
  serviceAccountKey: z.string().optional().refine(
    validateServiceAccountKey,
    "El JSON debe contener: type='service_account', project_id, private_key y client_email"
  ),
  folderIdImages: z.string().min(1, "ID de carpeta de imágenes es requerido"),
  folderIdAudio: z.string().min(1, "ID de carpeta de audio es requerido"),
});

type DriveConfigFormData = z.infer<typeof driveConfigSchema>;

const blankFormValues: DriveConfigFormData = {
  serviceAccountEmail: "",
  serviceAccountKey: "",
  folderIdImages: "",
  folderIdAudio: "",
};

export default function AdminDriveConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs, isLoading } = useQuery<DriveConfigResponse[]>({
    queryKey: ["/api/admin/drive-config"],
  });

  const config = configs?.[0];

  const form = useForm<DriveConfigFormData>({
    resolver: zodResolver(driveConfigSchema),
    defaultValues: blankFormValues,
  });

  // Reset form when config changes
  useEffect(() => {
    if (config) {
      form.reset({
        serviceAccountEmail: config.serviceAccountEmail,
        serviceAccountKey: "", // Keep empty to indicate "no change"
        folderIdImages: config.folderIdImages,
        folderIdAudio: config.folderIdAudio,
      });
    } else {
      form.reset(blankFormValues);
    }
  }, [config, form]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: DriveConfigFormData) => {
      console.log("🔍 Form data received:", data);
      
      // Filter out empty string values to avoid overwriting with empty data
      const payload = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== "")
      ) as Partial<DriveConfigFormData>;
      
      console.log("📦 Payload after filtering:", payload);
      console.log("🏗️ Config exists?", !!config);
      
      // Validate key is present when creating
      if (!config && !payload.serviceAccountKey) {
        throw new Error("Clave de cuenta de servicio es requerida al crear una nueva configuración");
      }

      if (config) {
        // Update existing config
        console.log("🔄 Updating config with ID:", config.id);
        return await apiRequest("PATCH", `/api/admin/drive-config/${config.id}`, payload);
      } else {
        // Create new config with isActive: true
        console.log("✨ Creating new config");
        return await apiRequest("POST", "/api/admin/drive-config", { ...payload, isActive: true });
      }
    },
    onSuccess: (data) => {
      console.log("✅ Success response:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drive-config"] });
      toast({
        title: "Configuración guardada",
        description: "La configuración de Google Drive ha sido actualizada exitosamente.",
      });
    },
    onError: (error: any) => {
      console.error("❌ Error saving config:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo guardar la configuración",
      });
    },
  });

  const testDriveMutation = useMutation({
    mutationFn: async () => {
      const formData = form.getValues();
      
      // If configuration is already saved, test the saved config
      if (config) {
        console.log("🧪 Testing saved configuration");
        return await apiRequest("POST", "/api/admin/drive-config/test-saved", {});
      }
      
      // Otherwise, require service account key for testing new config
      if (!formData.serviceAccountKey) {
        throw new Error("Debes ingresar la clave de cuenta de servicio para probar la conexión");
      }

      console.log("🧪 Testing new configuration from form");
      return await apiRequest("POST", "/api/admin/drive-config/test", formData);
    },
    onSuccess: () => {
      toast({
        title: "Conexión exitosa",
        description: "La conexión a Google Drive se realizó correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error al probar conexión",
        description: error.message || "No se pudo conectar a Google Drive",
      });
    },
  });

  const onSubmit = (data: DriveConfigFormData) => {
    updateConfigMutation.mutate(data);
  };

  const handleTestConnection = () => {
    testDriveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-center">
          <p className="text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Configuración de Google Drive</h1>
          <p className="text-muted-foreground">
            Configura la integración con Google Drive para almacenar archivos de audio e imágenes.
          </p>
        </div>

        {config?.hasServiceAccountKey && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Configuración activa</AlertTitle>
            <AlertDescription>
              Ya existe una configuración de Google Drive activa. Puedes actualizar los valores abajo.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Credenciales de Google Cloud
            </CardTitle>
            <CardDescription>
              Configura la cuenta de servicio de Google Cloud y las carpetas de Drive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="serviceAccountEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email de cuenta de servicio</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="proyecto-id@proyecto-id.iam.gserviceaccount.com"
                          data-testid="input-service-account-email"
                        />
                      </FormControl>
                      <FormDescription>
                        Email de la cuenta de servicio de Google Cloud Platform
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serviceAccountKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Clave de cuenta de servicio (JSON)
                        {config?.hasServiceAccountKey && " - Opcional para actualizar"}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
                          rows={6}
                          className="font-mono text-sm"
                          data-testid="input-service-account-key"
                        />
                      </FormControl>
                      <FormDescription>
                        Contenido del archivo JSON de la clave de cuenta de servicio. Déjalo vacío para mantener la clave actual.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="folderIdImages"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID de carpeta de imágenes</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="1AbC2DeF3GhI4JkL5MnO6PqR"
                          data-testid="input-folder-id-images"
                        />
                      </FormControl>
                      <FormDescription>
                        ID de la carpeta de Google Drive donde se guardarán las imágenes (covers)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="folderIdAudio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID de carpeta de audio</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="7StU8VwX9YzA0BcD1EfG2HiJ"
                          data-testid="input-folder-id-audio"
                        />
                      </FormControl>
                      <FormDescription>
                        ID de la carpeta de Google Drive donde se guardarán los archivos de audio
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    disabled={updateConfigMutation.isPending}
                    data-testid="button-save-config"
                  >
                    {updateConfigMutation.isPending ? "Guardando..." : "Guardar configuración"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testDriveMutation.isPending}
                    data-testid="button-test-connection"
                  >
                    {testDriveMutation.isPending 
                      ? "Probando..." 
                      : config 
                        ? "Probar configuración guardada" 
                        : "Probar conexión"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Guía de configuración
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">1. Crear proyecto en Google Cloud</h3>
              <p className="text-muted-foreground">
                Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.cloud.google.com</a> y crea un nuevo proyecto.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">2. Habilitar Google Drive API</h3>
              <p className="text-muted-foreground">
                En el proyecto, ve a "APIs y servicios" → "Biblioteca" y habilita "Google Drive API".
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">3. Crear cuenta de servicio</h3>
              <p className="text-muted-foreground">
                Ve a "IAM y administración" → "Cuentas de servicio" → "Crear cuenta de servicio". Descarga la clave JSON.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">4. Crear carpetas en Google Drive</h3>
              <p className="text-muted-foreground">
                Crea dos carpetas en tu Drive (una para imágenes, otra para audio). Comparte cada carpeta con el email de la cuenta de servicio con permisos de "Editor". El ID de la carpeta está en la URL: drive.google.com/drive/folders/<strong>ID_DE_CARPETA</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
