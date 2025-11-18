import React from 'react'
import { Code, Terminal, FileCode, GitBranch, Play, Settings } from 'lucide-react'

export default function CodePage() {
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--chatty-text)' }}>
              Code
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              Chatty's coding platform - Coming Soon
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ 
                backgroundColor: 'var(--chatty-button)', 
                color: 'var(--chatty-text)' 
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ADA587'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ADA587'}
            >
              <Settings size={16} />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-10 overflow-y-auto">
        <div className="flex flex-col items-center text-center space-y-10">
          <div className="w-32 h-32 rounded-full flex items-center justify-center mb-8" style={{ backgroundColor: '#feffaf', border: '1px solid transparent' }}>
            <Code size={48} style={{ color: 'var(--chatty-icon)', opacity: 0.6 }} />
          </div>
          
          <h2 className="text-3xl font-semibold mb-4" style={{ color: 'var(--chatty-text)' }}>
            Codex Coming Soon
          </h2>
          
          <p className="text-lg max-w-2xl mb-8" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            Chatty's integrated coding platform is in development. Soon you'll be able to write, 
            run, and debug code directly within Chatty, just like ChatGPT's Codex or Cursor.
          </p>

          {/* Feature Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl">
            <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#feffaf' }}>
                <Terminal size={24} style={{ color: 'var(--chatty-icon)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                Integrated Terminal
              </h3>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Run commands and scripts directly in the browser with full terminal access.
              </p>
            </div>

            <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#feffaf' }}>
                <FileCode size={24} style={{ color: 'var(--chatty-icon)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                Code Editor
              </h3>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Full-featured code editor with syntax highlighting, autocomplete, and AI assistance.
              </p>
            </div>

            <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#feffaf' }}>
                <GitBranch size={24} style={{ color: 'var(--chatty-icon)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                Version Control
              </h3>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Built-in Git integration for managing your code projects and collaboration.
              </p>
            </div>

            <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#feffaf' }}>
                <Play size={24} style={{ color: 'var(--chatty-icon)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                Live Execution
              </h3>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Run and test your code in real-time with instant feedback and debugging.
              </p>
            </div>

            <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#feffaf' }}>
                <Code size={24} style={{ color: 'var(--chatty-icon)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                AI Code Assistant
              </h3>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Get intelligent code suggestions, explanations, and debugging help from Chatty.
              </p>
            </div>

            <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)' }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#feffaf' }}>
                <Settings size={24} style={{ color: 'var(--chatty-icon)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>
                Customizable Environment
              </h3>
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                Configure your development environment with themes, extensions, and preferences.
              </p>
            </div>
          </div>

          {/* Coming Soon Badge */}
          <div className="mt-8 px-6 py-3 rounded-full" style={{ backgroundColor: '#feffaf' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--chatty-highlight-text)' }}>
              🚀 Coming Soon - Stay Tuned!
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
