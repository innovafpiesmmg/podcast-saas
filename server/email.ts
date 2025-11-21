import nodemailer, { Transporter } from "nodemailer";
import type { EmailConfig } from "@shared/schema";

export interface EmailService {
  sendWelcomeEmail(to: string, username: string): Promise<void>;
  sendPasswordResetEmail(to: string, username: string, resetUrl: string): Promise<void>;
  sendEmailVerification(to: string, username: string, verificationUrl: string): Promise<void>;
  sendContentApprovedEmail(to: string, username: string, contentType: string, contentTitle: string): Promise<void>;
  sendContentRejectedEmail(to: string, username: string, contentType: string, contentTitle: string): Promise<void>;
  sendSubscriptionNotification(to: string, username: string, podcastTitle: string): Promise<void>;
  sendNewEpisodeNotification(to: string, username: string, podcastTitle: string, episodeTitle: string, episodeUrl: string): Promise<void>;
}

export class NodemailerEmailService implements EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor(config?: EmailConfig) {
    if (config) {
      this.updateConfig(config);
    }
  }

  updateConfig(config: EmailConfig): void {
    this.config = config;
    
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword,
      },
    });
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter || !this.config) {
      throw new Error("Email service not configured. Please configure SMTP settings in admin panel.");
    }

    if (!this.config.isActive) {
      throw new Error("Email service is not active. Please activate it in admin panel.");
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email. Please check SMTP configuration.");
    }
  }

  async sendWelcomeEmail(to: string, username: string): Promise<void> {
    const subject = "¡Bienvenido a PodcastHub!";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">¡Bienvenido a PodcastHub!</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Gracias por unirte a PodcastHub, tu plataforma de podcasts.</p>
        <p>Ahora puedes:</p>
        <ul>
          <li>Explorar y suscribirte a podcasts</li>
          <li>Crear tu propia biblioteca de favoritos</li>
          <li>Descubrir nuevo contenido de creadores increíbles</li>
        </ul>
        <p>¡Disfruta de tu experiencia!</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendPasswordResetEmail(to: string, username: string, resetUrl: string): Promise<void> {
    const subject = "Recuperación de contraseña - PodcastHub";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">Recuperación de contraseña</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
        <p style="margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Restablecer contraseña
          </a>
        </p>
        <p>Este enlace expirará en 1 hora.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendEmailVerification(to: string, username: string, verificationUrl: string): Promise<void> {
    const subject = "Verifica tu email - PodcastHub";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">Verifica tu email</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Gracias por registrarte en PodcastHub. Para completar tu registro, necesitamos verificar tu dirección de email.</p>
        <p>Haz clic en el siguiente enlace para verificar tu cuenta:</p>
        <p style="margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verificar mi email
          </a>
        </p>
        <p>Este enlace expirará en 24 horas.</p>
        <p>Si no creaste esta cuenta, puedes ignorar este correo.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendContentApprovedEmail(to: string, username: string, contentType: string, contentTitle: string): Promise<void> {
    const subject = `Tu ${contentType} ha sido aprobado - PodcastHub`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">¡Contenido aprobado!</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Tu ${contentType} <strong>"${contentTitle}"</strong> ha sido aprobado y ahora está visible para todos los usuarios.</p>
        <p>¡Felicitaciones por tu contenido!</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendContentRejectedEmail(to: string, username: string, contentType: string, contentTitle: string): Promise<void> {
    const subject = `Actualización sobre tu ${contentType} - PodcastHub`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">Actualización de contenido</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Tu ${contentType} <strong>"${contentTitle}"</strong> no ha sido aprobado.</p>
        <p>Por favor revisa que cumpla con nuestras políticas de contenido y vuelve a intentarlo.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendSubscriptionNotification(to: string, username: string, podcastTitle: string): Promise<void> {
    const subject = `Nueva suscripción a "${podcastTitle}" - PodcastHub`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">¡Nueva suscripción!</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Te has suscrito exitosamente a <strong>"${podcastTitle}"</strong>.</p>
        <p>Recibirás notificaciones cuando haya nuevos episodios disponibles.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendNewEpisodeNotification(to: string, username: string, podcastTitle: string, episodeTitle: string, episodeUrl: string): Promise<void> {
    const subject = `Nuevo episodio de "${podcastTitle}" - PodcastHub`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">¡Nuevo episodio disponible!</h1>
        <p>Hola <strong>${username}</strong>,</p>
        <p>Hay un nuevo episodio del podcast al que estás suscrito:</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #333; margin: 0 0 10px 0;">${podcastTitle}</h2>
          <h3 style="color: #f97316; margin: 0 0 15px 0;">${episodeTitle}</h3>
        </div>
        <p style="margin: 30px 0;">
          <a href="${episodeUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Escuchar ahora
          </a>
        </p>
        <p>¡Disfruta del nuevo contenido!</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un correo automático, por favor no respondas.
        </p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }
}

export class MockEmailService implements EmailService {
  async sendWelcomeEmail(to: string, username: string): Promise<void> {
    console.log(`[MOCK EMAIL] Welcome email to ${to} (${username})`);
  }

  async sendPasswordResetEmail(to: string, username: string, resetUrl: string): Promise<void> {
    console.log(`[MOCK EMAIL] Password reset to ${to} (${username}): ${resetUrl}`);
  }

  async sendEmailVerification(to: string, username: string, verificationUrl: string): Promise<void> {
    console.log(`[MOCK EMAIL] Email verification to ${to} (${username}): ${verificationUrl}`);
  }

  async sendContentApprovedEmail(to: string, username: string, contentType: string, contentTitle: string): Promise<void> {
    console.log(`[MOCK EMAIL] Content approved to ${to} (${username}): ${contentType} "${contentTitle}"`);
  }

  async sendContentRejectedEmail(to: string, username: string, contentType: string, contentTitle: string): Promise<void> {
    console.log(`[MOCK EMAIL] Content rejected to ${to} (${username}): ${contentType} "${contentTitle}"`);
  }

  async sendSubscriptionNotification(to: string, username: string, podcastTitle: string): Promise<void> {
    console.log(`[MOCK EMAIL] Subscription notification to ${to} (${username}): "${podcastTitle}"`);
  }

  async sendNewEpisodeNotification(to: string, username: string, podcastTitle: string, episodeTitle: string, episodeUrl: string): Promise<void> {
    console.log(`[MOCK EMAIL] New episode notification to ${to} (${username}): "${episodeTitle}" from "${podcastTitle}" - ${episodeUrl}`);
  }
}

// Helper function to get the appropriate email service
import type { IStorage } from "./storage";

export async function getEmailService(storage: IStorage): Promise<EmailService> {
  const config = await storage.getActiveEmailConfig();
  
  if (config && config.isActive) {
    return new NodemailerEmailService(config);
  }
  
  // Fallback to mock service if no config or inactive
  return new MockEmailService();
}
