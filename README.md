# 🎙️ Plataforma Multitenant de Podcasts

Plataforma completa de podcasting multitenant desarrollada con Node.js, TypeScript, Express, PostgreSQL y Drizzle ORM. Permite a los creadores publicar, gestionar y distribuir podcasts mientras ofrece a los oyentes una experiencia de escucha simplificada.

**Desarrollado por:** Atreyu Servicios Digitales

---

## ✨ Características

### Para Oyentes
- 🔍 Exploración y búsqueda de podcasts
- ⭐ Sistema de suscripciones
- 🎵 Reproductor de audio integrado
- 📱 Diseño responsive y modo oscuro
- 📋 Listas de reproducción personalizadas
- 🔗 Compartir episodios y podcasts

### Para Creadores
- 📝 Gestión completa de podcasts y episodios
- 🔒 Control de privacidad (PRIVADO/NO LISTADO/PÚBLICO)
- 📧 Sistema de invitaciones por email
- 📊 Panel de control intuitivo
- 🎨 Carga de portadas personalizadas
- 📡 Feeds RSS automáticos con extensiones iTunes
- 🔗 Reproductores embebibles

### Para Administradores
- 👥 Gestión de usuarios y roles
- ✅ Moderación de contenido
- 📧 Configuración de email SMTP
- 🗂️ Operaciones masivas
- 📈 Panel de administración completo

---

## 🚀 Instalación Rápida (Ubuntu Server)

### Requisitos Previos

- Ubuntu Server 20.04+ (LTS recomendado)
- Acceso root o sudo
- Conexión a Internet

### Instalación Automatizada

```bash
# 1. Clonar el repositorio
git clone https://github.com/innovafpiesmmg/podcast-platform.git
cd podcast-platform

# 2. Ejecutar el script de instalación
sudo bash scripts/install.sh
```

El script de instalación automáticamente:
- ✅ Instala Node.js 20 y dependencias del sistema
- ✅ Configura PostgreSQL
- ✅ Crea la base de datos y usuario
- ✅ Genera las carpetas de uploads
- ✅ Crea el archivo .env.production con configuración segura
- ✅ Instala dependencias de Node.js
- ✅ Ejecuta las migraciones de base de datos
- ✅ Construye la aplicación
- ✅ (Opcional) Crea un servicio systemd

### Después de la Instalación

1. **Actualizar la URL pública:**
   ```bash
   nano .env.production
   # Cambiar PUBLIC_URL=http://localhost:5000 por tu dominio
   ```

2. **Configurar email (opcional):**
   ```bash
   nano .env.production
   # Descomentar y configurar las variables SMTP_*
   ```

3. **Iniciar la aplicación:**

   Si creaste el servicio systemd:
   ```bash
   sudo systemctl start podcast-platform
   sudo systemctl status podcast-platform
   ```

   O ejecutar manualmente:
   ```bash
   npm start
   ```

4. **Acceder a la aplicación:**
   - URL: `http://tu-servidor:5000`
   - Email admin: `admin@localhost`
   - Contraseña: (mostrada al final de la instalación)

---

## 🔧 Instalación Manual

### 1. Instalar Dependencias del Sistema

```bash
sudo apt update
sudo apt install -y curl git build-essential postgresql postgresql-contrib
```

### 2. Instalar Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Configurar PostgreSQL

```bash
sudo -u postgres psql <<EOF
CREATE USER podcast_user WITH PASSWORD 'tu_contraseña_segura';
CREATE DATABASE podcast_platform OWNER podcast_user;
GRANT ALL PRIVILEGES ON DATABASE podcast_platform TO podcast_user;
\c podcast_platform
GRANT ALL ON SCHEMA public TO podcast_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO podcast_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO podcast_user;
EOF
```

### 4. Configurar la Aplicación

```bash
# Crear carpetas de uploads
mkdir -p uploads/images uploads/audio

# Copiar y configurar variables de entorno
cp .env.example .env.production
nano .env.production  # Editar según tus necesidades
```

### 5. Instalar y Construir

```bash
npm ci
npm run db:push
npm run build
```

### 6. Iniciar la Aplicación

```bash
NODE_ENV=production npm start
```

---

## 🔐 Configuración de Seguridad

### 1. Configurar Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 5000/tcp  # Aplicación (o tu puerto)
sudo ufw enable
```

### 2. Configurar HTTPS con Nginx + Let's Encrypt

```bash
# Instalar Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Configurar Nginx
sudo nano /etc/nginx/sites-available/podcast-platform
```

Contenido del archivo:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 200M;
}
```

```bash
# Habilitar el sitio
sudo ln -s /etc/nginx/sites-available/podcast-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtener certificado SSL
sudo certbot --nginx -d tu-dominio.com
```

### 3. Cambiar Contraseña de Admin

Después del primer login:
1. Ir a Perfil → Cambiar Contraseña
2. Actualizar con una contraseña segura

---

## 📁 Estructura del Proyecto

```
podcast-platform/
├── client/              # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── components/  # Componentes reutilizables
│   │   ├── pages/       # Páginas de la aplicación
│   │   └── lib/         # Utilidades y configuración
├── server/              # Backend (Express + TypeScript)
│   ├── routes.ts        # Rutas API
│   ├── storage.ts       # Capa de acceso a datos
│   └── index.ts         # Punto de entrada del servidor
├── shared/              # Código compartido
│   └── schema.ts        # Esquemas de base de datos (Drizzle)
├── uploads/             # Almacenamiento de archivos
│   ├── images/          # Portadas de podcasts/episodios
│   └── audio/           # Archivos de audio
├── scripts/             # Scripts de utilidad
│   └── install.sh       # Script de instalación automatizada
├── .env.example         # Ejemplo de variables de entorno
└── README.md            # Este archivo
```

---

## 🔄 Gestión del Servicio Systemd

Si configuraste systemd durante la instalación:

```bash
# Ver estado
sudo systemctl status podcast-platform

# Iniciar
sudo systemctl start podcast-platform

# Detener
sudo systemctl stop podcast-platform

# Reiniciar
sudo systemctl restart podcast-platform

# Ver logs
sudo journalctl -u podcast-platform -f

# Deshabilitar inicio automático
sudo systemctl disable podcast-platform
```

---

## 💾 Backups

### Backup Manual de Base de Datos

```bash
# Crear backup
sudo -u postgres pg_dump podcast_platform > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar backup
sudo -u postgres psql podcast_platform < backup_YYYYMMDD_HHMMSS.sql
```

### Backup de Archivos

```bash
# Crear backup de uploads
tar -czf uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz uploads/
```

### Script de Backup Automático

Crear `/usr/local/bin/podcast-backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/podcast-platform"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup de base de datos
sudo -u postgres pg_dump podcast_platform | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Backup de uploads
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" /var/www/podcast-platform/uploads

# Eliminar backups antiguos (más de 30 días)
find $BACKUP_DIR -type f -mtime +30 -delete
```

Configurar cron para backups diarios:
```bash
sudo crontab -e
# Agregar línea:
0 2 * * * /usr/local/bin/podcast-backup.sh
```

---

## 🛠️ Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo con hot-reload
npm run dev

# Construir para producción
npm run build

# Ejecutar migraciones de BD
npm run db:push

# Ver estado de BD con Drizzle Studio
npm run db:studio

# Linting
npm run lint
```

---

## 📊 Variables de Entorno

Ver `.env.example` para la lista completa. Las más importantes:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de conexión a PostgreSQL | `postgresql://user:pass@localhost:5432/dbname` |
| `SESSION_SECRET` | Secreto para sesiones (aleatorio) | `your-random-secret-key` |
| `STORAGE_PROVIDER` | Proveedor de almacenamiento | `LOCAL` |
| `UPLOADS_ROOT` | Ruta de uploads | `/var/www/podcast-platform/uploads` |
| `PUBLIC_URL` | URL pública de la aplicación | `https://tu-dominio.com` |
| `ADMIN_EMAIL` | Email del administrador | `admin@tu-dominio.com` |
| `ADMIN_PASSWORD` | Contraseña inicial del admin | `tu-contraseña-segura` |

---

## 🐛 Solución de Problemas

### La aplicación no inicia

```bash
# Verificar logs
sudo journalctl -u podcast-platform -n 50

# Verificar que el puerto esté disponible
sudo netstat -tlnp | grep 5000

# Verificar permisos de uploads
ls -la uploads/
```

### Error de conexión a base de datos

```bash
# Verificar que PostgreSQL esté corriendo
sudo systemctl status postgresql

# Verificar credenciales en .env.production
cat .env.production | grep DATABASE_URL

# Probar conexión manual
psql -U podcast_user -d podcast_platform -h localhost
```

### Error de permisos en uploads

```bash
# Corregir permisos
sudo chown -R $USER:$USER uploads/
chmod -R 755 uploads/
```

---

## 📝 Licencia

Todos los derechos reservados - Atreyu Servicios Digitales

---

## 🆘 Soporte

Para problemas o preguntas, contactar a Atreyu Servicios Digitales.

---

## 🔄 Actualizaciones

Para actualizar la aplicación a una nueva versión:

```bash
# 1. Hacer backup
sudo systemctl stop podcast-platform
sudo -u postgres pg_dump podcast_platform > backup_pre_update.sql
tar -czf uploads_backup.tar.gz uploads/

# 2. Actualizar código
git pull origin main

# 3. Instalar nuevas dependencias
npm ci

# 4. Ejecutar migraciones
npm run db:push

# 5. Reconstruir
npm run build

# 6. Reiniciar servicio
sudo systemctl start podcast-platform
```

---

**¡Gracias por usar nuestra plataforma de podcasting!** 🎉
