"""本地开发服务器：和 python3 -m http.server 一样，但禁止浏览器缓存，改完代码刷新即生效。"""

import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=".")
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"MagicPin: http://127.0.0.1:{port}/")
        httpd.serve_forever()
