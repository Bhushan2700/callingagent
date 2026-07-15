import http.server
import socketserver
import os

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        print(f"Voice UI: http://localhost:{PORT}/index.html")
        print(f"Upload UI: http://localhost:{PORT}/loggix-voice-agent/static/upload.html")
        httpd.serve_forever()

if __name__ == "__main__":
    start_server()
