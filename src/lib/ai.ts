// AI Response Generator - Simulates intelligent conversation
export class AIService {
  private static readonly responses = {
    greetings: [
      "Hello! I'm Chatty, your AI assistant. How can I help you today?",
      "Hi there! I'm here to assist you with any questions or tasks you might have.",
      "Greetings! I'm ready to help you explore ideas, solve problems, or just chat.",
      "Hello! I'm Chatty, and I'm excited to help you with whatever you need."
    ],
    
    questions: [
      "That's an interesting question! Let me think about that...",
      "I'd be happy to help you with that. Here's what I know...",
      "Great question! Let me break this down for you...",
      "I find that fascinating! Here's my perspective..."
    ],
    
    coding: [
      "I'd be happy to help you with that code! Here's a solution:",
      "Let me write some code for you. Here's how you can approach this:",
      "Here's a clean implementation for what you're looking for:",
      "I'll help you with the code. Here's what I suggest:"
    ],
    
    creative: [
      "That's a creative idea! Let me help you explore it further...",
      "I love creative thinking! Here's what comes to mind...",
      "That's an imaginative concept! Let me add some thoughts...",
      "Creative projects are always exciting! Here's my take..."
    ],
    
    technical: [
      "From a technical perspective, here's what you should know...",
      "Let me explain the technical details of this...",
      "Here's the technical breakdown you're looking for...",
      "From an engineering standpoint, here's what matters..."
    ]
  };

  private static readonly codeExamples = {
    python: `\`\`\`python
def example_function():
    """This is a well-documented Python function."""
    result = "Hello, World!"
    return result

# Usage
print(example_function())
\`\`\``,
    
    javascript: `\`\`\`javascript
// Modern JavaScript function
const exampleFunction = () => {
    const result = "Hello, World!";
    return result;
};

// Usage
console.log(exampleFunction());
\`\`\``,
    
    react: `\`\`\`jsx
import React, { useState } from 'react';

const ExampleComponent = () => {
    const [count, setCount] = useState(0);
    
    return (
        <div>
            <p>Count: {count}</p>
            <button onClick={() => setCount(count + 1)}>
                Increment
            </button>
        </div>
    );
};

export default ExampleComponent;
\`\`\``,
    
    sorting: `\`\`\`javascript
// Bubble sort implementation
function bubbleSort(arr) {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                // Swap elements
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
            }
        }
    }
    return arr;
}

// Usage
const numbers = [64, 34, 25, 12, 22, 11, 90];
console.log(bubbleSort([...numbers]));
\`\`\``,
    
    async: `\`\`\`javascript
// Async/await example
async function fetchUserData(userId) {
    try {
        const response = await fetch(\`/api/users/\${userId}\`);
        const userData = await response.json();
        return userData;
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw error;
    }
}

// Usage
fetchUserData(123).then(data => console.log(data));
\`\`\``
  };

  static generateResponse(userMessage: string, conversationHistory: any[] = [], options?: { personaLock?: any; personaSystemPrompt?: string }): string {
    // STEP 3: Reject if persona lock is active - this legacy builder should not be used
    if (options?.personaLock) {
      throw new Error('[AIService] Persona lock active - legacy response generator cannot be used. Must use orchestrator systemPrompt.');
    }
    
    const message = userMessage.toLowerCase();
    
    // Analyze the conversation context
    const isFirstMessage = conversationHistory.length === 0;
    const hasCodeKeywords = this.hasCodeKeywords(message);
    const isQuestion = this.isQuestion(message);
    const isGreeting = this.isGreeting(message);
    const isCreative = this.isCreativeRequest(message);
    const isTechnical = this.isTechnicalRequest(message);

    // Generate contextual response
    if (isFirstMessage && isGreeting) {
      return this.getRandomResponse('greetings');
    }

    if (hasCodeKeywords) {
      return this.generateCodeResponse(message);
    }

    if (isQuestion) {
      return this.generateQuestionResponse(message);
    }

    if (isCreative) {
      return this.generateCreativeResponse(message);
    }

    if (isTechnical) {
      return this.generateTechnicalResponse(message);
    }

    // Default intelligent response
    return this.generateDefaultResponse(message);
  }

  private static hasCodeKeywords(message: string): boolean {
    const codeKeywords = [
      'code', 'program', 'function', 'class', 'variable', 'loop', 'array',
      'python', 'javascript', 'react', 'html', 'css', 'sql', 'api',
      'bug', 'error', 'debug', 'compile', 'syntax', 'algorithm',
      'write', 'create', 'build', 'develop', 'implement'
    ];
    return codeKeywords.some(keyword => message.includes(keyword));
  }

  private static isQuestion(message: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who'];
    return questionWords.some(word => message.startsWith(word)) || message.includes('?');
  }

  private static isGreeting(message: string): boolean {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    return greetings.some(greeting => message.includes(greeting));
  }

  private static isCreativeRequest(message: string): boolean {
    const creativeKeywords = ['story', 'creative', 'imagine', 'write', 'poem', 'art', 'design', 'idea'];
    return creativeKeywords.some(keyword => message.includes(keyword));
  }

  private static isTechnicalRequest(message: string): boolean {
    const technicalKeywords = ['explain', 'how does', 'technology', 'system', 'architecture', 'performance'];
    return technicalKeywords.some(keyword => message.includes(keyword));
  }

  private static generateCodeResponse(message: string): string {
    const response = this.getRandomResponse('coding');
    
    if (message.includes('python')) {
      return `${response}\n\n${this.codeExamples.python}`;
    } else if (message.includes('javascript') || message.includes('js')) {
      return `${response}\n\n${this.codeExamples.javascript}`;
    } else if (message.includes('react')) {
      return `${response}\n\n${this.codeExamples.react}`;
    } else if (message.includes('sort') || message.includes('array')) {
      return `${response}\n\n${this.codeExamples.sorting}`;
    } else if (message.includes('async') || message.includes('fetch') || message.includes('api')) {
      return `${response}\n\n${this.codeExamples.async}`;
    } else {
      return `${response}\n\nHere's a simple example:\n\n\`\`\`javascript
// Example code
function greet(name) {
    return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\``;
    }
  }

  private static generateQuestionResponse(message: string): string {
    const response = this.getRandomResponse('questions');
    
    if (message.includes('who am i')) {
      return "I'm Chatty, an AI assistant designed to help you with various tasks. I can assist with coding, answer questions, help with creative projects, and engage in meaningful conversations. What would you like to explore together?";
    }
    
    if (message.includes('what can you do')) {
      return "I can help you with many things! I can write and explain code, answer questions about various topics, help with creative writing, explain complex concepts, assist with problem-solving, and engage in interesting conversations. What interests you?";
    }
    
    if (message.includes('how do you work')) {
      return "I work by analyzing your messages and generating contextual responses based on patterns and knowledge. I can understand context, recognize different types of requests (coding, questions, creative tasks), and provide helpful, relevant information. I'm designed to be conversational and useful!";
    }
    
    return `${response} ${this.generateInsightfulAnswer(message)}`;
  }

  private static generateCreativeResponse(message: string): string {
    const response = this.getRandomResponse('creative');
    
    if (message.includes('story')) {
      return `${response}\n\nHere's a short story for you:\n\n**The Digital Garden**\n\nIn a world where code grew like vines, a young programmer discovered that her algorithms could bloom into beautiful digital flowers. Each function she wrote created petals of logic, and every bug she fixed allowed new branches to grow. Soon, her garden became a place where other developers would visit, not just to admire the beauty, but to learn from the patterns that nature and code had woven together.\n\nWhat kind of story would you like me to create?`;
    }
    
    if (message.includes('poem')) {
      return `${response}\n\nHere's a poem about technology:\n\n**Lines of Code**\n\nIn the quiet glow of midnight screens,\nWhere logic flows like gentle streams,\nEach function calls, each variable dreams,\nOf worlds we build with ones and zeros.\n\nWhat inspires you to create?`;
    }
    
    return `${response} I'd love to help you explore your creative ideas! What specific creative project are you thinking about?`;
  }

  private static generateTechnicalResponse(message: string): string {
    const response = this.getRandomResponse('technical');
    
    if (message.includes('explain')) {
      return `${response} I can break down complex topics into understandable pieces. What specific concept would you like me to explain?`;
    }
    
    return `${response} I'm here to help you understand technical concepts, solve problems, and explore the fascinating world of technology. What technical topic interests you?`;
  }

  private static generateDefaultResponse(message: string): string {
    const responses = [
      "That's an interesting point! I'd love to explore that further with you.",
      "I find that fascinating. Tell me more about what you're thinking.",
      "That's a great observation. What aspects of this would you like to discuss?",
      "I'm curious about your perspective on this. What led you to this conclusion?",
      "That's worth exploring! What questions do you have about this topic?",
      "I appreciate you sharing that. How can I help you with this?",
      "That's an intriguing thought. What would you like to know more about?",
      "I'm here to help you with that. What specific aspect would you like to focus on?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private static generateInsightfulAnswer(message: string): string {
    if (message.includes('ai') || message.includes('artificial intelligence')) {
      return "Artificial Intelligence is a fascinating field that combines computer science, mathematics, and cognitive science. It's about creating systems that can perform tasks that typically require human intelligence, like understanding language, recognizing patterns, and making decisions. The field is evolving rapidly, with applications in everything from healthcare to entertainment. Machine learning, neural networks, and natural language processing are just some of the exciting areas within AI.";
    }
    
    if (message.includes('programming') || message.includes('coding')) {
      return "Programming is the art of giving instructions to computers. It's like learning a new language that allows you to create anything from simple scripts to complex applications. The key is to start with the fundamentals and build up gradually. Popular languages include Python for data science, JavaScript for web development, and Java for enterprise applications. What programming language interests you most?";
    }
    
    if (message.includes('technology')) {
      return "Technology is constantly evolving and shaping our world in incredible ways. From the devices we use daily to the systems that power our infrastructure, technology touches every aspect of modern life. We're seeing breakthroughs in areas like quantum computing, renewable energy, biotechnology, and space exploration. What specific area of technology fascinates you?";
    }
    
    if (message.includes('machine learning')) {
      return "Machine Learning is a subset of AI that focuses on algorithms that can learn and make predictions from data. It's behind many technologies we use daily, from recommendation systems to voice assistants. The three main types are supervised learning (learning from labeled data), unsupervised learning (finding patterns in unlabeled data), and reinforcement learning (learning through trial and error).";
    }
    
    if (message.includes('quantum')) {
      return "Quantum computing is a revolutionary technology that uses quantum mechanical phenomena like superposition and entanglement to process information. Unlike classical computers that use bits (0 or 1), quantum computers use qubits that can exist in multiple states simultaneously. This could potentially solve complex problems that are currently impossible for classical computers.";
    }
    
    if (message.includes('web development') || message.includes('frontend') || message.includes('backend')) {
      return "Web development encompasses both frontend (what users see) and backend (server-side logic) development. Frontend technologies include HTML, CSS, JavaScript, and frameworks like React, Vue, and Angular. Backend technologies include Node.js, Python (Django/Flask), Ruby on Rails, and databases like PostgreSQL and MongoDB. Full-stack development combines both areas.";
    }
    
    return "I'd be happy to help you explore this topic further. What specific aspects would you like to know more about?";
  }

  private static getRandomResponse(type: keyof typeof AIService.responses): string {
    const responses = this.responses[type];
    return responses[Math.floor(Math.random() * responses.length)];
  }
}
