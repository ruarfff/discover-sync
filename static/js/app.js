let spotifyToken = null;
let appleMusicToken = null;

console.log('app.js loaded');

async function loginSpotify() {
    console.log('loginSpotify function called');
    try {
        const response = await fetch('/login/spotify');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Redirecting to Spotify login');
        window.location.href = data.auth_url;
    } catch (error) {
        console.error('Error logging in to Spotify:', error);
        alert('Failed to login to Spotify. Please try again.');
    }
}

async function loginAppleMusic() {
    console.log('loginAppleMusic function called');
    try {
        const response = await fetch('/login/apple-music');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        appleMusicToken = data.access_token;
        console.log('Apple Music login successful');
        document.getElementById('appleMusicButton').textContent = 'Logged in to Apple Music';
        document.getElementById('appleMusicButton').disabled = true;
        if (spotifyToken && appleMusicToken) {
            document.getElementById('transferButton').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error logging in to Apple Music:', error);
        alert('Failed to login to Apple Music. Please try again.');
    }
}

async function transferPlaylist() {
    console.log('transferPlaylist function called');
    if (!spotifyToken || !appleMusicToken) {
        console.warn('Attempted to transfer playlist without both tokens');
        alert('Please login to both Spotify and Apple Music first.');
        return;
    }

    const statusElement = document.getElementById('status');
    statusElement.textContent = 'Transferring playlist...';

    try {
        const response = await fetch('/transfer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                spotify_token: spotifyToken,
                apple_music_token: appleMusicToken,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Playlist transfer successful');
        statusElement.textContent = data.message;
    } catch (error) {
        console.error('Error transferring playlist:', error);
        statusElement.textContent = 'Failed to transfer playlist. Please try again.';
    }
}

// Handle Spotify callback
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

console.log('Checking for Spotify callback');

if (code && state === 'spotify') {
    console.log('Spotify callback detected, exchanging code for token');
    fetch(`/callback/spotify?code=${code}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Spotify token received');
            spotifyToken = data.access_token;
            document.getElementById('spotifyButton').textContent = 'Logged in to Spotify';
            document.getElementById('spotifyButton').disabled = true;
            if (spotifyToken && appleMusicToken) {
                document.getElementById('transferButton').classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Error handling Spotify callback:', error);
            alert('Failed to complete Spotify login. Please try again.');
        });
}
