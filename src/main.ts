import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'gsap';
import  './style.css';

let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer;
let plane: THREE.Mesh, material: THREE.ShaderMaterial;
let mousePosition = new THREE.Vector2();
let prevMousePosition = new THREE.Vector2();
let ripples: { position: THREE.Vector2; startTime: number; strength: number }[] = [];
const MAX_RIPPLES = 5;
let canvas = document.getElementById('three-canvas') as HTMLCanvasElement | null;
//GUI variable
let shaderParams = {
    waveAmplitude: 0.4,
    waveFrequency: 10.0,
    rippleSpeed: 1.0,
    rippleDecay: 10.0,
    sound: 0.1
};
let bgmNN: THREE.Audio;
let smallBoat: THREE.Object3D = new THREE.Object3D();

function init(): void {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    if (!canvas) {
        throw new Error("Canvas element with id 'three-canvas' not found.");
    }
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    const loader = new GLTFLoader();

    // Optimize model loading
    loader.load('./model/smallBoat.glb', (gltf) => {
        smallBoat = gltf.scene;
        smallBoat.scale.set(.1,.1,.1);
        smallBoat.position.set(-3, 0, .5);

        const amplitude = 3;
        const duration = 3;

        gsap.to(smallBoat.position, {
            x: amplitude,
            duration: duration,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            onUpdate: () => {
                smallBoat.position.y = Math.sin((smallBoat.position.x / amplitude) * Math.PI) * 0.8;

                const t = (Date.now() / 1000) % 1;
                const color = new THREE.Color();
                color.setHSL(t, 0.7, 0.5);

                smallBoat.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        if ((mesh.material as THREE.Material).hasOwnProperty('color')) {
                            (mesh.material as THREE.MeshStandardMaterial).color.copy(color);
                        }
                    }
                });
            }
        });

        
        scene.add(smallBoat);
    });

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(new URL('./assets/textures/mixjue.jpg', import.meta.url).href);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(3, 3, 32, 32);

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0xfafafc) },
            uRipples: { value: [] },
            uTexture: { value: texture },
            uRippleSpeed: { value: shaderParams.rippleSpeed },
            uRippleDecay: { value: shaderParams.rippleDecay },
            uWaveAmplitude: { value: shaderParams.waveAmplitude },
            uWaveFrequency: { value: shaderParams.waveFrequency }
        },
        vertexShader:`
            uniform float uTime;
            uniform vec3 uColor;
            uniform vec4 uRipples[${MAX_RIPPLES}];
            uniform float uRippleSpeed;
            uniform float uRippleDecay;
            uniform float uWaveAmplitude;
            uniform float uWaveFrequency;
            varying vec3 vColor;
            varying vec2 vUv;

            
            void main() {
                // Pass UV coordinates to fragment shader
                vUv = uv;
                // Starting position
                vec3 pos = position;
                
                // Apply ripple effect for each active ripple
                for(int i = 0; i < ${MAX_RIPPLES}; i++) {
                    vec2 ripplePos = uRipples[i].xy;
                    float rippleStartTime = uRipples[i].z;
                    float rippleStrength = uRipples[i].w;
                    
                    if (rippleStrength > 0.0) {
                        float timeSinceRipple = uTime - rippleStartTime;
                        
                        // Calculate distance from vertex to ripple center
                        float distance = distance(vec2(pos.x, pos.y), ripplePos);
                        
                        // Ripple wave speed and decay
                        float rippleProgress = timeSinceRipple * uRippleSpeed;
                        
                        // Circular wave formula
                        float wave = sin(distance * uWaveFrequency - rippleProgress) *
                                    exp(-distance * uRippleDecay) *
                                    rippleStrength;
                        
                        // Apply wave to vertex position along Z axis
                        pos.z += wave * uWaveAmplitude;
                    }
                }
                
                // Calculate color variations based on ripples
                float colorVariation = pos.z * 10.0;
                vColor = vec3(
                    uColor.r + colorVariation * 0.5,
                    uColor.g + colorVariation * 0.3,
                    uColor.b + colorVariation
                );
                
                // Set the position and project to clip space
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader:`
            uniform sampler2D uTexture;
            uniform float uTime;
            varying vec3 vColor;
            varying vec2 vUv;
            
            void main() {
                // Add more dynamic texture distortion based on time
                vec2 rippleUv = vUv;
                
                // Enhanced texture distortion - create swirling effect
                rippleUv.x += sin(rippleUv.y * 10.0 + uTime) * 0.03;
                rippleUv.y += cos(rippleUv.x * 10.0 + uTime) * 0.03;
                
                // Sample the texture using distorted UV coordinates
                vec4 texColor = texture2D(uTexture, rippleUv);
                
                // Create a more dramatic color mix
                vec3 finalColor = texColor.rgb * vColor * 1.2;
                
                // Add highlighting to ripple peaks
                finalColor += pow(vColor, vec3(3.0)) * 0.1;
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        wireframe: false
    });

    plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    const rippleUniforms: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
        rippleUniforms.push(new THREE.Vector4(0, 0, 0, 0));
    }
    material.uniforms.uRipples.value = rippleUniforms;

    // Sound setup
    const listener = new THREE.AudioListener();
    bgmNN = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load('./sound/BGM_Algea.mp3', (buffer) => {
    bgmNN.setBuffer(buffer);
    bgmNN.setLoop(true);
    bgmNN.setVolume(0.1);
    bgmNN.play();
    },
    undefined,
    (error) => {
      console.error('Error loading audio:', error);
    });

    // GUI setup
    const gui = new GUI();
    const waveFolder = gui.title('Values');
    waveFolder.add(shaderParams, 'waveAmplitude', 0, 2, 0.01).name('Wave Amplitude');
    waveFolder.add(shaderParams, 'waveFrequency', 0, 20, 0.01).name('Wave Frequency');
    waveFolder.add(shaderParams, 'rippleSpeed', 0, 5, 0.01).name('Ripple Speed');
    waveFolder.add(shaderParams, 'rippleDecay', 5, 10, 0.01).name('Ripple Decay');
    waveFolder.add(shaderParams, 'sound').min(0.0).max(1.0).step(0.1).onChange(() => {
        bgmNN.setVolume(shaderParams.sound);
    });
    waveFolder.close();

    // เพิ่มฟังก์ชันนี้
function getPlanePositionFromScreen(x: number, y: number): THREE.Vector2 {
    const ndc = new THREE.Vector3(x, y, 0);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const distance = (camera.position.z) / dir.z;
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));
    return new THREE.Vector2(pos.x, pos.y);
}

window.addEventListener('mousemove', (event: MouseEvent) => {
    mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const movementThreshold = 0.02;
    if (prevMousePosition.distanceTo(mousePosition) > movementThreshold) {
        const planePos = getPlanePositionFromScreen(mousePosition.x, mousePosition.y);
        createRipple(planePos.x*-1, planePos.y*-1);
        prevMousePosition.copy(mousePosition);
    }
});

window.addEventListener('touchmove', (event: TouchEvent) => {
    if (event.touches.length > 0) {
        const touch = event.touches[0];
        mousePosition.x = (touch.clientX / window.innerWidth) * 2 - 1;
        mousePosition.y = -(touch.clientY / window.innerHeight) * 2 + 1;

        const movementThreshold = 0.02;
        if (prevMousePosition.distanceTo(mousePosition) > movementThreshold) {
            const planePos = getPlanePositionFromScreen(mousePosition.x, mousePosition.y);
            createRipple(planePos.x*-1, planePos.y*-1);
            prevMousePosition.copy(mousePosition);
        }
    }
});

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
    
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    animate();
}

function createRipple(x: number, y: number): void {
    ripples.push({
        position: new THREE.Vector2(x, y),
        startTime: material.uniforms.uTime.value,
        strength: 1.0
    });

    if (ripples.length > MAX_RIPPLES) {
        ripples.shift();
    }

    updateRippleUniforms();
}

function updateRippleUniforms(): void {
    const uniformRipples = material.uniforms.uRipples.value as THREE.Vector4[];

    for (let i = 0; i < ripples.length; i++) {
        const ripple = ripples[i];
        uniformRipples[i].set(ripple.position.x, ripple.position.y, ripple.startTime, ripple.strength);
    }

    for (let i = ripples.length; i < MAX_RIPPLES; i++) {
        uniformRipples[i].set(0, 0, 0, 0);
    }
}

function animate(): void {
    requestAnimationFrame(animate);

    material.uniforms.uRippleSpeed.value = shaderParams.rippleSpeed;
    material.uniforms.uRippleDecay.value = shaderParams.rippleDecay;
    material.uniforms.uWaveAmplitude.value = shaderParams.waveAmplitude;
    material.uniforms.uWaveFrequency.value = shaderParams.waveFrequency;

    material.uniforms.uTime.value += 0.1;
    renderer.render(scene, camera);
}

init();