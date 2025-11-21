import { Home, Radio, PlusCircle, Library, Shield, Users, Radio as PodcastIcon, Mic2, Mail, Cloud, Headphones, Rss, ListMusic } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth-provider";

const menuItems = [
  {
    title: "Inicio",
    url: "/",
    icon: Home,
    testId: "link-home",
  },
  {
    title: "Explorar",
    url: "/explore",
    icon: Radio,
    testId: "link-explore",
  },
  {
    title: "Mi Biblioteca",
    url: "/library",
    icon: Library,
    testId: "link-library",
  },
  {
    title: "Mis Playlists",
    url: "/my-playlists",
    icon: ListMusic,
    testId: "link-my-playlists",
  },
];

const creatorItems = [
  {
    title: "Mis Podcasts",
    url: "/my-podcasts",
    icon: Headphones,
    testId: "link-my-podcasts",
  },
  {
    title: "Importar RSS",
    url: "/import-rss",
    icon: Rss,
    testId: "link-import-rss",
  },
  {
    title: "Crear Podcast",
    url: "/create",
    icon: PlusCircle,
    testId: "link-create",
  },
];

const adminItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: Shield,
    testId: "link-admin-dashboard",
  },
  {
    title: "Usuarios",
    url: "/admin/users",
    icon: Users,
    testId: "link-admin-users",
  },
  {
    title: "Podcasts",
    url: "/admin/podcasts",
    icon: PodcastIcon,
    testId: "link-admin-podcasts",
  },
  {
    title: "Episodios",
    url: "/admin/episodes",
    icon: Mic2,
    testId: "link-admin-episodes",
  },
  {
    title: "Email Config",
    url: "/admin/email-config",
    icon: Mail,
    testId: "link-admin-email-config",
  },
  {
    title: "Google Drive",
    url: "/admin/drive-config",
    icon: Cloud,
    testId: "link-admin-drive-config",
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  // Show creator section only for CREATOR and ADMIN roles
  const canCreate = user && (user.role === "CREATOR" || user.role === "ADMIN");
  
  // Show admin section only for ADMIN role
  const isAdmin = user && user.role === "ADMIN";

  return (
    <Sidebar className="pt-[57px]">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Escuchar</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={item.testId}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canCreate && (
          <SidebarGroup>
            <SidebarGroupLabel>Crear</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {creatorItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={item.testId}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        location === item.url || 
                        (item.url !== "/admin" && location.startsWith(item.url))
                      }
                      data-testid={item.testId}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
