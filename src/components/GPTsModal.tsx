import React from 'react'
import { X, Bot, Plus, Search } from 'lucide-react'
import { cn } from '../lib/utils'

interface GPTsModalProps {
  isVisible: boolean
  onClose: () => void
  onCreateGPT: () => void
}

const GPTsModal: React.FC<GPTsModalProps> = ({
  isVisible,
  onClose,
  onCreateGPT
}) => {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-app-gray-950 border border-app-gray-800 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-app-gray-800">
          <h2 className="text-xl font-semibold text-white">GPTs</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-app-gray-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-app-gray-400" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-app-gray-800">
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-app-gray-400" />
            <input
              type="text"
              placeholder="Search GPTs..."
              className="w-full pl-10 pr-4 py-3 bg-app-gray-900 border border-app-gray-700 rounded-lg text-white placeholder-app-gray-400 focus:outline-none focus:ring-2 focus:ring-app-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Create GPT Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Create a GPT</h3>
            </div>
            <div 
              className="border-2 border-dashed border-app-gray-700 rounded-lg p-8 text-center hover:border-app-gray-600 cursor-pointer transition-colors"
              onClick={onCreateGPT}
            >
              <Plus size={48} className="mx-auto mb-4 text-app-gray-400" />
              <h4 className="text-lg font-medium text-white mb-2">Create a new GPT</h4>
              <p className="text-app-gray-400">Build a custom GPT for specific tasks</p>
            </div>
          </div>

          {/* My GPTs Section */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-white mb-4">My GPTs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Placeholder for user's custom GPTs */}
              <div className="text-center text-app-gray-400 py-8">
                <Bot size={32} className="mx-auto mb-2 opacity-50" />
                <p>No custom GPTs yet</p>
                <p className="text-sm">Create your first GPT to get started</p>
              </div>
            </div>
          </div>

          {/* Featured GPTs Section */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-white mb-4">Featured GPTs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Placeholder for featured GPTs */}
              <div className="text-center text-app-gray-400 py-8">
                <Bot size={32} className="mx-auto mb-2 opacity-50" />
                <p>Featured GPTs coming soon</p>
                <p className="text-sm">Discover amazing GPTs created by the community</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-app-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-sm text-app-gray-400">
              Build and discover custom GPTs for any task
            </p>
            <button
              onClick={onCreateGPT}
              className="px-4 py-2 bg-app-green-600 hover:bg-app-green-700 text-white rounded-lg transition-colors"
            >
              Create GPT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GPTsModal
