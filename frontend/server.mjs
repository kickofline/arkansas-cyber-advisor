// server.mjs
import fs from 'fs';
import path from 'path'
import { createServer } from "node:http";


const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {

    let filePath = req.url === '/' ? './index.html' : `.${req.url}`

    console.log(filePath)

    const extname = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[extname] || 'application/octet-stream'

    
    fs.readFile(filePath, (err, content) => {
        if (err)
            if (err.code === "ENOENT") { res.writeHead(404); res.end("File not found") }
            else { res.writeHead(500); res.end(`Server error: ${err.code}`) }

        // Actually respond with our file
        else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content)
        }
    })
});

// starts a simple http server locally on port 3000
server.listen(3000, '127.0.0.1', () => {
    console.log('Listening on 127.0.0.1:3000');
});
