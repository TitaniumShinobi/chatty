/**
 * Profile Picture Refresh Utilities
 * 
 * Provides functionality to refresh user profile pictures from Google
 * when users update their profile photos on Google services.
 */

import { fetchMe } from './auth';

export interface RefreshResult {
  success: boolean;
  newPictureUrl?: string;
  error?: string;
}

/**
 * Refresh user profile picture from Google OAuth
 * This fetches fresh user data from the server, which will get the latest
 * profile picture URL from Google's userinfo endpoint.
 * 
 * @returns Promise with refresh result
 */
export async function refreshProfilePicture(): Promise<RefreshResult> {
  try {
    console.log('🔄 Refreshing profile picture from Google...');
    
    // Fetch fresh user data from server
    const user = await fetchMe();
    
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated'
      };
    }
    
    if (!user.picture) {
      return {
        success: false,
        error: 'No profile picture available'
      };
    }
    
    console.log('✅ Profile picture refreshed:', user.picture);
    
    return {
      success: true,
      newPictureUrl: user.picture
    };
    
  } catch (error) {
    console.error('❌ Failed to refresh profile picture:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if profile picture URL has changed
 * @param oldUrl - Previous profile picture URL
 * @param newUrl - New profile picture URL
 * @returns true if URL has changed
 */
export function hasProfilePictureChanged(oldUrl?: string, newUrl?: string): boolean {
  if (!oldUrl && !newUrl) return false;
  if (!oldUrl || !newUrl) return true;
  
  // Remove cache-busting parameters for comparison
  const normalizeUrl = (url: string) => {
    const urlObj = new URL(url);
    urlObj.searchParams.delete('cb');
    urlObj.searchParams.delete('sz');
    return urlObj.toString();
  };
  
  return normalizeUrl(oldUrl) !== normalizeUrl(newUrl);
}

/**
 * Hook for managing profile picture refresh state
 */
export function useProfilePictureRefresh() {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  
  const refresh = async (): Promise<RefreshResult> => {
    if (isRefreshing) {
      return { success: false, error: 'Refresh already in progress' };
    }
    
    setIsRefreshing(true);
    
    try {
      const result = await refreshProfilePicture();
      if (result.success) {
        setLastRefresh(new Date());
      }
      return result;
    } finally {
      setIsRefreshing(false);
    }
  };
  
  return {
    refresh,
    isRefreshing,
    lastRefresh
  };
}

// Import React for the hook
import React from 'react';
