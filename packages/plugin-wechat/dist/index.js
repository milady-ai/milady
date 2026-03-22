import { createServer } from "node:http";
//#region src/bot.ts
const DEDUP_WINDOW_MS = 1800 * 1e3;
const DEDUP_MAX_ENTRIES = 1e3;
const DEDUP_CLEANUP_INTERVAL_MS = 300 * 1e3;
var Bot = class {
	seen = /* @__PURE__ */ new Map();
	onMessage;
	featuresGroups;
	featuresImages;
	cleanupTimer = null;
	constructor(options) {
		this.onMessage = options.onMessage;
		this.featuresGroups = options.featuresGroups ?? true;
		this.featuresImages = options.featuresImages ?? true;
		this.cleanupTimer = setInterval(() => this.cleanup(), DEDUP_CLEANUP_INTERVAL_MS);
	}
	handleIncoming(message) {
		if (this.isDuplicate(message.id)) return;
		if (message.group && !this.featuresGroups) return;
		if (message.type === "image" && !this.featuresImages) return;
		if (message.type === "unknown") return;
		this.onMessage(message);
	}
	isDuplicate(messageId) {
		const now = Date.now();
		if (this.seen.has(messageId)) return true;
		if (this.seen.size >= DEDUP_MAX_ENTRIES) this.cleanup();
		this.seen.set(messageId, now);
		return false;
	}
	cleanup() {
		const cutoff = Date.now() - DEDUP_WINDOW_MS;
		for (const [id, ts] of this.seen) if (ts < cutoff) this.seen.delete(id);
	}
	stop() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		this.seen.clear();
	}
};
//#endregion
//#region src/callback-server.ts
const WECHAT_TYPE_MAP = {
	60001: {
		type: "text",
		scope: "private"
	},
	80001: {
		type: "text",
		scope: "group"
	}
};
function startCallbackServer(options) {
	const { port, apiKey, onMessage, signal, accountId } = options;
	const server = createServer((req, res) => {
		const expectedPath = accountId ? `/webhook/wechat/${accountId}` : "/webhook/wechat";
		if (req.method !== "POST" || !req.url?.startsWith(expectedPath)) {
			res.writeHead(404);
			res.end("Not Found");
			return;
		}
		if (req.headers["x-api-key"] !== apiKey) {
			res.writeHead(401);
			res.end("Unauthorized");
			return;
		}
		let body = "";
		req.on("data", (chunk) => {
			body += chunk.toString();
		});
		req.on("end", () => {
			try {
				const message = normalizePayload(JSON.parse(body));
				if (message) onMessage(message);
				res.writeHead(200);
				res.end("OK");
			} catch {
				res.writeHead(400);
				res.end("Bad Request");
			}
		});
	});
	server.listen(port, () => {
		console.log(`[wechat] Webhook server listening on port ${port}`);
	});
	server.on("error", (err) => {
		if (err.code === "EADDRINUSE") console.error(`[wechat] Port ${port} already in use — webhook server failed to start`);
		else console.error(`[wechat] Webhook server error:`, err);
	});
	if (signal) signal.addEventListener("abort", () => {
		server.close();
	});
	return {
		close: () => server.close(),
		port
	};
}
function normalizePayload(payload) {
	const data = payload.data ?? (payload.content ? payload : null);
	if (!data) {
		console.warn("[wechat] Unrecognized webhook payload format");
		return null;
	}
	const typeCode = Number(data.type ?? data.msgType ?? 0);
	const mapping = WECHAT_TYPE_MAP[typeCode];
	let msgType = "unknown";
	let scope = "private";
	if (mapping) {
		msgType = mapping.type;
		scope = mapping.scope;
	} else if (typeCode >= 60002 && typeCode <= 60010) {
		msgType = "image";
		scope = "private";
	} else if (typeCode >= 80002 && typeCode <= 80010) {
		msgType = "image";
		scope = "group";
	}
	if (msgType === "unknown") {
		console.warn(`[wechat] Unknown message type code: ${typeCode}`);
		return null;
	}
	const sender = String(data.sender ?? data.from ?? "");
	const recipient = String(data.recipient ?? data.to ?? "");
	const content = String(data.content ?? data.text ?? "");
	const timestamp = Number(data.timestamp ?? Date.now());
	const msgId = String(data.msgId ?? data.id ?? `${sender}-${timestamp}`);
	const isGroup = scope === "group" || sender.includes("@chatroom");
	const threadId = isGroup ? String(data.roomId ?? data.threadId ?? sender) : void 0;
	const groupSubject = isGroup ? String(data.roomName ?? data.groupName ?? threadId ?? "") : void 0;
	const imageUrl = msgType === "image" ? String(data.imageUrl ?? data.mediaUrl ?? data.url ?? "") : void 0;
	return {
		id: msgId,
		type: msgType,
		sender,
		recipient,
		content,
		timestamp,
		threadId,
		group: groupSubject ? { subject: groupSubject } : void 0,
		imageUrl: imageUrl || void 0,
		raw: payload
	};
}
//#endregion
//#region src/proxy-client.ts
const SUCCESS = 1e3;
const LOGIN_NEEDED = 1001;
var ProxyClient = class {
	apiKey;
	baseUrl;
	accountId;
	constructor(account) {
		this.apiKey = account.apiKey;
		this.baseUrl = account.proxyUrl.replace(/\/$/, "");
		this.accountId = account.id;
	}
	async request(path, body) {
		const url = `${this.baseUrl}${path}`;
		const headers = {
			"Content-Type": "application/json",
			"X-API-Key": this.apiKey,
			"X-Account-ID": this.accountId
		};
		let lastError;
		for (let attempt = 0; attempt < 3; attempt++) try {
			const res = await fetch(url, {
				method: "POST",
				headers,
				body: body ? JSON.stringify(body) : void 0
			});
			if (res.status === 429) {
				const retryAfter = res.headers.get("Retry-After");
				await sleep$1(retryAfter ? Number.parseInt(retryAfter, 10) * 1e3 : Math.min(1e3 * 2 ** attempt, 8e3));
				continue;
			}
			return await res.json();
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			await sleep$1(Math.min(1e3 * 2 ** attempt, 8e3));
		}
		throw lastError ?? /* @__PURE__ */ new Error(`Request failed after 3 attempts: ${path}`);
	}
	async getStatus() {
		const res = await this.request("/api/status");
		if (res.code === LOGIN_NEEDED) return {
			valid: true,
			loginState: "waiting"
		};
		if (res.code !== SUCCESS && res.code !== 1002) throw new Error(`getStatus failed: ${res.message ?? res.code}`);
		return res.data;
	}
	async getQRCode() {
		const res = await this.request("/api/qrcode");
		if (res.code !== SUCCESS) throw new Error(`getQRCode failed: ${res.message ?? res.code}`);
		return res.data.qrCodeUrl;
	}
	async checkLogin() {
		const res = await this.request("/api/check-login");
		if (res.code !== SUCCESS && res.code !== 1002) throw new Error(`checkLogin failed: ${res.message ?? res.code}`);
		return res.data;
	}
	async sendText(to, text) {
		const res = await this.request("/api/send-text", {
			to,
			text
		});
		if (res.code === LOGIN_NEEDED) throw new LoginExpiredError();
		if (res.code !== SUCCESS && res.code !== 1002) throw new Error(`sendText failed: ${res.message ?? res.code}`);
	}
	async sendImage(to, imagePath, text) {
		const res = await this.request("/api/send-image", {
			to,
			imagePath,
			text
		});
		if (res.code === LOGIN_NEEDED) throw new LoginExpiredError();
		if (res.code !== SUCCESS && res.code !== 1002) throw new Error(`sendImage failed: ${res.message ?? res.code}`);
	}
	async getContacts() {
		const res = await this.request("/api/contacts");
		if (res.code !== SUCCESS) throw new Error(`getContacts failed: ${res.message ?? res.code}`);
		return res.data;
	}
	async registerWebhook(url) {
		const res = await this.request("/api/webhook/register", { webhookUrl: url });
		if (res.code !== SUCCESS && res.code !== 1002) throw new Error(`registerWebhook failed: ${res.message ?? res.code}`);
	}
	get needsLogin() {
		return false;
	}
};
var LoginExpiredError = class extends Error {
	constructor() {
		super("WeChat login expired — re-login required");
		this.name = "LoginExpiredError";
	}
};
function sleep$1(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
//#endregion
//#region src/reply-dispatcher.ts
const DEFAULT_CHUNK_SIZE = 2e3;
var ReplyDispatcher = class {
	client;
	chunkSize;
	constructor(options) {
		this.client = options.client;
		this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
	}
	async sendText(to, text) {
		const chunks = this.chunk(text);
		for (const chunk of chunks) try {
			await this.client.sendText(to, chunk);
		} catch (err) {
			console.error(`[wechat] Failed to send text to ${to}:`, err);
			throw err;
		}
	}
	async sendImage(to, imagePath, caption) {
		try {
			await this.client.sendImage(to, imagePath, caption);
		} catch (err) {
			console.error(`[wechat] Failed to send image to ${to}:`, err);
			throw err;
		}
	}
	chunk(text) {
		if (text.length <= this.chunkSize) return [text];
		const chunks = [];
		let remaining = text;
		while (remaining.length > 0) {
			if (remaining.length <= this.chunkSize) {
				chunks.push(remaining);
				break;
			}
			let breakAt = remaining.lastIndexOf("\n", this.chunkSize);
			if (breakAt <= 0) breakAt = remaining.lastIndexOf(" ", this.chunkSize);
			if (breakAt <= 0) breakAt = this.chunkSize;
			chunks.push(remaining.slice(0, breakAt));
			remaining = remaining.slice(breakAt).trimStart();
		}
		return chunks;
	}
};
//#endregion
//#region src/utils/qrcode.ts
/**
* Display a QR code URL to the terminal.
* Prints the URL for the user to open in a browser.
* A vendored text-based QR renderer could be added here later.
*/
function displayQRUrl(url) {
	console.log("");
	console.log("╔══════════════════════════════════════════╗");
	console.log("║  Scan this QR code with WeChat to login  ║");
	console.log("╠══════════════════════════════════════════╣");
	console.log(`║  ${url}`);
	console.log("╚══════════════════════════════════════════╝");
	console.log("");
	console.log("Open the URL above in your browser to see the QR code.");
	console.log("");
}
//#endregion
//#region src/channel.ts
const HEALTH_CHECK_INTERVAL_MS = 6e4;
const LOGIN_POLL_INTERVAL_MS = 5e3;
var WechatChannel = class {
	config;
	onMessage;
	accounts = /* @__PURE__ */ new Map();
	callbackServer = null;
	healthTimer = null;
	abortController = null;
	constructor(options) {
		this.config = options.config;
		this.onMessage = options.onMessage;
	}
	async start() {
		this.abortController = new AbortController();
		const resolved = this.resolveAccounts();
		if (resolved.length === 0) {
			console.warn("[wechat] No configured accounts found");
			return;
		}
		const webhookPort = resolved[0].webhookPort;
		this.callbackServer = startCallbackServer({
			port: webhookPort,
			apiKey: resolved[0].apiKey,
			onMessage: (msg) => this.routeIncoming(msg),
			signal: this.abortController.signal
		});
		for (const account of resolved) {
			const client = new ProxyClient(account);
			const dispatcher = new ReplyDispatcher({ client });
			const bot = new Bot({
				onMessage: (msg) => this.onMessage(account.id, msg),
				featuresGroups: this.config.features?.groups,
				featuresImages: this.config.features?.images
			});
			this.accounts.set(account.id, {
				client,
				dispatcher,
				bot
			});
			await this.ensureLoggedIn(account.id, client);
			const webhookUrl = account.webhookPort === webhookPort ? `http://localhost:${webhookPort}/webhook/wechat/${account.id}` : `http://localhost:${account.webhookPort}/webhook/wechat/${account.id}`;
			try {
				await client.registerWebhook(webhookUrl);
				console.log(`[wechat] Account "${account.id}" registered webhook at ${webhookUrl}`);
			} catch (err) {
				console.error(`[wechat] Failed to register webhook for "${account.id}":`, err);
			}
		}
		this.healthTimer = setInterval(() => this.healthCheck(), HEALTH_CHECK_INTERVAL_MS);
	}
	async stop() {
		if (this.healthTimer) {
			clearInterval(this.healthTimer);
			this.healthTimer = null;
		}
		for (const [, { bot }] of this.accounts) bot.stop();
		this.accounts.clear();
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.callbackServer = null;
	}
	async sendText(accountId, to, text) {
		const entry = this.accounts.get(accountId);
		if (!entry) throw new Error(`Unknown account: ${accountId}`);
		try {
			await entry.dispatcher.sendText(to, text);
		} catch (err) {
			if (err instanceof LoginExpiredError) {
				await this.ensureLoggedIn(accountId, entry.client);
				await entry.dispatcher.sendText(to, text);
			} else throw err;
		}
	}
	async sendImage(accountId, to, imagePath, caption) {
		const entry = this.accounts.get(accountId);
		if (!entry) throw new Error(`Unknown account: ${accountId}`);
		try {
			await entry.dispatcher.sendImage(to, imagePath, caption);
		} catch (err) {
			if (err instanceof LoginExpiredError) {
				await this.ensureLoggedIn(accountId, entry.client);
				await entry.dispatcher.sendImage(to, imagePath, caption);
			} else throw err;
		}
	}
	routeIncoming(msg) {
		const firstEntry = this.accounts.values().next();
		if (!firstEntry.done) firstEntry.value.bot.handleIncoming(msg);
	}
	async ensureLoggedIn(accountId, client) {
		const status = await client.getStatus();
		if (status.loginState === "logged_in") {
			console.log(`[wechat] Account "${accountId}" logged in as ${status.nickName ?? status.wcId}`);
			return;
		}
		console.log(`[wechat] Account "${accountId}" needs login — generating QR code...`);
		displayQRUrl(await client.getQRCode());
		while (true) {
			await sleep(LOGIN_POLL_INTERVAL_MS);
			if (this.abortController?.signal.aborted) throw new Error("Login aborted");
			const result = await client.checkLogin();
			if (result.status === "logged_in") {
				console.log(`[wechat] Account "${accountId}" logged in as ${result.nickName ?? result.wcId}`);
				return;
			}
			if (result.status === "need_verify") console.log(`[wechat] Verification needed: ${result.verifyUrl ?? "check your phone"}`);
		}
	}
	async healthCheck() {
		for (const [accountId, { client }] of this.accounts) try {
			if ((await client.getStatus()).loginState !== "logged_in") {
				console.warn(`[wechat] Account "${accountId}" login expired — attempting re-login`);
				await this.ensureLoggedIn(accountId, client);
			}
		} catch (err) {
			console.error(`[wechat] Health check failed for "${accountId}":`, err);
		}
	}
	resolveAccounts() {
		const accounts = [];
		const defaultPort = this.config.webhookPort ?? 18790;
		const defaultDevice = this.config.deviceType ?? "ipad";
		if (this.config.accounts) for (const [id, acc] of Object.entries(this.config.accounts)) {
			if (acc.enabled === false) continue;
			accounts.push({
				id,
				apiKey: acc.apiKey,
				proxyUrl: acc.proxyUrl,
				deviceType: acc.deviceType ?? defaultDevice,
				webhookPort: acc.webhookPort ?? defaultPort,
				wcId: acc.wcId,
				nickName: acc.nickName
			});
		}
		else if (this.config.apiKey && this.config.proxyUrl) accounts.push({
			id: "default",
			apiKey: this.config.apiKey,
			proxyUrl: this.config.proxyUrl,
			deviceType: defaultDevice,
			webhookPort: defaultPort
		});
		return accounts;
	}
};
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
//#endregion
//#region src/index.ts
let channel = null;
const wechatPlugin = {
	name: "wechat",
	description: "WeChat messaging via proxy API",
	async init(config, runtime) {
		const wechatConfig = config?.connectors?.wechat;
		if (!wechatConfig) {
			console.warn("[wechat] No wechat config found in connectors — skipping");
			return;
		}
		if (wechatConfig.enabled === false) {
			console.log("[wechat] Plugin disabled via config");
			return;
		}
		channel = new WechatChannel({
			config: wechatConfig,
			onMessage: (accountId, msg) => {
				console.log(`[wechat] Message from ${msg.sender} (account: ${accountId}): ${msg.content.slice(0, 100)}`);
			}
		});
		await channel.start();
		console.log("[wechat] Plugin initialized");
		return async () => {
			if (channel) {
				await channel.stop();
				channel = null;
				console.log("[wechat] Plugin stopped");
			}
		};
	}
};
//#endregion
export { Bot, ProxyClient, ReplyDispatcher, WechatChannel, wechatPlugin as default, wechatPlugin };

//# sourceMappingURL=index.js.map