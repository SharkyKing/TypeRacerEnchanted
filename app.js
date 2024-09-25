const express = require('express');
const app = express();
const socketio = require('socket.io');
const db = require('./models');
const cors = require('cors')

const {Game, Player} = require('./models');
const { Socket } = require('dgram');

app.use(cors({
    origin: 'http://localhost:3000'  // Replace with your client URL
}));

const expressServer = app.listen(3001, () => {
    console.log('Server is running on port 3001');
});

const io = socketio(expressServer, {
  cors: {
    origin: 'http://localhost:3000',  // Adjust this if needed
    methods: ["GET", "POST"]
  }
});

db.sequelize.sync({ force: true })
    .then(() => {
        console.log('Connected to the database with Sequelize successfully');
    })
    .catch((err) => {
        console.error('Error connecting to the database with Sequelize:', err);
    });

io.on('connect', (socket) => {
    LogInfo(socket, 'CONNECTED');

    //setInterval(() => {
    //    const rooms = io.sockets.adapter.rooms;
    //    rooms.forEach((value, key) => {
    //        console.log(`Room: ${key}, Members: ${[...value].length}`);
    //    });
    //}, 10000);

    socket.on('disconnect', ()=>{
        LogInfo(socket, 'DISCONNECTED');
    })

    socket.on('userInput', async({userInput, gameID})=>{
        try{
            let game = await Game.findByPk(gameID, {
                include: [{ model: Player, as: 'players' }]
            }); 

            if(!game.isOpen && !game.isOver){
                 const player = game.players.find(p => p.socketID === socket.id);
                 let word = game.words.split(" ")[player.currentWordIndex];
                 if(word === userInput){
                    player.currentWordIndex++;
                    console.log(player.currentWordIndex,'---------',game.words.split(" ").length)
                    if(player.currentWordIndex !== game.words.split(" ").length){
                        await player.save(); 
                        await game.save();
                        EmitEvent(socket, io, gameID, 'updateGame',game);
                    }
                    else{
                        let endTime = new Date().getTime();
                        let {startTime} = game;
                        player.WPM = calculateWPM(endTime, startTime, player);
                        await game.save();
                        EmitEvent(socket, io, gameID, 'done',game);
                        EmitEvent(socket, io, gameID, 'updateGame',game);
                    }
                 }
            }
        }catch{
            console.log(err);
        }
    })

    socket.on('timer', async ({ playerID,gameID }) => {
        try {
            let countDown = 5;

            let game = await Game.findByPk(gameID, {
                include: [{ model: Player, as: 'players' }]
            });

            if (!game) {
                LogInfo(socket, `Game with ID ${gameID} not found.`)
                return;
            }

            const player = game.players.find(p => p.id === playerID);
            if (!player) {
                LogInfo(socket, `Player with ID ${playerID} not found.`)
                return;
            }

           if (player.isPartyLeader) {
                const timerID = setInterval(async () => {
                    if (countDown >= 0) {
                        EmitEvent(socket, io, gameID, 'timerClient',{ countDown, msg: "Starting game" });
                        countDown--;
                    } else {
                        game.isOpen = false;
                        await game.save();
                        startGameClock(socket, gameID);
                        EmitEvent(socket, io, gameID, 'updateGame',game);

                        clearInterval(timerID);
                    }
                }, 1000);
        }
        } catch (error) {
            console.error('Error handling timer event:', error);
        }
    });


    socket.on('join-game', async({gameID: _id, nickName})=>{
        try{
            let game = await Game.findByPk(_id, {
                include: [{ model: Player, as: 'players' }]
            });

            if (game && game.isOpen) {
                const gameID = game.id.toString();

                SocketJoinRoom(socket, gameID);
                
                let player = await Player.create({
                    socketID: socket.id,
                    nickName,
                    gameId: game.id 
                });

                game.players.push(player);

                await game.save();

                EmitEvent(socket, io, gameID, 'updateGame',game, sendToSocketToo=true);
            } 
            else 
            {
                socket.emit('error', { message: "Game is closed or doesn't exist." });
            }
        }catch{

        }
    })

    socket.on('create-game', async(nickName)=>{
       try {
        let game = await Game.create({
            words: "VAKAR MAČIAU EŽERA MIŠKO VIDURYJE",
        });

        let player = await Player.create({
            socketID: socket.id,
            isPartyLeader: true,
            nickName,
            gameId: game.id 
        });

        const gameID = game.id.toString();
        SocketJoinRoom(socket, gameID);

        game = await Game.findByPk(gameID, { as: Player });

        EmitEvent(socket, io, gameID, 'updateGame',game, sendToSocketToo=true);
    } catch (error) {
        console.log(error);
    }
    });
});

const EmitEvent = async(socket, io, roomID, eventName, data, sendToSocketToo = false) =>{
    logLine();
    console.log('Emmiting - ', eventName, 'to', roomID);
    io.to(roomID.toString()).emit(eventName.toString(), data);
}

const LogInfo = (socket, actionName) =>{
    logLine();
    console.log(socket.id, actionName)
}

const SocketJoinRoom = (socket, roomID) =>{
    logLine();
    console.log(socket.id, "joining", roomID)
    socket.join(roomID.toString());
}

const logLine = () => {console.log('-------------------------')}

const startGameClock = async (socket, gameID) => {
    try {
        let game = await Game.findByPk(gameID, {
            include: [{ model: Player, as: 'players' }]
        });

        if (!game) {
            console.log(`Game with ID ${gameID} not found.`);
            return;
        }

        game.startTime = new Date().getTime();
        await game.save();

        let time = 180;

        // Timer logic
        const timerID = setInterval(async () => {
            const formattedTime = calculateTime(time);
            if (time >= 0) {
                EmitEvent(socket, io, gameID, 'timerClient', { countDown: formattedTime, msg: "Time remaining" });
                time--;
            } else {
                LogInfo(socket, `Ending game with ID ${gameID}.`);
                clearInterval(timerID);

                let endTime = new Date().getTime();
                game = await Game.findByPk(gameID, {
                    include: [{ model: Player, as: 'players' }]
                });

                game.players.forEach((player, index) => {
                    if (player.WPM === -1) {
                        game.players[index].WPM = calculateWPM(endTime, game.startTime, player);
                    }
                });

                game.isOver = true;
                await game.save();

                EmitEvent(socket, io, gameID, 'updateGame', game);
                clearInterval(timerID);
            }
        }, 1000);

    } catch (error) {
        console.error('Error starting game clock:', error);
    }
};

const calculateWPM = (endTime, startTime, player)=>{
    let numOfWords = player.currentWordIndex;
    const timeInSeconds = (endTime - startTime) / 1000;
    const timeInMinutes = timeInSeconds / 60;
    const WPM = Math.floor(numOfWords/timeInMinutes);
    return WPM;
}

const calculateTime = (time) => {
    let minutes = Math.floor(time / 60);
    let seconds = time % 60;
    return `${minutes}:${seconds < 10 ? "0" + seconds : seconds}`
}

app.get('/', (req, res) => {
    res.send('Hello World!');
});

