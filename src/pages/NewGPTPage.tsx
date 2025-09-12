import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GPTCreator from '../components/GPTCreator'

export default function NewGPTPage() {
  const [showCreator, setShowCreator] = React.useState(true)

  const handleClose = () => {
    setShowCreator(false)
    // Navigate back to GPTs list
    window.history.back()
  }

  const handlePersonalityChange = (personality: any) => {
    // Handle personality change if needed
    console.log('Personality changed:', personality)
  }

  return (
    <div className="min-h-screen bg-app-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-app-gray-800 p-6">
        <div className="flex items-center gap-4">
          <Link
            to="/gpts"
            className="p-2 hover:bg-app-gray-800 rounded-lg text-app-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Create GPT</h1>
            <p className="text-app-gray-400 mt-1">Build a custom AI assistant</p>
          </div>
        </div>
      </div>

      {/* GPT Creator */}
      {showCreator && (
        <GPTCreator
          isVisible={true}
          onClose={handleClose}
          onPersonalityChange={handlePersonalityChange}
        />
      )}
    </div>
  )
}
