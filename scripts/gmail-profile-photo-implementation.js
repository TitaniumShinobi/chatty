// Complete Gmail Profile Photo Implementation
// Add this to your React component

import React, { useState, useEffect } from 'react';

// 1. Google OAuth 2.0 initialization
function initializeGoogleAuth() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('auth2', () => {
        const auth2 = window.gapi.auth2.init({
          client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // Replace with actual
          fetch_basic_profile: true
        });
        resolve(auth2);
      });
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 2. Get profile photo using getBasicProfile().getImageUrl()
function getGmailProfilePhoto() {
  return new Promise((resolve, reject) => {
    window.gapi.load('auth2', () => {
      const auth2 = window.gapi.auth2.init({
        client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // Replace with actual
        fetch_basic_profile: true
      });
      
      auth2.then(() => {
        if (auth2.isSignedIn.get()) {
          const user = auth2.currentUser.get();
          const imageUrl = user.getBasicProfile().getImageUrl(); // This is the key method
          resolve(imageUrl);
        } else {
          auth2.signIn().then(() => {
            const user = auth2.currentUser.get();
            const imageUrl = user.getBasicProfile().getImageUrl();
            resolve(imageUrl);
          }).catch(reject);
        }
      }).catch(reject);
    });
  });
}

// 3. React component with profile photo
function GmailProfilePhoto() {
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    getGmailProfilePhoto()
      .then((imageUrl) => {
        setProfilePhoto(imageUrl);
        // Also get name and email
        const user = window.gapi.auth2.getAuthInstance().currentUser.get();
        const profile = user.getBasicProfile();
        setUserName(profile.getName());
        setUserEmail(profile.getEmail());
      })
      .catch((error) => {
        console.error('Error getting Gmail profile photo:', error);
      });
  }, []);

  return (
    <div className="flex items-center gap-3">
      {profilePhoto ? (
        <img 
          src={profilePhoto}
          alt="Gmail Profile Photo"
          className="w-8 h-8 rounded-full object-cover border border-gray-200"
          onError={(e) => {
            console.warn('Profile image failed to load');
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-600">
            {userName?.charAt(0) || userEmail?.charAt(0) || 'U'}
          </span>
        </div>
      )}
      <div>
        <div className="text-sm font-medium">{userName}</div>
        <div className="text-xs text-gray-500">{userEmail}</div>
      </div>
    </div>
  );
}

export default GmailProfilePhoto;
