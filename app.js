import Express from 'express'
import Fs from 'fs'
import Http from 'http'
import Morgan from 'morgan'
import { resolve } from 'path'
import mm from 'music-metadata'
import { Server } from 'socket.io'

const app = Express()
const server = Http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*"
    }
})

let library = []



io.on('connection', (socket) => {
    console.log("A User connected");
    
    socket.on('start_diffusion', (roomId) => {
        socket.emit('start_diffusion', {"roomId": roomId})
        console.log(socket.handshake.auth + " a initialisé le Room{ " + roomId + " }");
    })

    socket.on('stop_diffusion', (roomId) => {
        socket.emit('stop_diffusion', {"roomId": roomId})
        console.log(socket.handshake.auth + " a fermé le Room{ " + roomId + " }");
    })

    socket.on('load_music', ({roomId, music}) => {
        socket.emit('load_music', {"roomId": roomId, "music": music})
        console.log(socket.handshake.auth + " a chargé la music " + music + "dans le Room{ " + roomId + " }");
    })

    socket.on('play_music', (roomId) => {
        socket.emit('play_music', {"roomId": roomId})
        console.log(socket.handshake.auth + " a joué la music dans le Room{ " + roomId + " }");
    })

    socket.on('pause_music', (roomId) => {
        socket.emit('pause_music', {"roomId": roomId})
        console.log(socket.handshake.auth + " a mis en pause la music dans le Room{ " + roomId + " }");
    })

    socket.on('disconnected', () => {
        console.log("user disconnected");
    })
})


const directory = resolve('music')

const avatars = [];


Fs.readdir(directory, (err, filePaths) => {
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    }
    // Lister tout les fichier avec forEach
    filePaths.forEach(async (file) => {
        if(file.match(/^[a-z0-9-_ ]+\.(mp3|wav)$/i)){
            try {
                let { common } = await mm.parseFile(resolve('music', file))
                library.push({
                    "title": common.title, 
                    "artist": common.artist,
                    "album": common.album,
                    "year": common.year,
                    "cover": common.picture[0].data,
                    "path": file.split(".")[0]
                })
            } catch (error) {
                console.error(error.message);
            }
        }
    })
})

Fs.readdir(resolve('public'), (err, filePaths) => {
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    }
    filePaths.forEach((file) => {
        if(file.match(/^[a-z0-9-_ ]+\.(png)$/i)){
            avatars.push(file)
            // console.log(file);
        }
    })
})

server.listen(3000, () => {
    console.log("Listening on *:3000");
})



app.use(Morgan('dev'))

app.use(Express.static('public'))

app.get('/', (req, res) => {
    res.sendFile(resolve('dist', 'index.html'))
})

app.get('/api/avatars', (req, res) => {
    res.setHeader('Content-Type', 'text/json')
    res.status(200).send({avatars})
})

app.get('/api/library',async (req, res) => {
    res.setHeader('Content-Type', 'text/json')
    res.status(200).send(library)
})

app.get('/api/meta/:key', async (req, res) => {
    const key = req.params.key 
    try {
        const { common } = await mm.parseFile(resolve('music', key + '.mp3'))
        res.setHeader('Content-Type', 'text/json')
        res.status(200).send({
            "title": common.title, 
            "artist": common.artist,
            "album": common.album,
            "year": common.year,
            "cover": common.picture[0].data["data"]  
        })
    } catch (error) {
        console.error(error.message);
    }
})

app.get('/api/play/:key', (req, res) => {
    const key = req.params.key
    const music = resolve('music', key + '.mp3') 
    const stat = Fs.statSync(music)
    const range = req.headers.range
    let readStream

    if (range !== undefined) {
        const parts = range.replace(/bytes;=/, "").split("-")
        const start_part = parts[0]
        const end_part = parts[1]

        if (
            (isNaN(start_part) && start_part.length > 1) ||
            (isNaN(end_part) && start_part.length > 1)
        ) {
            // Erreur d'encodage des portions de donnée
            return res.sendStatus(500)
        }

        const start = parseInt(start_part, 10)
        const end = end_part ? parseInt(end_part, 10) : stat.size - 1
        const content_length = (end - start) + 1

        res.status(206).header({
            'Content-Type': 'audio/mpeg',
            'Content-Length': content_length,
            'Content-Range': "bytes " + start + "-" + end + "/" + stat.size
        })

        readStream = Fs.createReadStream(music, {start, end})
    } else {
        res.header({
            'Content-Type': 'audio/mpeg',
            'Content-Length': stat.size
        })
        readStream = Fs.createReadStream(music)
    }
    readStream.pipe(res)    
})