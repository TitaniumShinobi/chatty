/**
 * Profile Picture Utility Functions
 * 
 * Provides consistent profile picture URL generation with proper sizing,
 * cache-busting, and fallback handling for Google OAuth profile images.
 */

export interface ProfilePictureOptions {
  size?: number;
  cacheBust?: boolean;
  fallbackToInitials?: boolean;
}

/**
 * Generate optimized profile picture URL with Google's size parameter
 * @param pictureUrl - Original Google profile picture URL
 * @param options - Configuration options
 * @returns Optimized profile picture URL
 */
export function getProfilePictureUrl(
  pictureUrl: string | null | undefined,
  options: ProfilePictureOptions = {}
): string | null {
  if (!pictureUrl) return null;

  const { size = 32, cacheBust = true } = options;
  
  // Google's profile picture URLs support size parameter
  const url = new URL(pictureUrl);
  url.searchParams.set('sz', size.toString());
  
  if (cacheBust) {
    url.searchParams.set('cb', Date.now().toString());
  }
  
  return url.toString();
}

/**
 * Get user initials for fallback avatar
 * @param user - User object with name and email
 * @returns User initials (1-2 characters)
 */
export function getUserInitials(user: { name?: string; email?: string }): string {
  const name = user.name || user.email || 'User';
  const words = name.trim().split(/\s+/);
  
  if (words.length >= 2) {
    // Use first letter of first and last name
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  } else {
    // Use first two characters of single word
    return name.substring(0, 2).toUpperCase();
  }
}

/**
 * Generate consistent avatar background color based on user data
 * @param user - User object
 * @returns CSS color string
 */
export function getAvatarBackgroundColor(user: { name?: string; email?: string }): string {
  const text = user.name || user.email || 'user';
  let hash = 0;
  
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate a consistent color from the hash
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

/**
 * Profile picture component props for consistent styling
 */
export interface ProfilePictureProps {
  user: { name?: string; email?: string; picture?: string };
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showBorder?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Get size classes for different avatar sizes
 */
export function getSizeClasses(size: ProfilePictureProps['size'] = 'md'): {
  container: string;
  text: string;
  image: string;
} {
  const sizes = {
    sm: { container: 'w-6 h-6', text: 'text-xs', image: 'w-6 h-6' },
    md: { container: 'w-8 h-8', text: 'text-sm', image: 'w-8 h-8' },
    lg: { container: 'w-10 h-10', text: 'text-base', image: 'w-10 h-10' },
    xl: { container: 'w-12 h-12', text: 'text-lg', image: 'w-12 h-12' }
  };
  
  return sizes[size];
}

/**
 * Get pixel size for Google's sz parameter
 */
export function getPixelSize(size: ProfilePictureProps['size'] = 'md'): number {
  const sizes = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 48
  };
  
  return sizes[size];
}


