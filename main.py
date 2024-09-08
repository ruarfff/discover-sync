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

@app.get("/")
async def read_root(request: Request):
    logger.info(f"Accessing root route. Headers: {request.headers}")
    try:
        response = templates.TemplateResponse("index.html", {"request": request})
        logger.info("Successfully rendered index.html")
        return response
    except Exception as e:
        logger.error(f"Error rendering index.html: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    try:
        return StaticFiles(directory="static").get_response(file_path)
    except Exception as e:
        logger.error(f"Error serving static file {file_path}: {str(e)}")
        raise HTTPException(status_code=404, detail="File not found")

@app.get("/health")
async def health_check():
    return JSONResponse(content={"status": "healthy"})

@app.get("/login/spotify")
async def login_spotify():
    scope = "playlist-read-private"
    auth_url = f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={SPOTIFY_REDIRECT_URI}&scope={scope}&state=spotify"
    logger.info(f"Generated Spotify auth URL: {auth_url}")
    return JSONResponse(content={"auth_url": auth_url})

@app.get("/login/apple-music")
async def login_apple_music():
    # Generate a developer token for Apple Music API
    token = generate_apple_music_token()
    
    # In a real-world scenario, you'd redirect to Apple's authentication page
    # For this prototype, we'll simulate the login by directly returning the token
    logger.info("Simulating Apple Music login")
    return JSONResponse(content={"access_token": token})

@app.get("/callback/spotify")
async def spotify_callback(code: str):
    logger.info(f"Received Spotify callback with code: {code}")
    # Exchange code for access token
    token_url = "https://accounts.spotify.com/api/token"
    auth_header = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": SPOTIFY_REDIRECT_URI
    }
    response = requests.post(token_url, headers=headers, data=data)
    if response.status_code == 200:
        logger.info("Successfully obtained Spotify access token")
        return JSONResponse(content=response.json())
    else:
        logger.error(f"Failed to get Spotify access token. Status code: {response.status_code}, Response: {response.text}")
        raise HTTPException(status_code=400, detail="Failed to get Spotify access token")

@app.post("/transfer")
async def transfer_playlist(request: TransferRequest):
    # Fetch Discover Weekly playlist from Spotify
    spotify_tracks = fetch_spotify_discover_weekly(request.spotify_token)
    
    # Create or update Apple Music playlist
    apple_music_playlist = create_or_update_apple_music_playlist(request.apple_music_token)
    
    # Add tracks to Apple Music playlist
    success = add_tracks_to_apple_music_playlist(request.apple_music_token, apple_music_playlist, spotify_tracks)
    
    if success:
        return JSONResponse(content={"message": "Playlist transferred successfully"})
    else:
        raise HTTPException(status_code=500, detail="Failed to transfer playlist")

def fetch_spotify_discover_weekly(token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get("https://api.spotify.com/v1/me/playlists", headers=headers)
    playlists = response.json()["items"]
    discover_weekly = next((p for p in playlists if p["name"] == "Discover Weekly"), None)
    
    if not discover_weekly:
        raise HTTPException(status_code=404, detail="Discover Weekly playlist not found")
    
    tracks_response = requests.get(discover_weekly["tracks"]["href"], headers=headers)
    return tracks_response.json()["items"]

def create_or_update_apple_music_playlist(token):
    # Implement Apple Music API calls to create or update playlist
    # This is a placeholder and needs to be implemented with actual Apple Music API
    return {"id": "apple_music_playlist_id"}

def add_tracks_to_apple_music_playlist(token, playlist, tracks):
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
