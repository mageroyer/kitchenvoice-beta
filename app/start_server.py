#!/usr/bin/env python3
"""
Simple HTTP Server for Kitchen Recipe Manager
Starts a local web server so voice input works properly
"""

import http.server
import socketserver
import webbrowser
import os
from pathlib import Path

PORT = 8000
DIRECTORY = Path(__file__).parent

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def end_headers(self):
        # Add headers for better compatibility
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

def main():
    print("=" * 60)
    print("Kitchen Recipe Manager - Local Web Server")
    print("=" * 60)
    print()

    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        url = f"http://localhost:{PORT}/recipe-manager-voice.html"

        print(f"Server running on port {PORT}")
        print(f"Serving files from: {DIRECTORY}")
        print()
        print(f"Open this URL in your browser:")
        print(f"   {url}")
        print()
        print("Voice input will work when accessed via localhost!")
        print()
        print("IMPORTANT: Use Chrome or Edge browser for best results")
        print()
        print("Press Ctrl+C to stop the server")
        print("=" * 60)
        print()

        # Try to open browser automatically
        try:
            print("Opening browser automatically...")
            webbrowser.open(url)
        except:
            print("Could not open browser automatically. Please open manually.")

        print()
        print("Server is running... waiting for requests...")
        print()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
            print("=" * 60)
            print("Server stopped. Goodbye!")
            print("=" * 60)

if __name__ == "__main__":
    main()
