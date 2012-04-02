var fs = require('fs')
  , io = require('socket.io')
, http = require('http');

var paths = {
	'/': 'index.html',
}
var path_cache = {};
fs.readdir('./', function(err, files) {
	if (err) {
		process.stderr.write(err + "\n");
	}
	var c = files.length;
	for (var i = 0; i < c; i++) {
		paths['/' + files[i]] = files[i];
	}
});

var TILE = {
	NOTHING: 0,
	WALL: 1,
	FLOOR: 2,
	BOX: 6,
	TARGET: 10,
	PLAYER1: 18,
	PLAYER2: 34,
	PLAYER3: 66,
	PLAYER4: 130,
}

var map = [
	[TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL , ],
	[TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.WALL , TILE.PLAYER4, TILE.FLOOR, TILE.FLOOR, TILE.WALL , ],
	[TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.WALL , TILE.BOX  , TILE.FLOOR, TILE.FLOOR, TILE.WALL , ],
	[TILE.NOTHING, TILE.NOTHING, TILE.WALL   , TILE.WALL   , TILE.WALL , TILE.FLOOR, TILE.FLOOR, TILE.BOX  , TILE.WALL , TILE.WALL , ],
	[TILE.NOTHING, TILE.NOTHING, TILE.WALL   , TILE.FLOOR  , TILE.FLOOR, TILE.BOX  , TILE.FLOOR, TILE.BOX  , TILE.FLOOR, TILE.WALL , ],
	[TILE.WALL   , TILE.WALL   , TILE.WALL   , TILE.FLOOR  , TILE.WALL , TILE.FLOOR, TILE.WALL , TILE.WALL , TILE.FLOOR, TILE.WALL , TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL  , TILE.WALL  , TILE.WALL],
	[TILE.WALL   , TILE.FLOOR  , TILE.FLOOR  , TILE.FLOOR  , TILE.WALL , TILE.FLOOR, TILE.WALL , TILE.WALL , TILE.FLOOR, TILE.WALL , TILE.WALL   , TILE.WALL   , TILE.WALL   , TILE.WALL , TILE.FLOOR, TILE.FLOOR, TILE.TARGET, TILE.TARGET, TILE.WALL],
	[TILE.WALL   , TILE.FLOOR  , TILE.BOX    , TILE.FLOOR  , TILE.FLOOR, TILE.BOX  , TILE.FLOOR, TILE.FLOOR, TILE.FLOOR, TILE.FLOOR, TILE.FLOOR  , TILE.FLOOR  , TILE.FLOOR  , TILE.FLOOR, TILE.FLOOR, TILE.FLOOR, TILE.TARGET, TILE.TARGET, TILE.WALL],
	[TILE.WALL   , TILE.WALL   , TILE.WALL   , TILE.WALL   , TILE.WALL , TILE.FLOOR, TILE.WALL , TILE.WALL , TILE.WALL , TILE.FLOOR, TILE.WALL   , TILE.PLAYER1 , TILE.WALL   , TILE.WALL , TILE.FLOOR, TILE.PLAYER3, TILE.TARGET, TILE.TARGET, TILE.WALL],
	[TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.WALL , TILE.PLAYER2, TILE.FLOOR, TILE.FLOOR, TILE.FLOOR, TILE.FLOOR, TILE.WALL   , TILE.WALL   , TILE.WALL   , TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL  , TILE.WALL  , TILE.WALL],
	[TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.NOTHING, TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL , TILE.WALL, ],
];

var boxes = [];
var players = [];
var queue = [];
players.serialize = function() {
	var _players = [];
	var c = this.length;
	for (var i = 0; i < c; i++) {
		_players[i] = {
			x: this[i].x,
			y: this[i].y,
			id: this[i].id,
		};
	}
	return _players;
}

var broadcast = function (event, param) {
	var i, c = players.length;
	for (i = 0; i < c; i++) {
		players[i].socket.emit(event, param);
	}
	c = queue.length;
	for (i = 0; i < c; i++) {
		queue[i].emit(event, param);
	}
}
var Player = function() {}
Player.prototype = {
	isValidMove: function(dx, dy) {
		if (map[this.y+dy][this.x+dx] == TILE.NOTHING || map[this.y+dy][this.x+dx] == TILE.WALL) {
			return false;
		}
		var c = boxes.length;
		var hasBox = false, hasSecondBox = false;
		for (var i = 0; i < c; i++) {
			if (hasBox == false && boxes[i].x == this.x+dx && boxes[i].y == this.y+dy) {
				if ((map[this.y+dy*2][this.x+dx*2] & TILE.FLOOR) != TILE.FLOOR) {
					return false;
				}
				hasBox = true;
			}
			if (boxes[i].x == this.x+dx*2 && boxes[i].y == this.y+dy*2) {
				hasSecondBox = true;
			}
		}
		c = players.length;
		for (var i = 0; i < c; i++) {
			if (players[i].x == this.x+dx && players[i].y == this.y+dy) {
				return false;
			}

			if (players[i].x == this.x+dx*2 && players[i].y == this.y+dy*2) {
				hasSecondBox = true;
			}
		}
		if (hasBox && hasSecondBox) return false;
		return true;
	},
	move: function(dx, dy) {
		if (!this.isValidMove(dx, dy)) return false;
		var won = false;
		var c = boxes.length;
		for (var i = 0; i < c; i++) {
			var box = boxes[i];
			if (box.x == this.x+dx && box.y == this.y+dy) {
				box.x += dx;
				box.y += dy;
				won = true;
				for (i = 0; i < c; i++) {
					box = boxes[i];
					if (map[box.y][box.x] != TILE.TARGET) {
						won = false;
						break;
					}
				}
				broadcast('boxes', boxes);
				break;
			}
		}
		this.x += dx; this.y += dy;
		if (won) {
			broadcast('won');
		}
		return true;
	}
}


var server = http.createServer(function(req, res) {
	if (paths[req.url]) {
		if (path_cache[req.url]) {
			res.end(path_cache[req.url]);
		}
		fs.readFile(paths[req.url], function (err, data) {
			if (err) {
				res.writeHead(500);
				return res.end('Error loading index.html')
			}
			//path_cache[req.url] = data;
			res.end(data);
		})
	} else {
		res.writeHead(404);
		res.end();
	}
});

io = io.listen(server);
server.listen(process.env.PORT || 8081);

io.sockets.on('connection', function (socket) {
	socket.on('disconnect', function () {
		var c = players.length;
		for (var i = 0; i < c; i++) {
			if (players[i].socket == socket) {
				if (queue.length > 0) {
					players[i].socket = queue[0];
					queue[0].emit('playerid', players[i].id);
					queue.splice(0, 1);
				} else {
					players.splice(i, 1);
				}
				break;
			}
		}
		if (queue.indexOf(socket) != -1) {
			queue.splice(queue.indexOf(socket), 1);
		}
	});
	socket.on('move', function(d) {
		var dx = d[0], dy = d[1];
		var c = players.length;
		var ok = false;
		for (var i = 0; i < c; i++) {
			if (players[i].socket == socket) {
				ok = players[i].move(dx, dy);
				break;
			}
		}
		if (ok)
			broadcast('players', players.serialize());
	});
	if (players.length == 4) {
		queue.push(socket);
		socket.emit('playerid', -1);
	} else {
		var player = new Player();
		player.socket = socket;
		if (players.length > 0)
			player.id = players[players.length-1].id + 1;
		else
			player.id = 1;

		socket.emit('playerid', player.id);

		var target;
		switch (player.id % 4) {
			case 0: target = TILE.PLAYER1; break;
			case 1: target = TILE.PLAYER2; break;
			case 2: target = TILE.PLAYER3; break;
			case 3: target = TILE.PLAYER4; break;
		}
		var c = map.length;
		for (var i = 0; i < c; i++) {
			var d = map[i].length;
			for (var j = 0; j < d; j++) {
				if (map[i][j] == target) {
					player.x = j;
					player.y = i;
					i = c;
					break;
				}
			}
		}
		players.push(player);
	}

	if (boxes.length == 0) {
		var c = map.length;
		for (var i = 0; i < c; i++) {
			var d = map[i].length;
			for (var j = 0; j < d; j++) {
				if (map[i][j] == TILE.BOX) {
					boxes.push({
						x: j,
						y: i,
						id: boxes.length+1
					});
				}
			}
		}
	}
	socket.emit('map', map);
	socket.emit('boxes', boxes);
	var c = players.length;
	broadcast('players', players.serialize());
});

