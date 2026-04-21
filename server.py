from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import random
import colorsys
import threading
import time
import math

app = Flask(__name__)
app.config["SECRET_KEY"] = "secret!"
socketio = SocketIO(app, cors_allowed_origins="*")

players = {}
foods = {}

FOOD_COUNT = 12
MAP_BOUNDS = 18
FOOD_FALL_SPEED = 0.08
FOOD_RESPAWN_HEIGHT = 12


def rand_color():
    r, g, b = colorsys.hsv_to_rgb(random.random(), 0.75, 0.9)
    return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(b * 255))


def create_food(food_id):
    foods[food_id] = {
        "id": food_id,
        "x": random.uniform(-MAP_BOUNDS, MAP_BOUNDS),
        "y": random.uniform(6, FOOD_RESPAWN_HEIGHT),
        "z": random.uniform(-MAP_BOUNDS, MAP_BOUNDS),
        "size": random.uniform(0.25, 0.45),
    }


@app.route("/")
def index():
    return render_template("index.html")


@socketio.on("connect")
def on_connect():
    players[request.sid] = {
        "x": random.uniform(-8, 8),
        "y": 0.6,
        "z": random.uniform(-8, 8),
        "color": rand_color(),
        "radius": 0.6,
        "score": 0,
    }
    emit("state", {"players": players, "foods": foods}, broadcast=True)


@socketio.on("disconnect")
def on_disconnect():
    players.pop(request.sid, None)
    emit("state", {"players": players, "foods": foods}, broadcast=True)


@socketio.on("move")
def on_move(data):
    if request.sid in players:
        players[request.sid]["x"] = data.get("x", players[request.sid]["x"])
        players[request.sid]["y"] = data.get("y", players[request.sid]["y"])
        players[request.sid]["z"] = data.get("z", players[request.sid]["z"])
        emit("state", {"players": players, "foods": foods}, broadcast=True)


def game_loop():
    while True:
        # move foods downward
        for food in foods.values():
            food["y"] -= FOOD_FALL_SPEED

            if food["y"] < food["size"] * 0.5:
                food["x"] = random.uniform(-MAP_BOUNDS, MAP_BOUNDS)
                food["y"] = random.uniform(8, FOOD_RESPAWN_HEIGHT)
                food["z"] = random.uniform(-MAP_BOUNDS, MAP_BOUNDS)
                food["size"] = random.uniform(0.25, 0.45)

        # collision: player eats food
        for sid, player in players.items():
            px, py, pz = player["x"], player["y"], player["z"]
            pr = player["radius"]

            for food in foods.values():
                dx = px - food["x"]
                dy = py - food["y"]
                dz = pz - food["z"]
                dist = math.sqrt(dx * dx + dy * dy + dz * dz)

                if dist < (pr + food["size"]):
                    player["score"] += 1
                    player["radius"] += 0.08

                    food["x"] = random.uniform(-MAP_BOUNDS, MAP_BOUNDS)
                    food["y"] = random.uniform(8, FOOD_RESPAWN_HEIGHT)
                    food["z"] = random.uniform(-MAP_BOUNDS, MAP_BOUNDS)
                    food["size"] = random.uniform(0.25, 0.45)

        socketio.emit("state", {"players": players, "foods": foods})
        time.sleep(0.05)


if __name__ == "__main__":
    for i in range(FOOD_COUNT):
        create_food(f"food_{i}")

    threading.Thread(target=game_loop, daemon=True).start()
    socketio.run(app, debug=True, port=5000)