import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import requests
from pydantic import BaseModel
import base64
import json
import logging
import jwt
import time
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Spotify API credentials
SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = "http://localhost:5000/callback/spotify"

# Apple Music API credentials
APPLE_MUSIC_KEY_ID = os.environ.get("APPLE_MUSIC_KEY_ID")
APPLE_MUSIC_PRIVATE_KEY = os.environ.get("APPLE_MUSIC_PRIVATE_KEY")
APPLE_MUSIC_TEAM_ID = os.environ.get("APPLE_MUSIC_TEAM_ID")

class TransferRequest(BaseModel):
    spotify_token: str
    apple_music_token: str

# Existing route handlers and functions...

async def automatic_transfer():
    logger.info("Starting automatic transfer")
    try:
        spotify_token = await get_spotify_token()
        apple_music_token = generate_apple_music_token()
        
        spotify_tracks = await fetch_spotify_discover_weekly(spotify_token)
        apple_music_playlist = await create_or_update_apple_music_playlist(apple_music_token)
        success = await add_tracks_to_apple_music_playlist(apple_music_token, apple_music_playlist, spotify_tracks)
        
        if success:
            logger.info("Automatic transfer completed successfully")
        else:
            logger.error("Automatic transfer failed")
    except Exception as e:
        logger.error(f"Error during automatic transfer: {str(e)}")

async def get_spotify_token():
    # Implement token refresh logic here
    auth_header = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "grant_type": "client_credentials"
    }
    response = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data)
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception("Failed to get Spotify access token")

async def fetch_spotify_discover_weekly(token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get("https://api.spotify.com/v1/me/playlists", headers=headers)
    playlists = response.json()["items"]
    discover_weekly = next((p for p in playlists if p["name"] == "Discover Weekly"), None)
    
    if not discover_weekly:
        raise HTTPException(status_code=404, detail="Discover Weekly playlist not found")
    
    tracks_response = requests.get(discover_weekly["tracks"]["href"], headers=headers)
    return tracks_response.json()["items"]

async def create_or_update_apple_music_playlist(token):
    # Implement Apple Music API calls to create or update playlist
    # This is a placeholder and needs to be implemented with actual Apple Music API
    return {"id": "apple_music_playlist_id"}

async def add_tracks_to_apple_music_playlist(token, playlist, tracks):
    # Implement Apple Music API calls to add tracks to the playlist
    # This is a placeholder and needs to be implemented with actual Apple Music API
    return True

def generate_apple_music_token():
    private_key = APPLE_MUSIC_PRIVATE_KEY.replace('\\n', '\n')
    headers = {
        'alg': 'ES256',
        'kid': APPLE_MUSIC_KEY_ID
    }
    payload = {
        'iss': APPLE_MUSIC_TEAM_ID,
        'iat': int(time.time()),
        'exp': int(time.time()) + 15777000  # 6 months in seconds
    }
    token = jwt.encode(payload, private_key, algorithm='ES256', headers=headers)
    return token

# Set up the scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(automatic_transfer, trigger=IntervalTrigger(minutes=1))
scheduler.start()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
