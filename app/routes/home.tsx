import type { Route } from "./+types/home";
import { Link } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Discover Sync - Spotify to Apple Music" },
    { name: "description", content: "Sync your Spotify playlists to Apple Music" },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-5xl font-bold text-white mb-6">
          Discover Sync
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Sync your Spotify playlists to Apple Music with just a few clicks. 
          Never lose your favorite tracks when switching between platforms.
        </p>
        
        <div className="space-y-4">
          <Link
            to="/dashboard"
            className="inline-block bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-200 transform hover:scale-105"
          >
            Get Started
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-3">Easy Setup</h3>
            <p className="text-gray-300">
              Connect your Spotify and Apple Music accounts in just a few clicks.
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-3">Smart Matching</h3>
            <p className="text-gray-300">
              Advanced algorithms match tracks between platforms with high accuracy.
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-3">Sync History</h3>
            <p className="text-gray-300">
              Keep track of all your syncs and see detailed results for each playlist.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
