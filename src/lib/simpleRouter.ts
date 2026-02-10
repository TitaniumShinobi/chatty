export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type RouterConfig = {
	provider: "batty" | "local";
	enableMemory?: boolean;
	enableReasoning?: boolean;
	enableFileProcessing?: boolean;
	enableNarrativeSynthesis?: boolean;
	temperature?: number;
};

export async function callBattyAI(messages: ChatMessage[], cfg: RouterConfig): Promise<string> {
	// This would integrate with Batty's existing AI systems
	// For now, we'll use the existing AIService
	const { AIService } = await import('./aiService');
	const aiService = AIService.getInstance();
	
	// Get the last user message
	const lastMessage = messages[messages.length - 1];
	if (!lastMessage || lastMessage.role !== 'user') {
		return "I need a user message to respond to.";
	}
	
	// Process with Batty's AI
	return await aiService.processMessage(lastMessage.content, []);
}

export async function callLocalStub(messages: ChatMessage[], cfg: RouterConfig): Promise<string> {
	const last = messages[messages.length - 1]?.content ?? "";
	return `Stub (local): You said: ${last}`;
}

export async function routeToModel(intent: string, messages: ChatMessage[], cfg: RouterConfig): Promise<string> {
	if (cfg.provider === "batty") {
		return await callBattyAI(messages, cfg);
	}
	return await callLocalStub(messages, cfg);
}

// Helper function to create router config from settings
export function createRouterConfig(settings: any): RouterConfig {
	return {
		provider: "batty",
		enableMemory: settings.enableMemory,
		enableReasoning: settings.enableReasoning,
		enableFileProcessing: settings.enableFileProcessing,
		enableNarrativeSynthesis: settings.enableNarrativeSynthesis,
		temperature: 0.7
	};
}
