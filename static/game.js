import * as THREE from "three";
import { io } from "socket.io-client";

// --- scene setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 60);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// ground
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: 0x5d9e4f })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// grid so movement is visible
scene.add(new THREE.GridHelper(40, 20, 0x000000, 0x000000));

// --- player state ---
let myId = null;
let spawned = false;
const spheres = {};  // sid -> THREE.Mesh

function getOrCreate(id, color) {
    if (!spheres[id]) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshLambertMaterial({ color })
        );
        mesh.castShadow = true;
        scene.add(mesh);
        spheres[id] = mesh;
    }
    return spheres[id];
}

// --- socket ---
const socket = io();

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("players", (players) => {
    // add or update spheres
    for (const [id, p] of Object.entries(players)) {
        const mesh = getOrCreate(id, p.color);
        if (id === myId) {
            // only set position on first spawn, then we drive it locally
            if (!spawned) {
                mesh.position.set(p.x, p.y, p.z);
                spawned = true;
            }
        } else {
            // smoothly catch up to server position
            mesh.position.lerp(new THREE.Vector3(p.x, p.y, p.z), 0.15);
        }
    }
    // clean up players who left
    for (const id of Object.keys(spheres)) {
        if (!players[id]) {
            scene.remove(spheres[id]);
            delete spheres[id];
        }
    }
});

// send position at 20hz so we don't spam the server
let dirty = false;
setInterval(() => {
    if (dirty && myId && spheres[myId]) {
        const p = spheres[myId].position;
        socket.emit("move", { x: p.x, y: p.y, z: p.z });
        dirty = false;
    }
}, 50);

// --- input ---
const keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup",   e => keys[e.key.toLowerCase()] = false);

const SPEED = 0.07;
const BOUNDS = 18;

function movePlayer() {
    if (!myId || !spheres[myId] || !spawned) return;
    const me = spheres[myId].position;
    let moved = false;

    if (keys["w"] || keys["arrowup"])    { me.z -= SPEED; moved = true; }
    if (keys["s"] || keys["arrowdown"])  { me.z += SPEED; moved = true; }
    if (keys["a"] || keys["arrowleft"])  { me.x -= SPEED; moved = true; }
    if (keys["d"] || keys["arrowright"]) { me.x += SPEED; moved = true; }

    // stay on the map
    me.x = Math.max(-BOUNDS, Math.min(BOUNDS, me.x));
    me.z = Math.max(-BOUNDS, Math.min(BOUNDS, me.z));
    me.y = 0.5;

    if (moved) dirty = true;
}

function followCamera() {
    if (!myId || !spheres[myId]) return;
    const pos = spheres[myId].position;
    camera.position.set(pos.x, pos.y + 8, pos.z + 12);
    camera.lookAt(pos);
}

// --- resize ---
window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// --- loop ---
function animate() {
    requestAnimationFrame(animate);
    movePlayer();
    followCamera();
    renderer.render(scene, camera);
}
animate();
