import React from 'react';
import { RefreshCw, ExternalLink, Info } from 'lucide-react';
import ProfilePicture from './ProfilePicture';
import { useProfilePictureRefresh } from '../lib/profilePictureRefresh';
import { type User } from '../lib/auth';

interface ProfilePictureSettingsProps {
  user: User;
  onRefresh?: (newPictureUrl?: string) => void;
}

/**
 * Profile Picture Settings Component
 * 
 * Provides controls for managing profile pictures including:
 * - Current profile picture display
 * - Refresh functionality
 * - Information about profile picture source
 */
export const ProfilePictureSettings: React.FC<ProfilePictureSettingsProps> = ({
  user,
  onRefresh
}) => {
  const { refresh, isRefreshing, lastRefresh } = useProfilePictureRefresh();
  
  const handleRefresh = async () => {
    const result = await refresh();
    if (result.success && onRefresh) {
      onRefresh(result.newPictureUrl);
    }
  };
  
  const formatLastRefresh = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };
  
  return (
    <div className="space-y-4">
      {/* Current Profile Picture */}
      <div className="flex items-center gap-4">
        <ProfilePicture 
          user={user} 
          size="xl" 
          className="shadow-lg"
        />
        <div className="flex-1">
          <h3 className="text-lg font-medium text-gray-900">
            Profile Picture
          </h3>
          <p className="text-sm text-gray-500">
            Your Google profile picture is automatically synced
          </p>
          {lastRefresh && (
            <p className="text-xs text-gray-400 mt-1">
              Last refreshed: {formatLastRefresh(lastRefresh)}
            </p>
          )}
        </div>
      </div>
      
      {/* Refresh Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Picture'}
        </button>
        
        <a
          href="https://myaccount.google.com/profile"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Update on Google
        </a>
      </div>
      
      {/* Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About Profile Pictures</p>
            <ul className="space-y-1 text-xs">
              <li>• Your profile picture is automatically synced from your Google account</li>
              <li>• Changes made on Google may take a few minutes to appear here</li>
              <li>• Use the refresh button to get the latest picture immediately</li>
              <li>• If no picture is set, we'll show your initials instead</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePictureSettings;
