import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** 极简静态文件服务器（用于生产环境托管前端构建产物） */
export function serveStatic(dir: string, port: number): void {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = (req.url === '/' ? '/index.html' : req.url ?? '/').split('?')[0];
      const rel = normalize(urlPath).replace(/^([/\\])+/, '');
      const file = join(dir, rel);
      const info = await stat(file);
      if (info.isFile()) {
        const data = await readFile(file);
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
        res.end(data);
        return;
      }
      throw new Error('not a file');
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  server.listen(port, () => {
    console.log(`静态站点：http://localhost:${port}（目录 ${dir}）`);
  });
}
