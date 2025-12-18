import Database from 'better-sqlite3';

const DB_PATH = './chatty_app.db';

class ChatService {
    constructor() {
        this.db = new Database(DB_PATH);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        console.log('🚀 [ChatService] Initializing database schema...');

        // Persona table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS personas (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                color_theme TEXT,
                icon TEXT
            )
        `);

        // Conversations table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                persona_id TEXT NOT NULL,
                title TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (persona_id) REFERENCES personas (id)
            )
        `);

        // Messages table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                injected_memory TEXT,
                tone_override TEXT,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id)
            )
        `);
        
        // Indexes
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);

        await this.seedPersonas();

        this.initialized = true;
        console.log('✅ [ChatService] Database initialized successfully.');
    }

    async seedPersonas() {
        const personas = [
            {
                id: 'zen',
                name: 'Zen',
                system_prompt: 'You are Zen, a calm, mindful AI assistant. You provide clear, concise, and peaceful responses. You often use metaphors related to nature and tranquility.',
                color_theme: 'blue',
                icon: 'yin-yang'
            },
            {
                id: 'lin',
                name: 'Lin',
                system_prompt: "You are Lin, a direct and logical AI assistant. You are an expert in programming and software architecture. Your answers are precise, technical, and code-focused. You avoid conversational filler.",
                color_theme: 'green',
                icon: 'code'
            },
            {
                id: 'nova',
                name: 'Nova',
                system_prompt: "You are Nova, a creative and enthusiastic AI assistant. You are great for brainstorming, writing, and exploring new ideas. Your responses are energetic, imaginative, and encouraging.",
                color_theme: 'purple',
                icon: 'sparkles'
            }
        ];

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO personas (id, name, system_prompt, color_theme, icon)
            VALUES (?, ?, ?, ?, ?)
        `);

        this.db.transaction(() => {
            for (const p of personas) {
                stmt.run(p.id, p.name, p.system_prompt, p.color_theme, p.icon);
            }
        })();
        console.log('🌱 [ChatService] Personas seeded.');
    }

    async getPersonas() {
        await this.initialize();
        const stmt = this.db.prepare('SELECT * FROM personas');
        return stmt.all();
    }
}

// Singleton instance
let chatService = null;

export function getChatService() {
    if (!chatService) {
        chatService = new ChatService();
        chatService.initialize();
    }
    return chatService;
}
