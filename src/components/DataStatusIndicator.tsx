import React, { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'
import { StorageManager } from '../lib/storage'

interface DataStatusIndicatorProps {
  isVisible: boolean
}

const DataStatusIndicator: React.FC<DataStatusIndicatorProps> = ({ isVisible }) => {
  const [status, setStatus] = useState<'loading' | 'saved' | 'error' | 'migrating'>('loading')
  const [message, setMessage] = useState('')
  const [showNotification, setShowNotification] = useState(false)

  useEffect(() => {
    if (!isVisible) return

    const storageManager = StorageManager.getInstance()
    
    // Check storage status
    const checkStatus = () => {
      try {
        const stats = storageManager.getStorageStats()
        if (stats.lastSaved) {
          setStatus('saved')
          setMessage('Data saved')
          setShowNotification(true)
          setTimeout(() => setShowNotification(false), 3000)
        }
      } catch (error) {
        setStatus('error')
        setMessage('Storage error')
        setShowNotification(true)
        setTimeout(() => setShowNotification(false), 5000)
      }
    }

    // Check status every 30 seconds
    const interval = setInterval(checkStatus, 30000)
    
    // Initial check
    checkStatus()

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible || !showNotification) return null

  const getIcon = () => {
    switch (status) {
      case 'saved':
        return <CheckCircle size={16} className="text-green-500" />
      case 'error':
        return <AlertCircle size={16} className="text-red-500" />
      case 'migrating':
        return <Info size={16} className="text-blue-500" />
      default:
        return <Info size={16} className="text-gray-500" />
    }
  }

  const getBgColor = () => {
    switch (status) {
      case 'saved':
        return 'bg-green-900/20 border-green-700'
      case 'error':
        return 'bg-red-900/20 border-red-700'
      case 'migrating':
        return 'bg-blue-900/20 border-blue-700'
      default:
        return 'bg-gray-900/20 border-gray-700'
    }
  }

  return (
    <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg border ${getBgColor()} text-white text-sm transition-all duration-300`}>
      {getIcon()}
      <span>{message}</span>
    </div>
  )
}

export default DataStatusIndicator
