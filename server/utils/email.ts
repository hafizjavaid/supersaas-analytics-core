import { useEmail } from "use-email";
import type { DigestReport } from "#layers/core/shared/types/digests";
import type { DigestFrequency } from "#layers/core/shared/utils/digests";
import { serverEdition } from "#layers/core/server/utils/edition";

interface CoreEmailTemplates {
	"email-verification": { url: string };
	"account-exists": { url: string };
	"password-reset": { url: string };
	"magic-link": { url: string; expiresInMinutes: number };
	"member-invite": { url: string; inviterName: string; organizationName: string; role: string };
	"digest": { url: string; unsubscribeUrl: string; siteName: string; frequency: DigestFrequency; periodLabel: string; summary: string | null; report: DigestReport };
}

declare global {
	// The Hosted layer adds its templates here and their components through `serverEdition().emailTemplates`; core's
	// own components win over the edition's for the same name.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface EmailTemplates extends CoreEmailTemplates {}
}

export type EmailTemplate = keyof EmailTemplates;

export interface EmailMessage<TTemplate extends EmailTemplate = EmailTemplate> {
	to: string;
	subject: string;
	template: TTemplate;
	props: EmailTemplates[TTemplate];
}

export interface SentEmail extends EmailMessage {
	html: string;
	sentAt: number;
}

export interface EmailTransport {
	send(email: SentEmail): Promise<void>;
}

export type EmailTemplateLoader = () => Promise<{ default: unknown }>;

// Rendering loads Vue and the templates, so it stays out of the cold start of requests that send no email.
const templateComponents: Record<keyof CoreEmailTemplates, EmailTemplateLoader> = {
	"email-verification": () => import("#layers/core/server/emails/EmailVerification.vue"),
	"account-exists": () => import("#layers/core/server/emails/AccountExists.vue"),
	"password-reset": () => import("#layers/core/server/emails/PasswordReset.vue"),
	"magic-link": () => import("#layers/core/server/emails/MagicLink.vue"),
	"member-invite": () => import("#layers/core/server/emails/MemberInvite.vue"),
	"digest": () => import("#layers/core/server/emails/Digest.vue"),
};

const devOutbox: SentEmail[] = [];

export function listDevOutbox() {
	return devOutbox;
}

const consoleTransport: EmailTransport = {
	async send(email) {
		console.info(`[email] ${email.template} to ${email.to}: ${email.subject}\n${email.props.url}`);
		devOutbox.push(email);
	},
};

function resendTransport(from: string): EmailTransport {
	return {
		async send({ to, subject, html }) {
			await useEmail("resend").send({ from, to, subject, html });
		},
	};
}

interface SmtpSettings {
	smtpHost: string;
	smtpPort: string;
	smtpUsername: string;
	smtpPassword: string;
}

// worker-mailer speaks SMTP over Cloudflare's connect() sockets, which refuse port 25, so 465 (TLS) or 587 (STARTTLS).
// It imports cloudflare:sockets, so it loads only here, never in dev or the server tests.
function smtpTransport(from: string, smtp: SmtpSettings): EmailTransport {
	const port = Number(smtp.smtpPort) || 587;
	return {
		async send({ to, subject, html }) {
			const { WorkerMailer } = await import("worker-mailer");
			await WorkerMailer.send({
				host: smtp.smtpHost,
				port,
				secure: port === 465,
				startTls: port !== 465,
				credentials: smtp.smtpUsername ? { username: smtp.smtpUsername, password: smtp.smtpPassword } : undefined,
			}, { from, to, subject, html });
		},
	};
}

export function isEmailConfigured() {
	return import.meta.dev || Boolean(process.env.RESEND_API_TOKEN || useRuntimeConfig().email.smtpHost);
}

function emailTransport(): EmailTransport | undefined {
	if (!hasEmail()) {
		return undefined;
	}
	const { email } = useRuntimeConfig();
	if (import.meta.dev || !isEmailConfigured()) {
		return consoleTransport;
	}
	return process.env.RESEND_API_TOKEN ? resendTransport(email.from) : smtpTransport(email.from, email);
}

async function renderTemplate(template: EmailTemplate, props: Record<string, unknown>) {
	const load = templateComponents[template as keyof CoreEmailTemplates] ?? serverEdition().emailTemplates[template];
	if (!load) {
		throw new Error(`No component for the email template "${template}"`);
	}
	const [{ render }, component] = await Promise.all([import("@vue-email/render"), load()]);
	return render(component.default as Parameters<typeof render>[0], props);
}

// Without a transport the email is dropped: a Self-hosted copy without email turns off every feature that needs one.
export async function sendEmail<TTemplate extends EmailTemplate>(message: EmailMessage<TTemplate>) {
	const transport = emailTransport();
	if (!transport) {
		return;
	}
	const { public: { appName } } = useRuntimeConfig();
	const html = await renderTemplate(message.template, { ...message.props, appName });
	await transport.send({ ...message, html, sentAt: Date.now() });
}
